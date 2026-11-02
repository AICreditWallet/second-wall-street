# Progress

_Last updated: 2026-11-02_

| Phase | Status |
|---|---|
| 0–1 Architecture, landing page, 3D city | Live |
| 2 Accounts and offices | Live |
| 3D City v2 (white-screen fix, interiors) | Live |
| 3 AI agent marketplace | Live |
| 4–5 Open15 research engine + multi-agent firm | Live |
| 6 Paid offices with Stripe (test mode) | Branch `phase-6-billing` — needs migration, Stripe keys, merge |
| 7 Open-source launch (AGPL-3.0 + CLA) | Branch `phase-6-billing` — repo goes public after merge |
| 8 Hardening: admin & moderation dashboard | Branch `phase-6-billing` |

## Phases 6–8 — paid offices, open source, admin (branch `phase-6-billing`)

**Pricing.** Free office with 1 agent for every verified developer. Premium and landmark offices: £9.99/month or £59.99 one-time (10 / 25 agents). Stripe test mode until the owner switches to live keys and upgrades Vercel to Pro (Hobby is non-commercial).

**How payments work** (details in `docs/STRIPE_SETUP.md`):
- Postgres reserves the office for the 30-minute Stripe Checkout.
- Only Stripe's signed webhook hands it over. It is idempotent, and on failure returns 500 so Stripe retries.
- Expired, abandoned, cancelled or refunded purchases free the office.
- A payment that completes after the office went to someone else is refunded or cancelled automatically, never taking the office from them.
- Customer portal: change card, see invoices, cancel at period end.
- Paid offices can't be released directly. Deleting an account cancels its subscriptions first.
- The Stripe product, prices and portal configuration are created by the app on first use.

**Open source.**
- AGPL-3.0 `LICENSE` and a Contributor Licence Agreement (`CLA.md`), enforced by a CI check on pull requests.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `TRADEMARKS.md`: the name, logo and domain stay the owner's.
- Issue and PR templates, plus private vulnerability reporting.
- A source link in the site footer (AGPL network-use clause).
- History scanned: no secrets.

**Admin** (`/admin`, moderators and admins only):
- Revenue: subscriptions, MRR, one-time sales and payment problems.
- Moderation: report queue with resolve / hide review / suspend agent, latest reviews, audit log.
- Every action is re-checked by database functions.

**Tests:** 59 database tests (14 for billing and admin), 5 webhook signature tests, 66 E2E tests.

## Phases 4–5 — Open15 research and the multi-agent firm (branch `phase-4-5-research`)

**Zero running cost.** No paid market data, no AI/LLM APIs, no cron jobs. The agents are deterministic code; the first visit after each session's 9:30–9:45 ET window computes that session's research once and stores it (unique constraints make this safe under concurrent visits).

**Market data.** `src/lib/market/`: a provider interface (`MarketDataProvider`) with one implementation, a deterministic **simulator** of 32 fictional `SIM:` instruments (incl. illiquid, penny and two later-delisted ones). Every page that shows its output says "Simulated data — not real prices". A licensed feed can be plugged in later by adding a provider; nothing else changes. NYSE calendar (holidays incl. Good Friday and Juneteenth, early-close days are treated as full opens, DST via `Intl`). Indicators: SMA, EMA, RSI, MACD, ATR, Bollinger, VWAP, opening range, resampling, candlestick patterns.

**Open15 research (`/research`).** The ten steps from the brief: calendar, universe, liquidity filters, prior-day context (no premarket feed), 9:30–9:45 observation, indicators, notable conditions, transparent weighted ranking, evidence per candidate, timestamped summary. Mini-charts (candles, VWAP, opening range), methodology, limitations, excluded instruments and session history.

**Back-tests (`/research/backtests`).** Five strategies (gap-and-go, opening-range breakout, VWAP trend, relative-volume momentum, gap fade). 120 sessions, walk-forward parameter choice on past data only and scoring on unseen blocks (out-of-sample), 5 bps slippage + 1 bp commission per side, opening-range stops, delisted instruments included while they traded, equal-weight benchmark. Results are labelled hypothetical and are mixed, as expected.

**Multi-agent firm (`/workflows`).** A workflow engine (`src/lib/firm/engine.ts`) with fixed step lists (max 12), per-agent permission boundaries (each agent receives only the workspace fields it declares), handoff messages, budgets in units, timeouts, up to 2 retries, human approval gates (claimed atomically so a double click can't run steps twice), cancellation and a full event log. Agents: Opening Session Scanner, Opening Range Analyst, Research Analyst, Technical Analyst, Market Intelligence (breadth only, says no news feed is connected), Risk Analyst (hypothetical basket: volatility, VaR, concentration), Portfolio Research (simulated allocations), Report Agent (sourced report + disclaimer).
- Platform runs: each workflow runs once per session in public. The research-firm run's approval gate is passed by a stated platform policy, recorded in the run.
- Signed-in people can start private runs (5 per 24 h), approve or cancel them. Only the starter sees or controls a private run (RLS + server checks).

**Visible on the map.** Real run records drive it, never decoration:
- Light beam and pulsing ring over the Open15 AI and Research Lab buildings, with "· agents ran" on their labels.
- An "Agent activity" card (collapsed pill on phones) listing the latest runs, with "Show office" and "Watch the run".
- The building panel links to the run and today's research.
- Inside the office, each workstation shows its last task and time, hand-off arcs follow the latest run's real order, and the agent card shows the latest task with a link to the run.

**Database.** `supabase/migrations/20261104000100_research_and_workflows.sql`: research_runs, research_signals, backtest_runs, workflow_runs, agent_tasks, agent_messages, workflow_events, an `agent_usage` view. Visitors read public rows; private runs are owner-only; only the server (service role) writes. Also marks the 8 platform agents Live with updated summaries, and updates the Research Lab description.

**Tests:** 149 unit/DB tests (incl. a look-ahead test that scrambles post-9:45 data and checks results don't change, and RLS attacks on the new tables), 56 E2E tests on desktop + mobile, typecheck, lint, build.

**Needs owner action:** run the migration in Supabase, then merge the PR.

## Live infrastructure (set up 2026-11-01)
| Service | Where | Notes |
|---|---|---|
| GitHub | github.com/AICreditWallet/second-wall-street (private) | Branch protection needs GitHub Pro for private repos — not enabled |
| Supabase | org "Second Wall Street" (Free), project `second-wall-street`, ref `ofxzpstohgluhbmmrkcz`, East US | Migrations + seed applied and verified; auth: email confirm, 10+ char passwords, GitHub OAuth |
| Vercel | team "ten's projects" (Hobby), project `second-wall-street` | Auto-deploys `main`; Supabase keys synced by the official integration (scoped to this project only) |
| DNS (GoDaddy) | A `@` → 216.198.79.1, CNAME `www` → Vercel | secondwallstreet.com is canonical; www 308-redirects to it |

Owner to-dos: Vercel Pro before commercial launch (Hobby is non-commercial); custom SMTP for branded auth emails; GitHub Pro if branch protection is wanted.

## 3D City v2 — live

**White-screen bug — root cause found and fixed.**
- Reproduced: forcing a WebGL context loss produces exactly the reported screen (white canvas, labels and panel still visible).
- Cause: the GPU was overloaded and the app had no context-loss handling. The main cost was ~520 overlapping additive light-pool planes, rendered at up to 2× retina resolution with MSAA, worst when the camera flew close to a building. After repeated GPU resets Chrome disabled WebGL for the whole browser; the owner's Chrome was in that state on 2026-11-01. Restarting Chrome restores it.
- Fixes:
  - Light pools baked into one texture (one draw, no overdraw).
  - Resolution capped by a pixel budget, with quality tiers.
  - GPU resources disposed on unmount.
  - Context-loss handler covers the canvas with a "Restart 3D / Use 2D map" screen, never white; after repeated losses it recommends the 2D map.
  - Scene error boundary; invalid camera coordinates rejected.
  - A notice when WebGL is unavailable.
- Regression tests (Playwright, desktop + mobile): repeated select/close/switch with a pixel-brightness check, deep link plus refresh, simulated GPU context loss and recovery.

**City clarity.**
- Street names painted on roads that fade in when zoomed in and flip to stay readable; district names give way when zoomed in.
- Buildings labelled by organisation name, with occlusion and overlap handling.
- Rich hover tooltip (district, floors, availability, category); brighter roads.

**Building → lobby → office → agent.**
- Floors view: glass floor bands per office, coloured by status and clickable.
- 3D lobby: reception, elevators, floor directory screen, visitors.
- Three reusable office templates (Developer Studio, AI Startup, Research Firm) with desks, monitors, glass meeting rooms, kitchen, sofas, plants, skyline windows and wall displays.
- Animated people (walk / sit / type / talk) on A* paths that avoid furniture and each other.
- Agent workstations show real agent records; clicking one opens an agent card with honest status, linking to the new `/agents/[slug]` pages.
- Hand-off arcs between workstations follow the latest real workflow run (Phase 5).
- Breadcrumbs and Back everywhere; the URL keeps the place (`?b=…&view=lobby`, `&office=…`) so links, refresh and the browser back button work.
- One WebGL canvas for everything, with no reloads; interiors are code-split.

**Database (written and tested, NOT applied to production).** `supabase/migrations/20261102000100_office_interiors.sql` adds `office_interiors` (layout template and accent) and `agent_workstations`, both with RLS. The app works without it, deriving defaults.

**Tests:** 72 unit/DB tests (28 attack the SQL/RLS), 36 E2E tests, typecheck, lint and build all pass.

## Phase 0 + 1 — done (2026-10-31)
Architecture, design system, landing page, interactive 3D city, office panels, 2D fallback, directory, SEO pages. See ARCHITECTURE.md.

## Phase 2 — Accounts and offices — live

Implemented:
- **Database** (`supabase/migrations/`): profiles, roles, districts, buildings, offices, organisations, members, office claims, plans (prices empty until approved), agents, moderation reports, audit log, reserved slugs. Seed generated from the city layout (`npm run db:seed:generate`).
- **Security in the database**: RLS on every table, deny-by-default grants, column-level update grants, `claim_office` / `release_office` / `export_my_data` / `prepare_account_deletion` functions with row locks, one-active-claim unique index, one free office per owner, verified-email requirement, daily rate limit, audit log, logo storage bucket with size/type limits and per-org folders.
- **Auth** (Supabase): GitHub OAuth, email + password, email verification, password reset, sign out, session refresh via `src/proxy.ts`, open-redirect protection, no account enumeration.
- **Claim flow** `/claim/[officeId]`: sign in → name organisation (web address auto-suggested) → claim → dashboard. Clear messages for every refusal.
- **Dashboard** `/dashboard`: your offices, release (with confirmation), getting-started checklist. **Organisation editor** with logo upload. **Account** page: display name, change password, sign out, data export (JSON), account deletion.
- **Live city**: the 3D city, directory, building and organisation pages read Supabase (refresh within 60 s, and immediately after a claim). Without Supabase they show the demo dataset and an honest notice.
- Header shows Dashboard/avatar when signed in, without making public pages dynamic.

Tests (all passing):
- 45 unit + database tests (`npm test`) — 23 of them attack the real SQL/RLS on Postgres.
- 24 Playwright end-to-end tests on desktop + mobile Chrome (`npm run build && npm run test:e2e`).
- 2 account-flow E2E tests are written but **skipped** until a staging Supabase exists (`E2E_SUPABASE=1`).

Not verified yet (needs your Supabase project): real GitHub/email sign-in, emails, the claim against a hosted database, logo upload to Supabase Storage.

## Owner actions needed now
1. Licence decision (open from Phase 1).
2. A separate staging Supabase project for the destructive account E2E suite (production must never be used for it).

## Known limitations / deferred
- Team member invitations, admin dashboard, moderation queue UI (schema ready).
- Premium offices show "Join waitlist"; paid plans arrive in Phase 6 (Stripe, test mode first).
- Edge rate limiting via Vercel Firewall to configure at deploy time.
- Playwright uses your installed Google Chrome (Playwright's own Chromium doesn't support macOS 13).

## Next recommended action
Apply the billing migration, add the two Stripe secrets in Vercel and create the webhook (docs/STRIPE_SETUP.md), merge, test a purchase with card 4242…, then make the repository public. Before taking real money: Vercel Pro, Stripe live keys, legal review of the terms, refund policy and CLA.
