-- Phase 3: agent marketplace. Additive: no existing rows change.
-- Office owners register agents; connection secrets live in Supabase Vault;
-- health checks are written only by the server; reviews are one per person.

-- ---------------------------------------------------------------- agents: owner writes
-- Owners/admins of an organisation manage its agents. Only these columns are writable.
grant insert (slug, organization_id, name, category, summary, capabilities, disclosure, status, published) on public.agents to authenticated;
grant update (name, category, summary, capabilities, disclosure, status, published) on public.agents to authenticated;
grant delete on public.agents to authenticated;

create policy "org owners add agents" on public.agents for insert to authenticated
  with check (public.is_org_member(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "org owners edit agents" on public.agents for update to authenticated
  using (public.is_org_member(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.is_org_member(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "org owners delete agents" on public.agents for delete to authenticated
  using (public.is_org_member(organization_id, array['owner', 'admin']::public.member_role[]));

-- Moderator check usable inside policies by any role (like is_admin()).
create function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('moderator', 'admin'));
$$;
revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to anon, authenticated;

-- ---------------------------------------------------------------- connections (private)
create table public.agent_connections (
  agent_id text primary key references public.agents (id) on delete cascade,
  endpoint_url text not null check (endpoint_url ~ '^https://[^\s/?#:@]+(/[^\s]*)?$' and char_length(endpoint_url) <= 300),
  health_url text check (health_url is null or (health_url ~ '^https://[^\s/?#:@]+(/[^\s]*)?$' and char_length(health_url) <= 300)),
  openapi_url text check (openapi_url is null or (openapi_url ~ '^https://[^\s/?#:@]+(/[^\s]*)?$' and char_length(openapi_url) <= 300)),
  auth_scheme text not null default 'none' check (auth_scheme in ('none', 'bearer')),
  -- Reference into vault.secrets; the token itself never lives in this table.
  secret_id uuid,
  input_schema jsonb not null default '{"type":"object"}' check (jsonb_typeof(input_schema) = 'object' and pg_column_size(input_schema) < 16384),
  output_schema jsonb not null default '{"type":"object"}' check (jsonb_typeof(output_schema) = 'object' and pg_column_size(output_schema) < 16384),
  updated_at timestamptz not null default now()
);
create trigger agent_connections_touch before update on public.agent_connections for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- health checks (server-written)
create table public.agent_health_checks (
  id bigint generated always as identity primary key,
  agent_id text not null references public.agents (id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status_code int,
  latency_ms int,
  error text check (error is null or char_length(error) <= 300)
);
create index agent_health_checks_agent_idx on public.agent_health_checks (agent_id, checked_at desc);

-- ---------------------------------------------------------------- reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  agent_id text references public.agents (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  owner_response text check (owner_response is null or char_length(btrim(owner_response)) between 2 and 1000),
  owner_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_target check ((agent_id is null) <> (organization_id is null))
);
-- One review per person per agent / organisation.
create unique index reviews_one_per_agent on public.reviews (author_id, agent_id) where agent_id is not null;
create unique index reviews_one_per_org on public.reviews (author_id, organization_id) where organization_id is not null;
create index reviews_agent_idx on public.reviews (agent_id, created_at desc);
create index reviews_org_idx on public.reviews (organization_id, created_at desc);
create trigger reviews_touch before update on public.reviews for each row execute function public.touch_updated_at();

-- Public aggregates (respects the reviews table's RLS: only published rows count).
create view public.review_stats with (security_invoker = true) as
  select coalesce(agent_id, organization_id::text) as target_id,
         case when agent_id is not null then 'agent' else 'organization' end as target_type,
         count(*)::int as review_count,
         round(avg(rating)::numeric, 2) as average_rating
  from public.reviews where status = 'published'
  group by 1, 2;

-- ---------------------------------------------------------------- integrity triggers
-- Plan limits, honest "live" status, and suspension that only staff can lift.
create function public.guard_agent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations%rowtype;
  v_limit int;
  v_count int;
begin
  select * into v_org from public.organizations where id = new.organization_id;
  if tg_op = 'INSERT' and v_org.operator = 'community' then
    select coalesce(max(p.max_agents), 3) into v_limit
    from public.offices o join public.office_plans p on p.tier = o.tier
    where o.organization_id = new.organization_id and o.status = 'occupied';
    select count(*) into v_count from public.agents where organization_id = new.organization_id;
    if v_count >= coalesce(v_limit, 3) then
      raise exception 'agent_limit_reached';
    end if;
    if not exists (select 1 from public.offices where organization_id = new.organization_id and status = 'occupied') then
      raise exception 'office_required';
    end if;
    perform public.enforce_rate_limit(auth.uid(), 'agent.', 20, interval '1 day');
  end if;
  if tg_op = 'UPDATE' and not public.is_admin() then
    if old.status = 'suspended' or new.status = 'suspended' then
      if new.status is distinct from old.status then raise exception 'agent_suspended'; end if;
    end if;
    if old.organization_id <> new.organization_id or old.slug <> new.slug then
      raise exception 'agent_identity_locked';
    end if;
  end if;
  if tg_op = 'INSERT' and new.status = 'suspended' and not public.is_admin() then
    raise exception 'agent_suspended';
  end if;
  -- "Live" must be earned by a recent passing health check.
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') and v_org.operator = 'community' then
    if not exists (
      select 1 from public.agent_health_checks h
      where h.agent_id = new.id and h.ok and h.checked_at > now() - interval '24 hours'
      and h.id = (select max(id) from public.agent_health_checks where agent_id = new.id)
    ) then
      raise exception 'health_check_required';
    end if;
  end if;
  if tg_op = 'INSERT' then
    perform public.audit('agent.create', 'agent', new.id, jsonb_build_object('organization_id', new.organization_id));
  end if;
  return new;
end $$;
create trigger agents_guard before insert or update on public.agents for each row execute function public.guard_agent();

-- Reviews: verified email, no self-reviews, rate limit, author is always the caller.
create function public.guard_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if tg_op = 'INSERT' then
    perform public.require_verified_user();
    new.author_id := auth.uid();
    new.status := 'published';
    new.owner_response := null;
    new.owner_responded_at := null;
    perform public.enforce_rate_limit(auth.uid(), 'review.', 10, interval '1 day');
  end if;
  v_org := coalesce(new.organization_id, (select a.organization_id from public.agents a where a.id = new.agent_id));
  -- Only published agents of active organisations (or active organisations) can be reviewed.
  if tg_op = 'INSERT' and not exists (
    select 1 from public.organizations g where g.id = v_org and g.status = 'active'
      and (new.agent_id is null or exists (select 1 from public.agents a where a.id = new.agent_id and a.published and a.status <> 'suspended'))
  ) then
    raise exception 'review_target_unavailable';
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.organization_members m where m.organization_id = v_org and m.user_id = auth.uid()) then
    raise exception 'cannot_review_own';
  end if;
  if tg_op = 'INSERT' then
    perform public.audit('review.create', 'review', new.id::text, jsonb_build_object('organization_id', v_org));
  end if;
  return new;
end $$;
create trigger reviews_guard before insert on public.reviews for each row execute function public.guard_review();

-- ---------------------------------------------------------------- trusted functions
-- Store or replace an agent's bearer token in Supabase Vault (owners only).
create function public.set_agent_secret(p_agent_id text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_secret uuid;
begin
  perform public.require_verified_user();
  select organization_id into v_org from public.agents where id = p_agent_id;
  if v_org is null or not public.is_org_member(v_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_agent_owner';
  end if;
  if p_secret is null or char_length(p_secret) < 8 or char_length(p_secret) > 500 then
    raise exception 'secret_invalid';
  end if;
  select secret_id into v_secret from public.agent_connections where agent_id = p_agent_id;
  if v_secret is null then
    v_secret := vault.create_secret(p_secret, 'agent:' || p_agent_id || ':' || gen_random_uuid()::text);
    update public.agent_connections set secret_id = v_secret, auth_scheme = 'bearer' where agent_id = p_agent_id;
    if not found then raise exception 'connection_required'; end if;
  else
    perform vault.update_secret(v_secret, p_secret);
  end if;
  perform public.audit('agent.secret_set', 'agent', p_agent_id);
end $$;

-- Server-only: decrypt a token for an outbound call. Not callable by users.
create function public.get_agent_secret(p_agent_id text) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.agent_connections c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.agent_id = p_agent_id;
$$;

-- Owners answer reviews of their agents/organisation (one response, editable).
create function public.respond_to_review(p_review_id uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  perform public.require_verified_user();
  select coalesce(r.organization_id, a.organization_id) into v_org
  from public.reviews r left join public.agents a on a.id = r.agent_id where r.id = p_review_id;
  if v_org is null or not public.is_org_member(v_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not_review_target_owner';
  end if;
  update public.reviews set owner_response = nullif(btrim(p_response), ''), owner_responded_at = now() where id = p_review_id;
  perform public.audit('review.respond', 'review', p_review_id::text);
end $$;

-- Moderators/admins hide or restore reviews.
create function public.moderate_review(p_review_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_moderator';
  end if;
  update public.reviews set status = p_status where id = p_review_id;
  perform public.audit('review.moderate', 'review', p_review_id::text, jsonb_build_object('status', p_status));
end $$;

revoke all on function public.guard_agent() from public, anon, authenticated;
revoke all on function public.guard_review() from public, anon, authenticated;
revoke all on function public.set_agent_secret(text, text) from public, anon;
revoke all on function public.get_agent_secret(text) from public, anon, authenticated;
revoke all on function public.respond_to_review(uuid, text) from public, anon;
revoke all on function public.moderate_review(uuid, text) from public, anon;
grant execute on function public.set_agent_secret(text, text) to authenticated;
grant execute on function public.respond_to_review(uuid, text) to authenticated;
grant execute on function public.moderate_review(uuid, text) to authenticated;
grant execute on function public.get_agent_secret(text) to service_role;

-- ---------------------------------------------------------------- privileges & RLS
alter table public.agent_connections enable row level security;
alter table public.agent_health_checks enable row level security;
alter table public.reviews enable row level security;

revoke all on public.agent_connections, public.agent_health_checks, public.reviews, public.review_stats from anon, authenticated;
grant select on public.agent_health_checks, public.reviews, public.review_stats to anon, authenticated;
grant select, delete on public.agent_connections to authenticated;
grant insert (agent_id, endpoint_url, health_url, openapi_url, auth_scheme, input_schema, output_schema) on public.agent_connections to authenticated;
grant update (endpoint_url, health_url, openapi_url, auth_scheme, input_schema, output_schema) on public.agent_connections to authenticated;
grant insert (agent_id, organization_id, rating, body) on public.reviews to authenticated;
grant update (rating, body) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant select, insert on public.agent_health_checks to service_role;
grant select on public.agent_connections, public.agents to service_role;

create function public.can_manage_agent(p_agent_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agents a
    where a.id = p_agent_id and public.is_org_member(a.organization_id, array['owner', 'admin']::public.member_role[])
  );
$$;
revoke all on function public.can_manage_agent(text) from public;
grant execute on function public.can_manage_agent(text) to authenticated;

create policy "owners see their connections" on public.agent_connections for select to authenticated
  using (public.can_manage_agent(agent_id));
create policy "owners add connections" on public.agent_connections for insert to authenticated
  with check (public.can_manage_agent(agent_id));
create policy "owners edit connections" on public.agent_connections for update to authenticated
  using (public.can_manage_agent(agent_id)) with check (public.can_manage_agent(agent_id));
create policy "owners remove connections" on public.agent_connections for delete to authenticated
  using (public.can_manage_agent(agent_id));

create policy "health of visible agents is public" on public.agent_health_checks for select
  using (exists (select 1 from public.agents a where a.id = agent_id));

create policy "published reviews are public" on public.reviews for select
  using (status = 'published' or author_id = auth.uid() or public.is_moderator());
create policy "signed-in users write reviews" on public.reviews for insert to authenticated
  with check (author_id = auth.uid());
create policy "authors edit their reviews" on public.reviews for update to authenticated
  using (author_id = auth.uid() and status = 'published') with check (author_id = auth.uid());
create policy "authors delete their reviews" on public.reviews for delete to authenticated
  using (author_id = auth.uid());

-- Plan limits for agents (prices still unset; only counts are configured).
update public.office_plans set max_agents = 3 where tier = 'standard';
update public.office_plans set max_agents = 10 where tier = 'premium';
update public.office_plans set max_agents = 25 where tier = 'landmark';
