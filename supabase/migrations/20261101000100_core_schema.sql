-- Second Wall Street — core schema (Phase 2)
-- Accounts, organisations, city inventory and office claims.
-- Every table has RLS enabled (see 20261101000200_rls.sql). Writes that need
-- invariants (claims, releases, org creation) go through SECURITY DEFINER
-- functions in 20261101000300_functions.sql — never direct table writes.


-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('developer', 'office_owner', 'moderator', 'admin');
create type public.office_tier as enum ('standard', 'premium', 'landmark');
create type public.office_status as enum ('available', 'occupied', 'platform', 'reserved');
create type public.org_operator as enum ('platform', 'community');
create type public.org_status as enum ('active', 'suspended');
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.agent_status as enum ('in-development', 'preview', 'live', 'suspended');
create type public.building_shape as enum ('box', 'stepped', 'cylinder', 'spire', 'lowrise');
create type public.window_style as enum ('cyan-band', 'cyan-grid', 'warm-grid');

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  github_username text check (github_username is null or github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

-- ---------------------------------------------------------------- city
create table public.districts (
  id text primary key check (id ~ '^dst-[a-z]+$'),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  center_x real not null,
  center_z real not null,
  sort_order int not null default 0
);

create table public.buildings (
  id text primary key check (id ~ '^bld-[a-z]{2}-[0-9]{3}$'),
  district_id text not null references public.districts (id),
  name text not null,
  address text not null,
  pos_x real not null,
  pos_z real not null,
  width real not null check (width > 0),
  depth real not null check (depth > 0),
  height real not null check (height > 0),
  floors int not null check (floors > 0),
  shape public.building_shape not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  window_style public.window_style not null,
  tier public.office_tier not null default 'standard'
);
create index buildings_district_idx on public.buildings (district_id);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  tagline text not null default '' check (char_length(tagline) <= 120),
  description text not null default '' check (char_length(description) <= 2000),
  website_url text check (website_url is null or (website_url ~ '^https://[^\s/$.?#].[^\s]*$' and char_length(website_url) <= 200)),
  github_url text check (github_url is null or github_url ~ '^https://github\.com/[A-Za-z0-9_.-]{1,100}(/[A-Za-z0-9_.-]{1,100})?/?$'),
  logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/logo\.(png|jpe?g|webp)$'),
  operator public.org_operator not null default 'community',
  status public.org_status not null default 'active',
  verified boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.offices (
  id text primary key check (id ~ '^ofc-[a-z]{2}-[0-9]{3}-[0-9]{1,2}$'),
  building_id text not null references public.buildings (id) on delete cascade,
  label text not null,
  tier public.office_tier not null,
  status public.office_status not null default 'available',
  organization_id uuid references public.organizations (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- An office is occupied/platform iff it has an organisation.
  constraint offices_org_matches_status check (
    (status in ('occupied', 'platform') and organization_id is not null)
    or (status in ('available', 'reserved') and organization_id is null)
  )
);
create index offices_building_idx on public.offices (building_id);
create index offices_org_idx on public.offices (organization_id);

create table public.office_claims (
  id uuid primary key default gen_random_uuid(),
  office_id text not null references public.offices (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);
-- At most one active claim per office — the database, not the UI, prevents double claims.
create unique index office_claims_one_active_idx on public.office_claims (office_id) where released_at is null;
create index office_claims_org_idx on public.office_claims (organization_id);

-- Plans are configured by product owners; prices stay null until approved.
create table public.office_plans (
  id text primary key,
  tier public.office_tier not null unique,
  name text not null,
  description text not null default '',
  monthly_price_minor int check (monthly_price_minor is null or monthly_price_minor >= 0),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  max_agents int not null default 3,
  max_team_seats int not null default 3,
  stripe_price_id text,
  active boolean not null default false
);

create table public.agents (
  id text primary key default ('agt-' || replace(gen_random_uuid()::text, '-', '')),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category text not null check (char_length(category) <= 60),
  summary text not null default '' check (char_length(summary) <= 300),
  capabilities text[] not null default '{}',
  status public.agent_status not null default 'in-development',
  disclosure text check (disclosure is null or char_length(disclosure) <= 500),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agents_org_idx on public.agents (organization_id);

-- ---------------------------------------------------------------- trust & safety
create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('organization', 'agent', 'review', 'profile')),
  target_id text not null check (char_length(target_id) <= 80),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------- housekeeping
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger offices_touch before update on public.offices for each row execute function public.touch_updated_at();
create trigger agents_touch before update on public.agents for each row execute function public.touch_updated_at();
