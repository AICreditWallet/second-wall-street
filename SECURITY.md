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
| XSS / clickjacking | CSP, `X-Frame-Options: DENY`, React escaping (user text is never rendered as HTML), user links get `rel="nofollow ugc noopener noreferrer"` and must be `https://`. |

Database security is covered by `supabase/tests/database.test.ts`, which runs the real migrations on Postgres (PGlite) and attacks them as anonymous and signed-in users.

### CSP decision

Scripts use `'unsafe-inline'` instead of per-request nonces so public pages remain static and cacheable. This is acceptable because no user-authored HTML is ever rendered. Revisit if that changes.

## Still to do

- Rate limiting at the edge (Vercel Firewall / WAF rules) for auth and form endpoints, in addition to Supabase's auth limits.
- Team member invitations (members table exists; no invite flow yet).
- Admin dashboard and moderation queue (tables and policies exist).
- Agent calls: server-side only, SSRF guard, timeouts, size caps, budgets (Phase 3).
- Stripe: verified webhooks, idempotent processing (Phase 6).
