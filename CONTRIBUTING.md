# Contributing to Second Wall Street

Thanks for helping build the district. This guide covers how to get set up, what we look for in a pull request, and the rules that keep the platform safe.

## Before you start

- **Small fix?** Open a pull request directly.
- **Bigger change** (new feature, new dependency, schema change)? Open an issue first so we can agree on the approach.
- **Security problem?** Do not open an issue. Follow [SECURITY.md](SECURITY.md).

## Setup

```bash
npm install
npm run dev     # demo mode: no keys or services needed
npm run check   # typecheck + lint + unit/database tests — run before every PR
```

End-to-end tests need a production build: `npm run build && npm run test:e2e` (uses your installed Google Chrome).

## Pull requests

1. Fork, create a branch from `main`, keep the change focused.
2. Add or update tests. Database changes need a test in `supabase/tests/` that tries to break the new permissions.
3. `npm run check` must pass. CI also runs the build, Playwright and `npm audit`.
4. Fill in the pull-request template, including the CLA box.
5. A maintainer reviews every PR. Merges to `main` deploy to production, so we may ask for changes.

## Rules that keep the platform safe

- **Never commit secrets.** `.env*` files are ignored; use `.env.example` for new variables.
- **Permissions live in the database.** New tables need row-level security, deny-by-default grants and tests. Writes that need invariants go through `SECURITY DEFINER` functions with `search_path = ''`.
- **Server-only code stays server-only.** Anything touching the service-role key, Stripe or agent tokens imports `server-only`.
- **No new runtime dependency without discussion.** Pin exact versions.
- **Honesty.** Never present simulated, hypothetical or demo data as real. No invented activity, reviews or performance claims. Financial features are research and education only.
- **Accessibility.** Keyboard, screen readers, reduced motion and mobile must keep working.
- **3D performance.** The city must stay usable on low-end phones; test with the quality tiers.

## Style

TypeScript strict mode, Tailwind, React Server Components by default. Match the surrounding code; keep comments for the *why*.

## Contributor Licence Agreement

To keep the project able to evolve (for example to change licence terms or offer a commercial licence), every contributor agrees to the [CLA](CLA.md). You keep the copyright in your work. Tick the CLA box in the pull-request template; a check fails until it is ticked.

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
