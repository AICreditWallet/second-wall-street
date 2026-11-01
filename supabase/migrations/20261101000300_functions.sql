-- Trusted operations. Each function runs as its owner (SECURITY DEFINER) with an
-- empty search_path, checks the caller with auth.uid(), and raises a stable error
-- code (the exception message) that the app maps to a friendly sentence.

-- ---------------------------------------------------------------- profiles on sign-up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := left(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), 60);
  v_avatar text := meta ->> 'avatar_url';
  v_github text := meta ->> 'user_name';
begin
  insert into public.profiles (id, display_name, avatar_url, github_username)
  values (
    new.id,
    nullif(v_name, ''),
    case when v_avatar ~ '^https://' and char_length(v_avatar) <= 500 then v_avatar end,
    case when v_github ~ '^[A-Za-z0-9-]{1,39}$' then v_github end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- internal helpers
create function public.audit(p_action text, p_type text, p_id text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_type, p_id, p_detail);
$$;
revoke all on function public.audit(text, text, text, jsonb) from public, anon, authenticated;

create function public.require_verified_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
    raise exception 'email_not_verified';
  end if;
  return uid;
end $$;
revoke all on function public.require_verified_user() from public, anon, authenticated;

create function public.enforce_rate_limit(p_uid uuid, p_prefix text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.audit_logs
      where actor_id = p_uid and action like p_prefix || '%' and created_at > now() - p_window) >= p_max then
    raise exception 'rate_limited';
  end if;
end $$;
revoke all on function public.enforce_rate_limit(uuid, text, int, interval) from public, anon, authenticated;

-- Slugs that must never belong to a community organisation.
create table public.reserved_slugs (slug text primary key);
alter table public.reserved_slugs enable row level security;
insert into public.reserved_slugs (slug) values
  ('admin'), ('api'), ('app'), ('auth'), ('city'), ('dashboard'), ('help'), ('legal'),
  ('login'), ('official'), ('open15'), ('open15-ai'), ('platform'), ('research-lab'),
  ('second-wall-street'), ('secondwallstreet'), ('security'), ('sec'), ('settings'),
  ('staff'), ('stripe'), ('support'), ('swst'), ('team'), ('wall-street');

-- ---------------------------------------------------------------- claim a free office
create function public.claim_office(
  p_office_id text,
  p_org_name text default null,
  p_org_slug text default null,
  p_org_tagline text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_verified_user();
  v_office public.offices%rowtype;
  v_org public.organizations%rowtype;
  v_free_held int;
begin
  perform public.enforce_rate_limit(uid, 'office.', 10, interval '1 day');

  -- Lock the office row: concurrent claims for the same office serialise here.
  select * into v_office from public.offices where id = p_office_id for update;
  if not found then
    raise exception 'office_not_found';
  end if;
  if v_office.status <> 'available' then
    raise exception 'office_unavailable';
  end if;
  if v_office.tier <> 'standard' then
    raise exception 'premium_requires_subscription';
  end if;

  -- Use the caller's existing organisation, or create one.
  select o.* into v_org
  from public.organizations o
  join public.organization_members m on m.organization_id = o.id
  where m.user_id = uid and m.role = 'owner'
  order by o.created_at
  limit 1;

  if not found then
    if p_org_name is null or p_org_slug is null then
      raise exception 'organization_details_required';
    end if;
    if exists (select 1 from public.reserved_slugs r where r.slug = lower(p_org_slug)) then
      raise exception 'slug_reserved';
    end if;
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

  if v_org.status <> 'active' then
    raise exception 'organization_suspended';
  end if;

  -- Anti-squatting: one free office per organisation owner.
  select count(*) into v_free_held
  from public.offices o
  join public.organization_members m on m.organization_id = o.organization_id
  where m.user_id = uid and m.role = 'owner' and o.status = 'occupied' and o.tier = 'standard';
  if v_free_held >= 1 then
    raise exception 'free_office_limit';
  end if;

  update public.offices set status = 'occupied', organization_id = v_org.id where id = v_office.id;
  insert into public.office_claims (office_id, organization_id, claimed_by) values (v_office.id, v_org.id, uid);
  insert into public.user_roles (user_id, role) values (uid, 'office_owner') on conflict do nothing;
  perform public.audit('office.claim', 'office', v_office.id, jsonb_build_object('organization_id', v_org.id));

  return jsonb_build_object('office_id', v_office.id, 'building_id', v_office.building_id,
                            'organization_id', v_org.id, 'organization_slug', v_org.slug);
end $$;

-- ---------------------------------------------------------------- release an office
create function public.release_office(p_office_id text) returns void
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

  update public.offices set status = 'available', organization_id = null where id = v_office.id;
  update public.office_claims set released_at = now(), release_reason = 'released_by_owner'
    where office_id = v_office.id and released_at is null;
  perform public.audit('office.release', 'office', v_office.id, jsonb_build_object('organization_id', v_office.organization_id));
end $$;

-- ---------------------------------------------------------------- GDPR: export & deletion
create function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'roles', coalesce((select jsonb_agg(r.role) from public.user_roles r where r.user_id = uid), '[]'),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('role', m.role, 'organization', to_jsonb(o)))
      from public.organization_members m join public.organizations o on o.id = m.organization_id
      where m.user_id = uid), '[]'),
    'office_claims', coalesce((select jsonb_agg(to_jsonb(c)) from public.office_claims c where c.claimed_by = uid), '[]'),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from public.moderation_reports r where r.reporter_id = uid), '[]')
  );
end $$;

-- Called just before the auth user is deleted (server-side, with the admin API).
-- Releases offices and removes organisations the caller solely owns.
create function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_org uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  for v_org in
    select m.organization_id from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = uid and m.role = 'owner' and o.operator = 'community'
      and not exists (
        select 1 from public.organization_members m2
        where m2.organization_id = m.organization_id and m2.role = 'owner' and m2.user_id <> uid)
  loop
    update public.offices set status = 'available', organization_id = null where organization_id = v_org;
    delete from public.organizations where id = v_org;
    perform public.audit('org.delete', 'organization', v_org::text, '{"reason":"account_deleted"}');
  end loop;
end $$;

revoke all on function public.claim_office(text, text, text, text) from public, anon;
revoke all on function public.release_office(text) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.prepare_account_deletion() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.claim_office(text, text, text, text) to authenticated;
grant execute on function public.release_office(text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
