# Connecting Supabase

The app runs in read-only demo mode until these steps are done. Do them for a
**staging** project first, then repeat for **production**. Never paste keys into chat
or commit them — they go in `.env.local` (your machine) and Vercel (hosting).

## 1. Create the project

1. supabase.com → New project → name `second-wall-street-staging`, pick a region near your users (e.g. London `eu-west-2`), set a strong database password and store it in your password manager.
2. Project Settings → API: copy the **Project URL** and the **publishable (anon) key**. Copy the **secret / service_role key** too — it is only for the server (Vercel env vars), never the browser.

## 2. Apply the database

Easiest (no tools): SQL Editor → paste and run each file in order:

1. `supabase/migrations/20261101000100_core_schema.sql`
2. `supabase/migrations/20261101000200_rls.sql`
3. `supabase/migrations/20261101000300_functions.sql`
4. `supabase/migrations/20261101000400_storage.sql`
5. `supabase/seed.sql`

Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push` and run `seed.sql`.

## 3. Authentication settings

Authentication → URL Configuration
- **Site URL**: `https://secondwallstreet.com` (staging: your Vercel preview URL)
- **Redirect URLs**: `https://secondwallstreet.com/auth/callback`, `https://secondwallstreet.com/auth/confirm`, `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`

Authentication → Providers / Settings
- Email: **Confirm email ON**. Minimum password length **10**. Turn on **leaked password protection** if available on your plan.
- GitHub: enable, then create an OAuth App at github.com → Settings → Developer settings → OAuth Apps:
  - Homepage URL: `https://secondwallstreet.com`
  - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
  - Paste the GitHub Client ID and Client Secret into Supabase (not into the app).

Authentication → Email Templates (recommended, works across devices): set the
confirmation link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
and the password-reset link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password`.

For launch, configure a custom SMTP sender (Authentication → SMTP) — the built-in sender is rate-limited.

## 4. Environment variables

Local `.env.local` and Vercel (Production + Preview, with different projects):

```
NEXT_PUBLIC_SITE_URL=https://secondwallstreet.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<secret key — server only>
```

## 5. Make yourself an admin (optional)

SQL Editor, after signing up once:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = '<your email>';
```

## 6. Verify

```bash
npm run build && E2E_SUPABASE=1 npm run test:e2e
```

This runs the full sign-in → claim → public visibility → release flow against
**staging** with a throwaway user that is deleted afterwards. Never run it against production.
