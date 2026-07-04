# Cadence Deploy Migration — Action Items

Migrate from centralized webhook deploy to GitHub Actions + SSH with per-repo configs.

## Phase 1: Local (Mac)

- [ ] Generate SSH deploy key
  ```bash
  ssh-keygen -t ed25519 -C "github-actions-cadence" -f ~/.ssh/gh_actions_cadence
  ```
- [ ] Copy public key to droplet
  ```bash
  ssh-copy-id -i ~/.ssh/gh_actions_cadence.pub your_user@your_droplet_ip
  ```
- [ ] Add GitHub repo secrets (`Settings → Secrets and variables → Actions`):
  - [ ] `DROPLET_HOST` — droplet IP or hostname
  - [ ] `DROPLET_USER` — SSH username
  - [ ] `SSH_PRIVATE_KEY` — contents of `~/.ssh/gh_actions_cadence`
- [ ] Add GitHub repo **variable** (same page → Variables tab):
  - [ ] `VITE_API_URL` — e.g. `https://cadence.brndn.me/api` (baked into UI build in CI)
- [ ] Confirm bun is reachable over non-interactive SSH:
  `ssh user@host 'bun --version'` (deploy.sh exports `~/.bun/bin`, but verify)
- [ ] Push the new files to `main` (`cadence.caddy`, `deploy.sh`, `.github/workflows/deploy.yml`, updated `ecosystem.config.cjs`, `Caddyfile.example`)

## Phase 2: DigitalOcean DNS

- [ ] Add wildcard A record in DigitalOcean DNS panel
  - Type: `A`, Hostname: `*`, Value: `your_droplet_ip`
  - Existing explicit A records can stay — they take priority over the wildcard

## Phase 3: Server (Droplet)

> **Disk is at 90% (3.1G free).** Before deploying, free space:
> `bun pm ls` cruft, old `node_modules`, apt cache (`sudo apt clean`), old logs
> (`pm2 flush`, `/var/log`). UI build no longer runs on the server (CI ships
> `ui/dist`), so the droplet no longer needs the UI toolchain or `ui/node_modules`.


### Caddy sites directory (one-time setup for all projects)

- [ ] Create the sites directory
  ```bash
  sudo mkdir -p /etc/caddy/sites
  ```
- [ ] Add import line to the main Caddyfile (after the global `{ }` block, before site blocks)
  ```caddy
  import /etc/caddy/sites/*.caddy
  ```
- [ ] Validate: `caddy validate --config /etc/caddy/Caddyfile`

### Cadence project setup

- [ ] Clone the repo
  ```bash
  git clone git@github.com:bbohling/cadence.git /usr/share/nginx/cadence
  ```
- [ ] Create secrets file at `/usr/share/nginx/cadence/api/.env`
  ```env
  STRAVA_CLIENT_ID=...
  STRAVA_CLIENT_SECRET=...
  CORS_ORIGIN=https://cadence.brndn.me
  DATABASE_PATH=./data/cadence.db
  ```
- [ ] Ensure the PM2 log directory exists
  ```bash
  sudo mkdir -p /var/log/pm2
  ```
- [ ] Make deploy script executable
  ```bash
  chmod +x /usr/share/nginx/cadence/deploy.sh
  ```

### First deploy (manual)

- [ ] Run deploy script
  ```bash
  cd /usr/share/nginx/cadence && ./deploy.sh
  ```
- [ ] Verify PM2 processes: `pm2 list` — all 3 `lifestream-*` processes show `online`
- [ ] Verify API: `curl localhost:3033/health`
- [ ] Symlink Caddy config
  ```bash
  ln -s /usr/share/nginx/cadence/cadence.caddy /etc/caddy/sites/cadence.caddy
  ```
- [ ] Verify Caddy config and reload
  ```bash
  caddy validate --config /etc/caddy/Caddyfile && sudo caddy reload
  ```
- [ ] Verify site loads: `curl -I https://cadence.brndn.me` and `curl https://cadence.brndn.me/api/health`

## Phase 4: Clean up old systems

- [ ] Remove `brndn.me { ... }` block from the central Caddyfile
- [ ] Reload Caddy: `caddy validate --config /etc/caddy/Caddyfile && sudo caddy reload`
- [ ] Remove `brndn_api` entry from central PM2 `sites.json`
- [ ] Remove `bbohling/lifestream-ui` and `bbohling/lifestream-api` from webhook app's `REPO_CONFIG`
- [ ] Save PM2 process list: `pm2 save`

## Phase 5: Verify GitHub Actions

- [ ] Push a trivial change to `main`
- [ ] Watch the GitHub Actions run complete in the Actions tab
- [ ] Verify site updates after automated deploy
- [ ] Check PM2 logs for errors: `pm2 logs lifestream-api --lines 20`
