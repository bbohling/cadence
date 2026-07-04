# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cadence is a personal cycling dashboard powered by Strava data. It has two packages:
- `api/` — Hono API server running on Bun with SQLite (via Drizzle ORM)
- `ui/` — React SPA built with Vite, TanStack Router/Query, Tailwind CSS v4, and Recharts

## Development Commands

### API (`cd api`)
```bash
bun run dev          # Start API with watch mode on http://localhost:3033
bun run db:generate  # Generate Drizzle migration SQL from schema changes
bun run db:migrate   # Apply migrations to the SQLite database
bun run db:studio    # Open Drizzle Studio to inspect the database
```

### UI (`cd ui`)
```bash
bun run dev    # Start Vite dev server on http://localhost:5173
bun run build  # TypeScript check + production build
```

### Jobs (run from `api/`)
```bash
bun src/jobs/sync-cron.ts --once          # One-time incremental Strava sync
bun src/jobs/normalize.ts                 # Normalize src_* tables to imperial units
bun src/jobs/normalize.ts --force         # Re-normalize all records
bun src/jobs/kom-refresh-cron.ts --once   # One-time KOM current rankings refresh
```

### Production build
```bash
cd ui && VITE_API_URL=https://yourdomain.com/api bun run build
pm2 start ecosystem.config.cjs  # Start API + sync + KOM refresh cron processes
```

## Architecture

### Data Pipeline

```
Strava API -> sync service -> src_* tables (raw, metric units)
                                    |
                             normalize job
                                    |
                             activities / segment_efforts / gears tables (imperial)
                                    |
                             report queries -> Hono API -> React UI

Strava API -> kom-refresh job (daily) -> segment_current_ranks table
```

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
- Never run a Drizzle migration command

### API Routes (`api/src/routes/`)
All routes follow `/v1/<resource>`. The userId in URL paths identifies the Strava athlete. Route files: `reports.ts`, `koms.ts`, `sync.ts`, `ensure-fresh.ts`, `health.ts`.

### UI Routing
TanStack Router with manual route tree (`ui/src/routes/-route-tree.ts`). Pages: `dashboard.tsx`, `rings.tsx`, `pixels.tsx`, `infographic.tsx`. The root layout is in `root-layout.tsx`.

The UI calls the API via `ui/src/lib/api.ts`, which is the single source of truth for all typed API response interfaces. In dev, Vite proxies `/api` to `http://localhost:3033`.

### Environment Variables (api/.env)
```
PORT=3033
DATABASE_PATH=./data/cadence.db
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
CORS_ORIGIN=http://localhost:5173
```

### Path Alias
`@/` maps to `ui/src/` (configured in `vite.config.ts`).
