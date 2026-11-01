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
