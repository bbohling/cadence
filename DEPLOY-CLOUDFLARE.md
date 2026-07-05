# Cloudflare Setup Record

Record of the one-time migration from the DigitalOcean droplet to Cloudflare
(July 2026), kept for disaster recovery — i.e., what it takes to recreate the
environment from scratch. Day-to-day deploys are CI/CD (see README).

## What exists

| Piece | Value |
|---|---|
| Worker | `cadence-api` (crons `5 * * * *`, `0 12 * * *` UTC) |
| Worker URL | https://cadence-api.bbohling.workers.dev (bare paths) |
| Zone route | `cadence.bbohling.com/api/*` → cadence-api (paths keep the `/api` prefix) |
| D1 database | `cadence`, id `8862b224-8157-44d9-8552-06f07012c47c` |
| Pages project | `cadence`, production branch `main`, custom domain `cadence.bbohling.com` |
| DNS | `bbohling.com` zone on Cloudflare (registrar: Porkbun); `cadence` is a proxied CNAME → `cadence-97l.pages.dev`; iCloud mail records (MX ×2, SPF, apple-domain TXT, `sig1._domainkey` DKIM CNAME — DNS-only) |
| Worker secrets | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` via `wrangler secret put` |
| GitHub secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

## Recreate from scratch

1. `cd api && npx wrangler d1 create cadence` → paste new id into `wrangler.jsonc`
2. Import data (see rules below): `npx wrangler d1 execute cadence --remote --file <dump.sql>`
3. `npx wrangler secret put STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`
4. `npx wrangler deploy` (zone must be active for the route to register)
5. Pages: create project `cadence` (production branch `main`), add custom
   domain `cadence.bbohling.com`, deploy UI:
   `cd ui && VITE_API_URL=/api bun run build && npx wrangler pages deploy dist --project-name=cadence --branch=main`

## D1 import rules (hard-won)

- **Never use `sqlite3 .dump`** — sqlite3 ≥ 3.50 emits `unistr()` calls that
  D1's SQLite doesn't support.
- **Every statement must stay under ~90 KB** (D1 caps ~100 KB/statement) or
  the import fails with `SQLITE_TOOBIG`. Some rows are individually larger
  (Strava `raw_json` up to ~155 KB, long `summary_polyline`s): insert those
  rows with the oversized column empty, then append it in chunks with
  `UPDATE t SET col = col || '<chunk>' WHERE id = ...`. Quote-escaping can
  nearly double a chunk (polylines are full of `'`) — size chunks by their
  escaped length.
- A generator implementing all of this lives in the ops repo
  (`~/Documents/Claude/Projects/digitalocean`, session scripts); it produced
  `api/data/cadence-d1-dump.sql` and verified the result by restoring into a
  scratch SQLite db and comparing row counts + blob bytes.
- Verify after import:
  `npx wrangler d1 execute cadence --remote --command "SELECT COUNT(*) FROM activities"`

## Gotchas encountered (so you don't re-live them)

- Pages custom domain serves **production deployments only**; a deploy tagged
  with a non-production branch gets a preview URL (`main.<project>.pages.dev`)
  and the custom domain shows Cloudflare's "Nothing is here yet". Fix:
  Settings → Builds → production branch, then redeploy with `--branch main`.
- Wrangler OAuth tokens can fail `d1 create` with auth error 10000 despite
  showing the `d1 (write)` scope — `wrangler logout && wrangler login` fixes it.
- The pages.dev preview URLs can't reach the API (`/api` is a zone route on
  the custom domain only) — preview builds render but have no data.
- Bulk sync: local only (50 subrequests/invocation on the Workers free tier).
