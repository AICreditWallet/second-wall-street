# Second Wall Street — Architecture

> Status: Phase 0 (plan) + Phase 1 (foundation). Items marked **[planned]** are not built yet.

## 1. Product in one sentence

A living 3D financial district where developers claim virtual offices, publish AI agents, and visitors explore, inspect and (later) subscribe to services. The city *is* the product's navigation, backed by real records — not a decorative background.

## 2. System overview

```
secondwallstreet.com  (Next.js App Router · Vercel)
 ├─ Public HTML (SSR/SSG, indexable): landing, /directory, /buildings/[id], /orgs/[slug], /agents, /legal/*
 ├─ /city  — React Three Fiber explorer (client-only) + 2D fallback map
 ├─ Server data layer  src/lib/data/*  (server-only)
 │    Phase 1: DemoCityRepository (deterministic, clearly labelled)
 │    Phase 2: SupabaseCityRepository (same interface)               [planned]
 ├─ Supabase: Auth (GitHub + email) · Postgres + RLS · Storage        [planned]
 ├─ Agent marketplace: registry, HTTPS adapters, MCP/A2A adapters     [planned]
 ├─ Workflow engine: async tasks, budgets, approval gates             [planned]
 ├─ Stripe: Checkout + Billing for platform-owned office plans        [planned]
 └─ Open-source: SDK, templates, docs on GitHub                       [planned]
```

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict | SSR for SEO, server-only modules for secrets, Vercel-native |
| 3D | three.js + React Three Fiber + Drei | Declarative scene tied to React state; buildings map 1:1 to records |
| Geo data / MapLibre | **Not used** | A stylised fictional district needs no real-world tiles; avoids licensing and keeps building IDs under our control |
| City layout | Deterministic generator (seeded PRNG) → stable IDs (`bld-<district>-<n>`) | Same city on every device; IDs become DB primary keys in Phase 2 |
| Styling | Tailwind CSS v4 with design tokens in `globals.css` | Small, consistent, no runtime cost |
| Validation | zod on every server boundary | Never trust client input |
| Tests | Vitest (unit), Playwright (E2E) **[planned Phase 2]** | |

## 4. Data model (Phase 1 types → Phase 2 tables)

`src/lib/city/types.ts` defines `District`, `Building`, `Office`, `Organization`, `Agent`. Each maps to a future Postgres table (`districts`, `buildings`, `offices`, `organizations`, `agents`). Building → offices (1..n). Office status: `available` | `occupied` | `platform`. Office tier: `standard` (free) | `premium` | `landmark`. Prices are **not** defined until the product owner approves them.

Honesty rule: the demo dataset contains only **platform-operated** organisations (Second Wall Street HQ, Open15 AI, the Research Lab demo firm) and empty, available offices. No fake companies, reviews or activity.

## 5. Security model (summary — details in SECURITY.md)

- Strict HTTP security headers + CSP (`next.config.ts`); frames denied.
- Data access lives in `server-only` modules; secrets never reach client bundles (only `NEXT_PUBLIC_*` is exposed).
- Phase 2: Supabase RLS on every table; office claims via a Postgres function with a unique constraint + transaction (no double claims); roles in `user_roles`, checked server-side.
- Third-party agents are untrusted: called only server-side over HTTPS through an SSRF-guarded fetcher (no private IPs, allow-listed ports, timeouts, size caps), never executed in-process.
- Stripe: server-side webhooks with signature verification + idempotency keys; the frontend is never proof of payment.
- CI: typecheck, lint, tests, build, `npm audit` on every PR; branch protection on `main`.

## 6. Compliance boundaries (MVP)

No brokerage, custody, order routing, copy trading, or personalised advice. Research is labelled with source, timestamp, delay status and methodology. Legal pages are drafts pending counsel review. Stripe is used only for platform-owned virtual office subscriptions until marketplace eligibility (Connect) is confirmed with Stripe.

## 7. Performance budgets

- Landing LCP < 2.5s on mid-range mobile; 3D canvas loaded lazily after first paint.
- City: < 300 draw calls; props (cars, lamps, trees, markings) instanced; DPR adaptive via `PerformanceMonitor`; demand-driven rendering when idle with reduced motion.
- WebGL unavailable → 2D SVG map + HTML directory.

## 8. Phases

0 Plan · **1 Foundation (this)** · 2 Accounts & offices · 3 Agent marketplace · 4 Open15 AI · 5 Multi-agent firm · 6 Monetisation · 7 Open-source launch · 8 Hardening. See PROGRESS.md.
