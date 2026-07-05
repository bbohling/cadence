# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cadence is a personal cycling dashboard powered by Strava data, deployed on Cloudflare:
- `api/` — Hono API running on Cloudflare Workers with D1 (serverless SQLite, via Drizzle ORM). Cron Triggers run the scheduled jobs.
- `ui/` — React SPA built with Vite, TanStack Router/Query, Tailwind CSS v4, and Recharts. Hosted on Cloudflare Pages.

Production: UI at `https://cadence.bbohling.com` (Pages custom domain); API served same-origin via a Worker zone route on `cadence.bbohling.com/api/*` (the Worker mounts its routes under both `/` and `/api` — see `api/src/index.ts`). The Worker also answers bare paths on `cadence-api.bbohling.workers.dev`.

## Development Commands

### API (`cd api`)
```bash
bun run dev          # wrangler dev on http://localhost:8787 (local D1 replica)
bun run typecheck    # tsc --noEmit
bun run deploy       # wrangler deploy (normally CI does this)
bun run db:generate  # Generate Drizzle migration SQL from schema changes
npx wrangler d1 execute cadence --local --file <dump.sql>    # seed local D1
npx wrangler d1 execute cadence --remote --command "..."     # query prod D1
```

Local secrets go in `api/.dev.vars` (gitignored): `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.

### UI (`cd ui`)
```bash
bun run dev    # Vite dev server on http://localhost:5173
bun run build  # TypeScript check + production build
```

### Cron handlers (local testing)
```bash
cd api && npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=5+*+*+*+*"   # hourly sync + normalize
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+12+*+*+*"  # daily KOM refresh
```

## Deployment

GitHub Actions deploys on push to `main`: `api/**` → Worker (typecheck first), `ui/**` → Pages (built with `VITE_API_URL=/api`). Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Worker runtime secrets are managed with `wrangler secret put`, not CI.

## Architecture

### Data Pipeline

```
Strava API -> sync service -> src_* tables (raw, metric units)
                                    |
                             normalize service
                                    |
                             activities / segment_efforts / gears tables (imperial)
                                    |
                             report queries -> Hono API -> React UI

Strava API -> KOM refresh (daily cron trigger) -> segment_current_ranks table
```

Scheduled work runs in the Worker's `scheduled()` handler (`api/src/index.ts`), dispatched on the cron expression: `5 * * * *` UTC = hourly sync + normalization; `0 12 * * *` UTC = daily KOM refresh. The legacy per-process cron scripts in `api/src/jobs/` are local-only leftovers and are excluded from typechecking.

### Cloudflare/D1 specifics (important)

- **D1 is async.** Every Drizzle call is awaited. The old bun:sqlite synchronous API is gone (droplet-era code is in `main` branch history).
- The D1 binding is only available inside handlers, so `db` is initialized lazily via `initDb(env.DB)` — a middleware in `index.ts` calls it per request; `scheduled()` calls it too. Services keep importing `{ db }` from `db/connection.ts`.
- `utils/config.ts` reads `process.env` through **getters** (lazy) because Workers populate env per execution context. The `nodejs_compat` flag makes `process.env` work.
- No transactions are used (D1 doesn't support interactive transactions).
- **Bulk sync must never run against the deployed Worker** — free tier allows 50 subrequests/invocation; bulk sync is one request per activity. Backfill locally, then import to D1. When importing SQL dumps to D1, keep each statement under ~90 KB (see DEPLOY-CLOUDFLARE.md) and never use `sqlite3 .dump` (its `unistr()` output breaks D1).
- Background work in request handlers must be registered with `c.executionCtx.waitUntil(...)` or Workers may cancel it after the response (see `routes/ensure-fresh.ts`).

### Two Distinct KOM Datasets
- **Historic KOMs** (`segment_efforts.kom_rank`): Frozen at sync time. Sourced from `segment_efforts` table.
- **Current KOMs** (`segment_current_ranks`): Live leaderboard positions refreshed daily from Strava. Sourced from its own table.

### Database Tables
- `src_activities`, `src_segment_efforts`, `src_gears` — raw Strava data in metric units; each row stores the full API JSON in `raw_json` plus a `schema_version` for resilience
- `activities`, `segment_efforts`, `gears` — normalized to imperial units (miles, feet, mph, °F); these are what all API endpoints read from
- `segment_current_ranks` — current leaderboard positions, refreshed daily
- `users`, `sync` — user records and sync state tracking

### Drizzle ORM

- Make database modifications by updating the schema located in the `api/src/db/schema/` folder
- Only create SQL commands to make database modifications if absolutely necessary (e.g., required to not lose data)
- Never run a Drizzle migration command; apply schema changes to D1 deliberately via `wrangler d1 execute`

### API Routes (`api/src/routes/`)
All routes follow `/v1/<resource>`. The userId in URL paths identifies the Strava athlete. Route files: `reports.ts`, `koms.ts`, `sync.ts`, `ensure-fresh.ts`, `health.ts`. On the custom domain every path is prefixed with `/api`.

### UI Routing
TanStack Router with manual route tree (`ui/src/routes/-route-tree.ts`). Pages: `dashboard.tsx`, `rings.tsx`, `pixels.tsx`, `infographic.tsx`. The root layout is in `root-layout.tsx`.

The UI calls the API via `ui/src/lib/api.ts`, which is the single source of truth for all typed API response interfaces. Production builds use `VITE_API_URL=/api` (same-origin). In dev, Vite proxies `/api` to the local API.

### Environment Variables
- Worker vars (`api/wrangler.jsonc` → `vars`): `NODE_ENV`, `CORS_ORIGIN` (only relevant for cross-origin/dev use — production is same-origin)
- Worker secrets (`wrangler secret put`): `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
- Local dev secrets: `api/.dev.vars`

### Path Alias
`@/` maps to `ui/src/` (configured in `vite.config.ts`).
