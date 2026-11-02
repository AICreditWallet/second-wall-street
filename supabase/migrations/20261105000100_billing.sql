-- Phase 6: paid offices with Stripe.
-- Free tier: one standard office with 1 agent. Premium and landmark offices:
-- £9.99/month or £59.99 once. Stripe is the source of truth for payments;
-- the database only changes through the functions below, which the server calls
-- after verifying Stripe's signed webhooks. Browsers can read their own
-- purchases and nothing else.

alter table public.office_plans add column lifetime_price_minor int check (lifetime_price_minor is null or lifetime_price_minor >= 0);

update public.office_plans set max_agents = 1, description = 'Free office for every verified developer, with 1 agent.' where tier = 'standard';
update public.office_plans set monthly_price_minor = 999, lifetime_price_minor = 5999, currency = 'gbp', active = true,
  description = 'High-visibility office with up to 10 agents.' where tier = 'premium';
update public.office_plans set monthly_price_minor = 999, lifetime_price_minor = 5999, currency = 'gbp', active = true,
  description = 'Signature tower office with up to 25 agents.' where tier = 'landmark';

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);

create table public.office_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  office_id text not null references public.offices (id),
  kind text not null check (kind in ('monthly', 'lifetime')),
  -- conflict = paid but the office could not be given (refund manually; audited).
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled', 'expired', 'refunded', 'conflict')),
  amount_minor int not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  stripe_checkout_session_id text unique check (stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  stripe_subscription_id text unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_payment_intent_id text check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
-- An office can be held by at most one unfinished or paid purchase.
create unique index office_purchases_one_live on public.office_purchases (office_id) where status in ('pending', 'active', 'past_due');
create index office_purchases_user_idx on public.office_purchases (user_id, created_at desc);
create trigger office_purchases_touch before update on public.office_purchases for each row execute function public.touch_updated_at();

-- Webhook de-duplication: Stripe may deliver an event more than once.
create table public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
alter table public.office_purchases enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.billing_customers, public.office_purchases, public.stripe_events from anon, authenticated;
grant select on public.office_purchases to authenticated;
grant select on public.billing_customers to authenticated;
grant select, insert, update on public.billing_customers, public.office_purchases, public.stripe_events to service_role;
create policy "own purchases" on public.office_purchases for select using (user_id = auth.uid());
create policy "own customer" on public.billing_customers for select using (user_id = auth.uid());

-- ---------------------------------------------------------------- helpers
-- Frees offices whose checkout was abandoned (Stripe sessions last 30 minutes).
create function public.billing_release_stale() returns void
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  for p in select id, office_id from public.office_purchases where status = 'pending' and expires_at < now() for update skip locked loop
    update public.office_purchases set status = 'expired', ended_at = now() where id = p.id;
    update public.offices set status = 'available' where id = p.office_id and status = 'reserved';
  end loop;
end $$;

-- Ends a purchase and returns its office to the market.
create function public.billing_end(p_purchase uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.office_purchases%rowtype;
begin
  select * into v from public.office_purchases where id = p_purchase for update;
  if not found or v.status in ('canceled', 'expired', 'refunded') then return; end if;
  update public.office_purchases set status = p_status, ended_at = now() where id = v.id;
  update public.offices set status = 'available', organization_id = null
    where id = v.office_id and ((status = 'occupied' and organization_id = v.organization_id) or status = 'reserved');
  update public.office_claims set released_at = now(), release_reason = p_reason
    where office_id = v.office_id and organization_id = v.organization_id and released_at is null;
  perform public.audit('billing.end', 'office', v.office_id, jsonb_build_object('purchase', v.id, 'status', p_status, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------- start a purchase (signed-in user)
create function public.start_office_purchase(
  p_office_id text,
  p_kind text,
  p_org_name text default null,
  p_org_slug text default null,
  p_org_tagline text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_verified_user();
  v_office public.offices%rowtype;
  v_plan public.office_plans%rowtype;
  v_org public.organizations%rowtype;
  v_amount int;
  v_id uuid;
begin
  if p_kind not in ('monthly', 'lifetime') then raise exception 'invalid_plan'; end if;
  perform public.enforce_rate_limit(uid, 'billing.', 10, interval '1 day');
  perform public.billing_release_stale();

  -- Starting a new checkout abandons this person's previous unfinished one.
  update public.offices o set status = 'available'
    from public.office_purchases p
    where p.user_id = uid and p.status = 'pending' and o.id = p.office_id and o.status = 'reserved';
  update public.office_purchases set status = 'expired', ended_at = now() where user_id = uid and status = 'pending';

  select * into v_office from public.offices where id = p_office_id for update;
  if not found then raise exception 'office_not_found'; end if;
  if v_office.status <> 'available' then raise exception 'office_unavailable'; end if;
  select * into v_plan from public.office_plans where tier = v_office.tier;
  if v_office.tier = 'standard' or not coalesce(v_plan.active, false) then raise exception 'office_not_for_sale'; end if;
  v_amount := case p_kind when 'monthly' then v_plan.monthly_price_minor else v_plan.lifetime_price_minor end;
  if v_amount is null or v_plan.currency is null then raise exception 'office_not_for_sale'; end if;

  select o.* into v_org from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where m.user_id = uid and m.role = 'owner' order by o.created_at limit 1;
  if not found then
    if p_org_name is null or p_org_slug is null then raise exception 'organization_details_required'; end if;
    if exists (select 1 from public.reserved_slugs r where r.slug = lower(p_org_slug)) then raise exception 'slug_reserved'; end if;
    begin
      insert into public.organizations (slug, name, tagline, created_by)
      values (lower(btrim(p_org_slug)), btrim(p_org_name), coalesce(btrim(p_org_tagline), ''), uid)
      returning * into v_org;
    exception
      when unique_violation then raise exception 'slug_taken';
      when check_violation then raise exception 'organization_invalid';
    end;
    insert into public.organization_members (organization_id, user_id, role) values (v_org.id, uid, 'owner');
    perform public.audit('org.create', 'organization', v_org.id::text, jsonb_build_object('slug', v_org.slug));
  end if;
  if v_org.status <> 'active' then raise exception 'organization_suspended'; end if;

  insert into public.office_purchases (user_id, organization_id, office_id, kind, amount_minor, currency, expires_at)
    values (uid, v_org.id, v_office.id, p_kind, v_amount, v_plan.currency, now() + interval '31 minutes')
    returning id into v_id;
  update public.offices set status = 'reserved' where id = v_office.id;
  perform public.audit('billing.start', 'office', v_office.id, jsonb_build_object('purchase', v_id, 'kind', p_kind));

  return jsonb_build_object('purchase_id', v_id, 'organization_id', v_org.id, 'organization_slug', v_org.slug,
    'office_id', v_office.id, 'tier', v_office.tier, 'amount_minor', v_amount, 'currency', v_plan.currency);
end $$;

-- Lets the person back out of their own unfinished checkout.
create function public.cancel_office_purchase(p_purchase uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (select 1 from public.office_purchases where id = p_purchase and user_id = uid and status = 'pending') then return; end if;
  perform public.billing_end(p_purchase, 'expired', 'checkout_abandoned');
end $$;

-- ---------------------------------------------------------------- called by the server after verifying Stripe
create function public.billing_attach_session(p_purchase uuid, p_session text) returns void
language sql security definer set search_path = '' as $$
  update public.office_purchases set stripe_checkout_session_id = p_session where id = p_purchase and status = 'pending';
$$;

create function public.billing_record_event(p_id text, p_type text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stripe_events (id, type) values (p_id, p_type);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Payment confirmed: hand over the office. Idempotent.
create function public.billing_activate(
  p_session text,
  p_customer text,
  p_subscription text,
  p_payment_intent text,
  p_period_end timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.office_purchases%rowtype;
  v_office public.offices%rowtype;
begin
  select * into v from public.office_purchases where stripe_checkout_session_id = p_session for update;
  if not found then raise exception 'purchase_not_found'; end if;
  if v.status in ('active', 'past_due', 'conflict') then return v.status; end if;
  if p_customer is not null and v.user_id is not null then
    insert into public.billing_customers (user_id, stripe_customer_id) values (v.user_id, p_customer) on conflict do nothing;
  end if;

  select * into v_office from public.offices where id = v.office_id for update;
  if v.status <> 'pending' or v_office.status <> 'reserved' or v.organization_id is null then
    -- Paid after the reservation lapsed and someone else took the office: never take it from them.
    update public.office_purchases set status = 'conflict', stripe_subscription_id = p_subscription,
      stripe_payment_intent_id = p_payment_intent where id = v.id;
    perform public.audit('billing.conflict', 'office', v.office_id, jsonb_build_object('purchase', v.id));
    return 'conflict';
  end if;

  update public.offices set status = 'occupied', organization_id = v.organization_id where id = v.office_id;
  insert into public.office_claims (office_id, organization_id, claimed_by) values (v.office_id, v.organization_id, v.user_id);
  if v.user_id is not null then
    insert into public.user_roles (user_id, role) values (v.user_id, 'office_owner') on conflict do nothing;
  end if;
  update public.office_purchases set status = 'active', stripe_subscription_id = p_subscription,
    stripe_payment_intent_id = p_payment_intent, current_period_end = p_period_end where id = v.id;
  perform public.audit('billing.activate', 'office', v.office_id, jsonb_build_object('purchase', v.id, 'kind', v.kind));
  return 'active';
end $$;

create function public.billing_session_expired(p_session text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.office_purchases where stripe_checkout_session_id = p_session and status = 'pending';
  if v_id is not null then perform public.billing_end(v_id, 'expired', 'checkout_expired'); end if;
end $$;

-- Mirrors a Stripe subscription's state. Ends the office only when Stripe ends the subscription.
create function public.billing_subscription_changed(p_subscription text, p_status text, p_period_end timestamptz, p_cancel_at_period_end boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.office_purchases%rowtype;
begin
  select * into v from public.office_purchases where stripe_subscription_id = p_subscription for update;
  if not found or v.status not in ('active', 'past_due') then return; end if;
  if p_status in ('canceled', 'incomplete_expired') then
    perform public.billing_end(v.id, 'canceled', 'subscription_ended');
  else
    update public.office_purchases
      set status = case when p_status in ('past_due', 'unpaid') then 'past_due' else 'active' end,
          current_period_end = coalesce(p_period_end, current_period_end),
          cancel_at_period_end = coalesce(p_cancel_at_period_end, false)
      where id = v.id;
  end if;
end $$;

-- A refunded one-time payment returns the office.
create function public.billing_refunded(p_payment_intent text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.office_purchases where stripe_payment_intent_id = p_payment_intent and kind = 'lifetime' and status in ('active', 'conflict');
  if v_id is not null then perform public.billing_end(v_id, 'refunded', 'payment_refunded'); end if;
end $$;

-- Paid offices are given up through billing (cancel), never by a direct release.
create or replace function public.release_office(p_office_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_verified_user();
  v_office public.offices%rowtype;
begin
  perform public.enforce_rate_limit(uid, 'office.', 10, interval '1 day');
  select * into v_office from public.offices where id = p_office_id for update;
  if not found then
    raise exception 'office_not_found';
  end if;
  if v_office.status <> 'occupied'
     or not exists (
       select 1 from public.organization_members m
       where m.organization_id = v_office.organization_id and m.user_id = uid and m.role in ('owner', 'admin')
     ) then
    raise exception 'not_office_owner';
  end if;
  if exists (select 1 from public.office_purchases where office_id = v_office.id and status in ('active', 'past_due')) then
    raise exception 'paid_office_use_billing';
  end if;

  update public.offices set status = 'available', organization_id = null where id = v_office.id;
  update public.office_claims set released_at = now(), release_reason = 'released_by_owner'
    where office_id = v_office.id and released_at is null;
  perform public.audit('office.release', 'office', v_office.id, jsonb_build_object('organization_id', v_office.organization_id));
end $$;

revoke all on function public.billing_release_stale() from public, anon, authenticated;
revoke all on function public.billing_end(uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_attach_session(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_record_event(text, text) from public, anon, authenticated;
revoke all on function public.billing_activate(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_session_expired(text) from public, anon, authenticated;
revoke all on function public.billing_subscription_changed(text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.billing_refunded(text) from public, anon, authenticated;
grant execute on function public.billing_attach_session(uuid, text), public.billing_record_event(text, text),
  public.billing_activate(text, text, text, text, timestamptz), public.billing_session_expired(text),
  public.billing_subscription_changed(text, text, timestamptz, boolean), public.billing_refunded(text),
  public.billing_release_stale() to service_role;

revoke all on function public.start_office_purchase(text, text, text, text, text) from public, anon;
revoke all on function public.cancel_office_purchase(uuid) from public, anon;
grant execute on function public.start_office_purchase(text, text, text, text, text) to authenticated;
grant execute on function public.cancel_office_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------- admin and moderation
create policy "admins read all purchases" on public.office_purchases for select using (public.is_admin());

create function public.resolve_report(p_report uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'not_moderator'; end if;
  if p_status not in ('reviewing', 'actioned', 'dismissed') then raise exception 'invalid_status'; end if;
  update public.moderation_reports set status = p_status where id = p_report;
  perform public.audit('report.' || p_status, 'report', p_report::text, '{}');
end $$;

-- Suspending hides an agent from the public directory and city; lifting it returns it to "in development".
create function public.set_agent_suspended(p_agent text, p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.agents
    set status = case when p_suspended then 'suspended'::public.agent_status else 'in-development'::public.agent_status end,
        published = case when p_suspended then false else published end
    where id = p_agent;
  perform public.audit(case when p_suspended then 'agent.suspend' else 'agent.unsuspend' end, 'agent', p_agent, '{}');
end $$;

revoke all on function public.resolve_report(uuid, text) from public, anon;
revoke all on function public.set_agent_suspended(text, boolean) from public, anon;
grant execute on function public.resolve_report(uuid, text) to authenticated;
grant execute on function public.set_agent_suspended(text, boolean) to authenticated;
