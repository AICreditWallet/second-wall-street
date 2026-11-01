# Progress

_Last updated: 2026-11-01_

## Live infrastructure (set up 2026-11-01)
| Service | Where | Notes |
|---|---|---|
| GitHub | github.com/AICreditWallet/second-wall-street (private) | Branch protection needs GitHub Pro for private repos — not enabled |
| Supabase | org "Second Wall Street" (Free), project `second-wall-street`, ref `ofxzpstohgluhbmmrkcz`, East US | Migrations + seed applied and verified; auth: email confirm, 10+ char passwords, GitHub OAuth |
| Vercel | team "ten's projects" (Hobby), project `second-wall-street` | Auto-deploys `main`; Supabase keys synced by the official integration (scoped to this project only) |
| DNS (GoDaddy) | A `@` → 216.198.79.1, CNAME `www` → Vercel | secondwallstreet.com is canonical; www 308-redirects to it |

Owner to-dos: Vercel Pro before commercial launch (Hobby is non-commercial); custom SMTP for branded auth emails; GitHub Pro if branch protection is wanted.

## 3D City v2 — live in production (merged 2026-11-01, PR #6)

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
- The optional "how agents hand work over" animation is labelled as a demonstration.
- Breadcrumbs and Back everywhere; the URL keeps the place (`?b=…&view=lobby`, `&office=…`) so links, refresh and the browser back button work.
- One WebGL canvas for everything, with no reloads; interiors are code-split.

**Database (applied to production 2026-11-01, verified).** `supabase/migrations/20261102000100_office_interiors.sql` adds `office_interiors` (layout template and accent) and `agent_workstations`, both with RLS: 7 policies, visitors read-only, all 179 offices and their ownership unchanged.

**Data incident, fixed.** The original seed was pasted without UTF-8, garbling dashes ("Floors 22‚Äì27"). `supabase/repairs/20261101_fix_text_encoding.sql` (tested on Postgres) restored all seeded text. Production now reports `still_garbled = 0`, and all 142 sitemap pages are clean.

**Live verification:** the full Playwright suite (36 tests, desktop + mobile) passes against https://secondwallstreet.com (`E2E_BASE_URL=https://secondwallstreet.com npm run test:e2e`).

**Tests:** 72 unit/DB tests (28 attack the SQL/RLS), 36 E2E tests, typecheck, lint and build all pass.

**Next:** let office owners pick their layout and place agents from the dashboard (tables and RLS are ready); Phase 3 agent registration.

## Phase 0 + 1 — done (2026-10-31)
Architecture, design system, landing page, interactive 3D city, office panels, 2D fallback, directory, SEO pages. See ARCHITECTURE.md.

## Phase 2 — Accounts and offices — built, waiting for Supabase connection

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
Connect staging Supabase and run `E2E_SUPABASE=1 npm run test:e2e`; then Phase 3 — agent marketplace (agent registration, HTTPS connections with SSRF-guarded health checks, ratings and reviews).
