-- Row-level security. Deny by default: privileges are revoked, then only the
-- minimum is granted back, and every table has RLS enabled with explicit policies.

-- ---------------------------------------------------------------- helpers
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create function public.is_org_member(p_org uuid, p_roles public.member_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

-- Parses the first path segment of a storage object as a uuid without raising.
create function public.safe_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_org_member(uuid, public.member_role[]) from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_org_member(uuid, public.member_role[]) to anon, authenticated;
grant execute on function public.safe_uuid(text) to anon, authenticated;

-- ---------------------------------------------------------------- privileges
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.districts, public.buildings, public.offices,
  public.office_plans, public.organizations, public.agents to anon, authenticated;
grant select on public.user_roles, public.organization_members, public.office_claims,
  public.moderation_reports, public.audit_logs to authenticated;

-- Column-level write grants: users can only ever touch these columns.
grant update (display_name) on public.profiles to authenticated;
grant update (name, tagline, description, website_url, github_url, logo_path) on public.organizations to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on public.moderation_reports to authenticated;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.districts enable row level security;
alter table public.buildings enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.offices enable row level security;
alter table public.office_claims enable row level security;
alter table public.office_plans enable row level security;
alter table public.agents enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------- policies
create policy "profiles are public" on public.profiles for select using (true);
create policy "users edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own roles or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "districts are public" on public.districts for select using (true);
create policy "buildings are public" on public.buildings for select using (true);
create policy "offices are public" on public.offices for select using (true);
create policy "plans are public" on public.office_plans for select using (true);

create policy "active orgs are public" on public.organizations for select
  using (status = 'active' or public.is_org_member(id) or public.is_admin());
create policy "owners and admins edit org" on public.organizations for update to authenticated
  using (status = 'active' and public.is_org_member(id, array['owner', 'admin']::public.member_role[]))
  with check (status = 'active' and public.is_org_member(id, array['owner', 'admin']::public.member_role[]));

create policy "members see their team" on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

create policy "members see claim history" on public.office_claims for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

create policy "published agents are public" on public.agents for select
  using (
    (published and exists (select 1 from public.organizations o where o.id = organization_id and o.status = 'active'))
    or public.is_org_member(organization_id)
    or public.is_admin()
  );

create policy "signed-in users can report" on public.moderation_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "moderators read reports" on public.moderation_reports for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'moderator')
  );

create policy "admins read audit log" on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Logo paths must live in the organisation's own storage folder.
alter table public.organizations add constraint organizations_logo_in_own_folder
  check (logo_path is null or logo_path like (id::text || '/%'));
