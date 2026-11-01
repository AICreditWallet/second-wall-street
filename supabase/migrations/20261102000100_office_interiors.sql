-- Office interiors (3D City v2). Additive only: no existing rows change.
-- Without rows the app derives defaults from the office and its organisation.

create table public.office_interiors (
  office_id text primary key references public.offices (id) on delete cascade,
  template text not null default 'studio' check (template in ('studio', 'startup', 'research')),
  accent_color text not null default '#38e1ff' check (accent_color ~ '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);

create table public.agent_workstations (
  office_id text not null references public.offices (id) on delete cascade,
  slot smallint not null check (slot between 0 and 7),
  agent_id text not null references public.agents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (office_id, slot),
  -- An agent works at one desk in the whole city.
  unique (agent_id)
);

create trigger office_interiors_touch before update on public.office_interiors for each row execute function public.touch_updated_at();

-- Helper: does the caller own/admin the organisation that occupies this office?
create function public.can_manage_office(p_office text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.offices o
    join public.organization_members m on m.organization_id = o.organization_id
    where o.id = p_office and o.status = 'occupied'
      and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  ) or public.is_admin();
$$;
revoke all on function public.can_manage_office(text) from public;
grant execute on function public.can_manage_office(text) to anon, authenticated;

alter table public.office_interiors enable row level security;
alter table public.agent_workstations enable row level security;

revoke all on public.office_interiors, public.agent_workstations from anon, authenticated;
grant select on public.office_interiors, public.agent_workstations to anon, authenticated;
grant insert (office_id, template, accent_color), update (template, accent_color), delete on public.office_interiors to authenticated;
grant insert (office_id, slot, agent_id), delete on public.agent_workstations to authenticated;

-- Interiors of public offices are visible to everyone (visitors can explore without signing in).
create policy "interiors are public" on public.office_interiors for select using (true);
create policy "owners configure their interior" on public.office_interiors for insert to authenticated
  with check (public.can_manage_office(office_id));
create policy "owners update their interior" on public.office_interiors for update to authenticated
  using (public.can_manage_office(office_id)) with check (public.can_manage_office(office_id));
create policy "owners reset their interior" on public.office_interiors for delete to authenticated
  using (public.can_manage_office(office_id));

-- Workstations are public only for published agents of active organisations.
create policy "published workstations are public" on public.agent_workstations for select
  using (exists (
    select 1 from public.agents a join public.organizations g on g.id = a.organization_id
    where a.id = agent_id and a.published and g.status = 'active'
  ) or public.can_manage_office(office_id));
-- Owners may only place their own organisation's agents in their own office.
create policy "owners place their own agents" on public.agent_workstations for insert to authenticated
  with check (
    public.can_manage_office(office_id)
    and exists (
      select 1 from public.agents a join public.offices o on o.organization_id = a.organization_id
      where a.id = agent_id and o.id = office_id
    )
  );
create policy "owners remove workstations" on public.agent_workstations for delete to authenticated
  using (public.can_manage_office(office_id));
