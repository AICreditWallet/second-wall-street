# Security

## Reporting a vulnerability

Please report security issues privately to **security@secondwallstreet.com** (mailbox to be created before launch). Do not open public issues for vulnerabilities.

## What protects the code and the site

| Threat | Protection |
|---|---|
| Someone changing the code | GitHub branch protection on `main` (required PR review + passing CI), no direct pushes. **Owner action: enable after the repo is created.** |
| Malicious / vulnerable dependencies | Exact pinned versions + lockfile, `npm audit` in CI, Dependabot. Production dependencies: 0 known vulnerabilities. |
| Leaked secrets | `.env*` git-ignored; only `NEXT_PUBLIC_*` reaches the browser; Supabase clients live in `server-only` modules; the service-role key is used in exactly one place (account deletion). |
| Claiming someone else's office / double claims | Claims only via the `claim_office` Postgres function: row lock (`FOR UPDATE`), status check, and a unique index allowing one active claim per office. Direct table writes are revoked. |
| Editing other people's data | Row-level security on every table, deny-by-default privileges, **column-level** update grants (users cannot set `verified`, `operator`, `status`). |
| Office squatting / abuse | One free office per owner, verified email required, 10 claim/release operations per day, reserved slugs, audit log of every change. |
| Malicious uploads | Logo bucket limited to 512 KB PNG/JPEG/WebP (enforced by storage), magic-byte check on the server, writes only into the organisation's own folder. |
| Account takeover / enumeration | Supabase Auth (bcrypt, PKCE), email verification, 10+ char passwords, generic sign-in/reset messages, `getUser()`/`getClaims()` validation on the server. |
| Open redirects / host-header attacks | `next` parameters must be same-site paths; auth callback URLs built from the configured site URL, not request headers. |
| CSRF | Server Actions check the Origin header; cookies are `SameSite=Lax`. |
| Agents attacking our network (SSRF) | Agents are called only server-side via `src/lib/agents/caller.ts`: HTTPS/443 only, no credentials in URLs, private/loopback/link-local/metadata ranges blocked **at connection time** (defeats DNS rebinding), no redirects, 6 s timeout, 256 KB cap, 3 calls/agent/minute. Verified against real endpoints (incl. a public domain resolving to 127.0.0.1). |
| Leaked agent tokens | Stored in Supabase Vault via `set_agent_secret`; decryptable only by the server's service role (`get_agent_secret`); never returned to browsers, only replaceable. |
| Fake "Live" agents / review abuse | DB trigger: Live requires a passing health check < 24 h old; plan agent limits; one review per person per target, verified email, no reviewing your own organisation, 10 reviews/day, author forced to the caller, moderation and reports. |
| Agents going beyond their role | Built-in agents only (no third-party code in workflows); each receives only the workspace fields it declares; fixed step lists (max 12), per-step timeouts, ≤ 2 retries, unit budgets per run. |
| Forged or tampered research / runs | Research, runs, tasks, messages and events are written only by the server (service role); anon and signed-in users have SELECT only. Private runs are readable only by their starter (RLS via `can_read_run`). Approve/cancel check ownership on the server and claim the approval gate atomically. 5 private runs per person per 24 h. |
| Mistaking simulated data for real prices | Provider freshness is stored with every report; every research page, report and back-test shows a "Simulated data — not real prices" notice and "not investment advice". Symbols are fictional (`SIM:`). |
| XSS / clickjacking | CSP, `X-Frame-Options: DENY`, React escaping (user text is never rendered as HTML), user links get `rel="nofollow ugc noopener noreferrer"` and must be `https://`. |

Database security is covered by `supabase/tests/database.test.ts`, which runs the real migrations on Postgres (PGlite) and attacks them as anonymous and signed-in users.

### CSP decision

Scripts use `'unsafe-inline'` instead of per-request nonces so public pages remain static and cacheable. This is acceptable because no user-authored HTML is ever rendered. Revisit if that changes.

## Still to do

- Rate limiting at the edge (Vercel Firewall / WAF rules) for auth and form endpoints, in addition to Supabase's auth limits.
- Team member invitations (members table exists; no invite flow yet).
- Admin dashboard and moderation queue (tables and policies exist).
- Moderation queue UI for reports (reports are stored; review hiding works via `moderate_review`).
- Stripe: verified webhooks, idempotent processing (Phase 6).
