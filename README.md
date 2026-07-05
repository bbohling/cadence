# cadence

A personal cycling dashboard powered by Strava data. Built with Hono, React,
and Drizzle, deployed on Cloudflare (Workers + D1 + Pages).

**Live:** https://cadence.bbohling.com (UI) · https://cadence.bbohling.com/api/health (API)

## Architecture

```
cadence/
├── api/                  # Hono API — Cloudflare Worker
│   ├── src/
│   │   ├── db/           # Drizzle schema + D1 connection
│   │   ├── routes/       # Hono route handlers
│   │   ├── services/     # Business logic (sync, normalize, reports)
│   │   ├── jobs/         # Local-only scripts (bulk sync, prod migration)
│   │   └── utils/        # Config, logging, unit conversions
│   ├── drizzle/          # Generated migrations
│   └── wrangler.jsonc    # Worker config: D1 binding, cron triggers, route
├── ui/                   # React dashboard (Vite + Tailwind) — Cloudflare Pages
│   └── src/
│       ├── routes/       # TanStack Router pages
│       ├── components/   # Dashboard components
│       ├── hooks/        # React hooks
│       └── lib/          # API client, utilities
└── .github/workflows/    # CI/CD: push to main → deploy Worker + Pages
```

### Hosting layout

One hostname, two services. DNS for `cadence.bbohling.com` points at the
Pages project (UI). A Worker **zone route** (`cadence.bbohling.com/api/*`)
intercepts API paths before they reach Pages, so UI and API are same-origin
(no CORS in production). The Worker also answers on
`cadence-api.bbohling.workers.dev` (bare paths, no `/api` prefix) and runs
the scheduled jobs via Cron Triggers:

- `5 * * * *` (UTC) — hourly Strava sync + normalization
- `0 12 * * *` (UTC) — daily KOM current-rankings refresh (4 AM PST / 5 AM PDT)

Data lives in **D1** (serverless SQLite), database name `cadence`.

## Data Flow

```
Strava API  →  Sync Service  →  src_* tables (raw, metric)
                                     ↓
                              Normalization Job
                                     ↓
                              Normalized tables (imperial)
                                     ↓
                              Report Queries  →  API  →  React UI

Strava API  →  KOM Refresh Job (daily)  →  segment_current_ranks
                                                  ↓
                                           Current KOM Queries  →  API  →  React UI
```

### Source Tables (`src_*`)
Store raw Strava data in metric units exactly as received. Each row keeps
the full JSON response in a `raw_json` column for resilience against API
changes. A `schema_version` column tracks extraction logic versions.

### Normalized Tables
Store converted data in American English units (miles, feet, mph, °F).
Populated by the normalization job. All API endpoints read from these tables.

### Current KOM Rankings (`segment_current_ranks`)
Stores the athlete's current leaderboard position for each unique segment.
Updated daily by the KOM refresh job, which re-fetches ranks from Strava.
This is separate from the historic `kom_rank` on `segment_efforts`, which
is frozen at the time each activity was synced.

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) v1.1+
- Wrangler (installed as an api/ dev dependency; authenticate with `npx wrangler login`)
- Strava API credentials ([create an app](https://www.strava.com/settings/api))

### Setup

```bash
# API
cd api
bun install
# Local secrets for `wrangler dev` (gitignored):
printf "STRAVA_CLIENT_ID=...\nSTRAVA_CLIENT_SECRET=...\n" > .dev.vars
# Seed the local D1 replica (from a dump — see Data Operations below)
npx wrangler d1 execute cadence --local --file <dump.sql>

# UI
cd ../ui
bun install
```

### Development

```bash
# Terminal 1: API (wrangler dev, local D1 replica)
cd api && bun run dev        # http://localhost:8787

# Terminal 2: UI
cd ui && bun run dev         # http://localhost:5173 (proxies /api)
```

To exercise the cron handlers locally:

```bash
cd api && npx wrangler dev --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=5+*+*+*+*"   # hourly sync
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+12+*+*+*"  # KOM refresh
```

## Deployment (CI/CD)

Push to `main` deploys automatically via GitHub Actions:

- `api/**` changes → typecheck + `wrangler deploy` (Worker, crons, route)
- `ui/**` changes → Vite build (`VITE_API_URL=/api`) + `wrangler pages deploy`

Required repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token with: Account → Workers Scripts:Edit, Cloudflare Pages:Edit, D1:Edit; Zone (bbohling.com) → Workers Routes:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (dashboard sidebar or `npx wrangler whoami`) |

Manual deploys: `cd api && bun run deploy` and
`cd ui && VITE_API_URL=/api bun run build && npx wrangler pages deploy dist --project-name=cadence --branch=main`.

Worker runtime secrets (Strava credentials) are NOT in CI — they're set once
via `wrangler secret put STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` and
persist across deploys.

## Data Operations

```bash
# Query production D1
cd api && npx wrangler d1 execute cadence --remote --command "SELECT COUNT(*) FROM activities"

# Export production D1 (backup)
npx wrangler d1 export cadence --remote --output backup.sql

# Trigger an incremental sync by hand
curl -X POST https://cadence.bbohling.com/api/v1/sync/brandon

# Trigger KOM refresh by hand
curl -X POST https://cadence.bbohling.com/api/v1/koms/brandon/current/refresh
```

**Bulk historical sync: local only.** Never call `/v1/sync/bulk/*` against
the deployed Worker — free-tier Workers allow 50 subrequests per invocation
and a bulk sync makes one request per activity. Run backfills locally
(`wrangler dev` + local D1, or the `main` branch's Bun/SQLite setup), then
import the data into remote D1 (see `DEPLOY-CLOUDFLARE.md` for the
statement-size-aware dump procedure).

## API Endpoints

On `cadence.bbohling.com` all paths below are prefixed with `/api`
(e.g. `/api/v1/koms/brandon/stats`); on `workers.dev` they're bare.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/v1/reports/cycling/yearly/:userId` | Yearly stats |
| GET | `/v1/reports/cycling/progress/:userId` | Year-over-year progress |
| GET | `/v1/reports/year-over-year/:userId` | Year-over-year comparison |
| GET | `/v1/reports/gear-usage/:userId` | Gear usage stats |
| GET | `/v1/reports/activity-type/:userId` | Activity type breakdown |
| GET | `/v1/reports/kom-pr-achievements/:userId` | KOM/PR timeline |
| GET | `/v1/koms/:userId` | KOM list — historic (paginated) |
| GET | `/v1/koms/:userId/stats` | KOM stats — historic |
| GET | `/v1/koms/:userId/all` | All KOMs — historic |
| GET | `/v1/koms/:userId/current/stats` | KOM stats — current (live) |
| GET | `/v1/koms/:userId/current` | Ranked segments — current (paginated) |
| POST | `/v1/koms/:userId/current/refresh` | Trigger KOM refresh from Strava |
| POST | `/v1/sync/:userId` | Trigger incremental sync |
| POST | `/v1/sync/bulk/:userId/start` | Start bulk sync (LOCAL DEV ONLY) |
| GET | `/v1/sync/bulk/:userId/status` | Bulk sync status |
| DELETE | `/v1/sync/bulk/:userId/reset` | Reset bulk sync |
| POST | `/v1/sync/normalize` | Trigger normalization |
| GET | `/v1/ensure-fresh/:userId` | Check data freshness |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API runtime | Cloudflare Workers | Zero servers, zero patching, free tier |
| API framework | Hono | Workers-native, lightweight, great DX |
| Database | Cloudflare D1 + Drizzle | Serverless SQLite, type-safe queries |
| Scheduled jobs | Workers Cron Triggers | Replaces PM2 cron processes |
| UI hosting | Cloudflare Pages | Git-push deploys, free, global CDN |
| UI | React + Vite | Industry standard, great tooling |
| Routing | TanStack Router | Type-safe, file-based |
| Data Fetching | TanStack Query | Caching, refetching, loading states |
| Styling | Tailwind CSS v4 | Utility-first, responsive, fast |
| Charts | Recharts | React-native, responsive, declarative |
| CI/CD | GitHub Actions + wrangler-action | Push to main = deploy |
| Local tooling | Bun | Fast installs, native TS for local scripts |

## History

The droplet deployment (Bun + PM2 + Caddy + SQLite on DigitalOcean) lives on
the `main` branch history prior to the Cloudflare migration. The one-time
migration steps are recorded in `DEPLOY-CLOUDFLARE.md`.
