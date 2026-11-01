-- Phases 4–5: Open15 research, back-tests and multi-agent workflow runs.
-- Additive. Rows are written only by the server (service role); visitors read
-- public rows, signed-in users also read their own private workflow runs.

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'open15' check (kind in ('open15')),
  session_date date not null,
  provider text not null,
  data_freshness text not null check (data_freshness in ('simulated', 'delayed-15m', 'end-of-day', 'real-time')),
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique (kind, session_date, provider)
);

create table public.research_signals (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.research_runs (id) on delete cascade,
  rank smallint not null,
  symbol text not null,
  score numeric not null,
  direction text not null check (direction in ('up', 'down', 'none')),
  evidence jsonb not null default '[]'
);
create index research_signals_run_idx on public.research_signals (run_id, rank);

create table public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  end_date date not null,
  provider text not null,
  config jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique (end_date, provider)
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null check (workflow_id ~ '^[a-z0-9-]{2,40}$'),
  status text not null check (status in ('running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled')),
  session_date date not null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  started_by uuid references auth.users (id) on delete cascade,
  budget_units int not null check (budget_units between 1 and 500),
  used_units int not null default 0 check (used_units >= 0),
  next_step int not null default 0,
  workspace jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint workflow_runs_platform_public check (started_by is not null or visibility = 'public')
);
-- One platform run per workflow per session.
create unique index workflow_runs_platform_daily on public.workflow_runs (workflow_id, session_date) where started_by is null;
create index workflow_runs_user_idx on public.workflow_runs (started_by, created_at desc);
create index workflow_runs_recent_idx on public.workflow_runs (visibility, created_at desc);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  step int not null,
  step_key text not null,
  agent_id text references public.agents (id) on delete set null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  attempt int not null default 1,
  summary text,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  units int not null default 0
);
create index agent_tasks_run_idx on public.agent_tasks (run_id, step);
create index agent_tasks_agent_idx on public.agent_tasks (agent_id, started_at desc);

create table public.agent_messages (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  from_agent text,
  to_agent text,
  kind text not null check (kind in ('handoff', 'approval_request', 'approval')),
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index agent_messages_run_idx on public.agent_messages (run_id, id);

create table public.workflow_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  type text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index workflow_events_run_idx on public.workflow_events (run_id, id);

-- Usage per agent (units and task counts), for dashboards.
create view public.agent_usage with (security_invoker = true) as
  select agent_id, count(*)::int as tasks, count(*) filter (where status = 'succeeded')::int as succeeded,
         sum(units)::int as units, max(started_at) as last_task_at
  from public.agent_tasks group by agent_id;

-- ---------------------------------------------------------------- access
create function public.can_read_run(p_run uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workflow_runs r where r.id = p_run and (r.visibility = 'public' or r.started_by = auth.uid()));
$$;
revoke all on function public.can_read_run(uuid) from public;
grant execute on function public.can_read_run(uuid) to anon, authenticated;

alter table public.research_runs enable row level security;
alter table public.research_signals enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_messages enable row level security;
alter table public.workflow_events enable row level security;

revoke all on public.research_runs, public.research_signals, public.backtest_runs, public.workflow_runs,
  public.agent_tasks, public.agent_messages, public.workflow_events, public.agent_usage from anon, authenticated;
grant select on public.research_runs, public.research_signals, public.backtest_runs, public.workflow_runs,
  public.agent_tasks, public.agent_messages, public.workflow_events, public.agent_usage to anon, authenticated;
grant select, insert, update on public.research_runs, public.research_signals, public.backtest_runs, public.workflow_runs,
  public.agent_tasks, public.agent_messages, public.workflow_events to service_role;
grant select on public.agent_usage to service_role;

create policy "research is public" on public.research_runs for select using (true);
create policy "signals are public" on public.research_signals for select using (true);
create policy "backtests are public" on public.backtest_runs for select using (true);
create policy "public or own runs" on public.workflow_runs for select using (visibility = 'public' or started_by = auth.uid());
create policy "tasks of readable runs" on public.agent_tasks for select using (public.can_read_run(run_id));
create policy "messages of readable runs" on public.agent_messages for select using (public.can_read_run(run_id));
create policy "events of readable runs" on public.workflow_events for select using (public.can_read_run(run_id));

-- ---------------------------------------------------------------- platform agents now do real work
update public.agents set status = 'live', capabilities = array['Opening range', 'Relative volume', 'Gap detection', 'VWAP', 'Liquidity filters'],
  summary = 'Scans the 9:30–9:45 ET window and ranks unusual activity with transparent criteria. Runs on simulated market data until a licensed feed is connected.'
  where id = 'agt-open15-scanner';
update public.agents set status = 'live', capabilities = array['Opening-range breakout', 'Relative volume', 'Range position'],
  summary = 'Explains where each candidate closed the opening window relative to its range. Runs on simulated market data.'
  where id = 'agt-open15-orb';
update public.agents set status = 'live', capabilities = array['20-session return', 'Volatility', 'Trend vs SMA(20)'],
  summary = 'Builds context for each instrument from completed sessions and frames research questions.' where id = 'agt-lab-research-analyst';
update public.agents set status = 'live', capabilities = array['RSI', 'MACD', 'Bollinger Bands', 'ATR', 'Opening signals'],
  summary = 'Reads indicators and opening-window signals and states the technical picture with its evidence.' where id = 'agt-lab-technical-analyst';
update public.agents set status = 'live', capabilities = array['Market breadth', 'Sector leadership', 'Notable gaps'],
  summary = 'Summarises market breadth and sector moves at 9:45. No news feed is connected.' where id = 'agt-lab-market-intelligence';
update public.agents set status = 'live', capabilities = array['Volatility', 'Historical VaR', 'Concentration', 'ATR stops'],
  summary = 'Measures risk of a hypothetical equal-weight basket: volatility, VaR, worst days and concentration.' where id = 'agt-lab-risk-analyst';
update public.agents set status = 'live', capabilities = array['Equal weight', 'Inverse volatility', 'Drawdown'],
  summary = 'Compares simulated allocations over recent sessions — never real accounts.' where id = 'agt-lab-portfolio-research';
update public.agents set status = 'live', capabilities = array['Sourced summaries', 'Disclosures'],
  summary = 'Combines the team''s findings into a sourced report with clear disclosures.' where id = 'agt-lab-report-agent';

update public.organizations set tagline = 'A multi-agent research firm you can watch at work.',
  description = 'Six specialised agents work through each trading session together: research, technical analysis, market intelligence, risk, portfolio research and reporting, with a human approval gate before portfolio work. Simulated data and hypothetical portfolios only.'
  where slug = 'research-lab' and operator = 'platform';
