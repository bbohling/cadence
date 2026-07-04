# cadence

A personal cycling dashboard powered by Strava data. Built with Bun, Hono, React, and Drizzle.

## Architecture

```
cadence-bun/
├── api/                  # Hono API (Bun runtime)
│   ├── src/
│   │   ├── db/           # Drizzle schema + SQLite connection
│   │   ├── routes/       # Hono route handlers
│   │   ├── services/     # Business logic (sync, normalize, reports)
│   │   ├── jobs/         # Cron + standalone scripts
│   │   └── utils/        # Config, logging, unit conversions
│   └── drizzle/          # Generated migrations
├── ui/                   # React dashboard (Vite + Tailwind)
│   └── src/
│       ├── routes/       # TanStack Router pages
│       ├── components/   # Dashboard components
│       ├── hooks/        # React hooks
│       └── lib/          # API client, utilities
├── ecosystem.config.cjs  # PM2 configuration
└── Caddyfile.example     # Caddy reverse proxy config
```

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
- Strava API credentials ([create an app](https://www.strava.com/settings/api))

### Setup

```bash
# API
cd api
cp .env.example .env        # Edit with your Strava credentials
bun install
mkdir -p data
bun run db:generate          # Generate migration SQL
bun run db:migrate           # Create tables

# UI
cd ../ui
bun install
```

### Development

```bash
# Terminal 1: API
cd api && bun run dev        # http://localhost:3033

# Terminal 2: UI
cd ui && bun run dev         # http://localhost:5173

# Terminal 3 (optional): Sync cron
cd api && bun src/jobs/sync-cron.ts

# Terminal 4 (optional): KOM refresh cron
cd api && bun src/jobs/kom-refresh-cron.ts
```

### Manual Operations

```bash
# Trigger a one-time sync
cd api && bun src/jobs/sync-cron.ts --once

# Run normalization
cd api && bun src/jobs/normalize.ts
cd api && bun src/jobs/normalize.ts --force    # Re-normalize all

# Refresh current KOM rankings (one-time)
cd api && bun src/jobs/kom-refresh-cron.ts --once

# Start a bulk historical sync
curl -X POST http://localhost:3033/v1/sync/bulk/brandon/start

# Check bulk sync status
curl http://localhost:3033/v1/sync/bulk/brandon/status

# Trigger KOM refresh via API
curl -X POST http://localhost:3033/v1/koms/brandon/current/refresh
```

## Production Deployment (DigitalOcean + Caddy + PM2)

### 1. Build the UI

```bash
cd ui
VITE_API_URL=https://yourdomain.com/api bun run build
```

### 2. Configure PM2

```bash
# From the cadence-bun root
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # Auto-start on reboot
```

### 3. Configure Caddy

Copy `Caddyfile.example` to your Caddy config directory, update the domain
and file paths, then reload Caddy:

```bash
caddy reload --config /etc/caddy/Caddyfile
```

## API Endpoints

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
| POST | `/v1/sync/bulk/:userId/start` | Start bulk sync |
| GET | `/v1/sync/bulk/:userId/status` | Bulk sync status |
| DELETE | `/v1/sync/bulk/:userId/reset` | Reset bulk sync |
| POST | `/v1/sync/normalize` | Trigger normalization |
| GET | `/v1/ensure-fresh/:userId` | Check data freshness |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Bun | Fast startup, native TS, built-in SQLite |
| API | Hono | Lightweight, fast, great DX |
| Database | SQLite + Drizzle | Zero-ops, type-safe, fast reads |
| UI | React + Vite | Industry standard, great tooling |
| Routing | TanStack Router | Type-safe, file-based |
| Data Fetching | TanStack Query | Caching, refetching, loading states |
| Styling | Tailwind CSS v4 | Utility-first, responsive, fast |
| Charts | Recharts | React-native, responsive, declarative |
| Process Manager | PM2 | Production process management |
| Reverse Proxy | Caddy | Auto-HTTPS, simple config |
