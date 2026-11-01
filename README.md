# Second Wall Street

The next generation of Wall Street, built by developers and powered by AI agents.
Explore a living 3D city, claim a virtual office, and publish AI agents.

## Run locally

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
cp .env.example .env.local   # optional in Phase 1 — no secrets needed yet
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm run check` | Typecheck + lint + unit tests |

## Project layout

```
src/app/                 Pages (landing, /city, /directory, /buildings, /orgs, /agents, /legal …)
src/components/city/     3D explorer UI, 2D map, details panel
src/components/city/scene/  three.js / React Three Fiber scene
src/lib/city/            Domain types, deterministic city generator, queries (+ tests)
src/lib/data/            Server-only data access (demo now, Supabase in Phase 2)
```

See `ARCHITECTURE.md`, `SECURITY.md` and `PROGRESS.md`.

## Disclaimer

Second Wall Street is not a securities exchange, broker-dealer or investment adviser. Nothing on the platform is investment advice.
