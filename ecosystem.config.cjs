/**
 * PM2 ecosystem configuration for Cadence (cadence.brndn.me).
 *
 * Manages three processes:
 *   1. cadence-api        — Hono API server (port 3033)
 *   2. cadence-sync       — Hourly Strava sync + normalization
 *   3. cadence-kom-refresh — Daily KOM current rankings refresh
 *
 * Secrets are loaded from api/.env by Bun automatically.
 * Do NOT put secrets in this file — it is version-controlled.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs          # start all
 *   pm2 restart ecosystem.config.cjs        # restart all
 *   pm2 delete cadence-api cadence-sync cadence-kom-refresh  # remove all
 *   pm2 save                                # persist process list for reboot
 */
module.exports = {
  apps: [
    {
      name: "cadence-api",
      cwd: "./api",
      script: "src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
        PORT: 3033,
      },
      // Restart on crash with exponential backoff
      max_restarts: 10,
      min_uptime: "5s",
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
      // Log config
      error_file: "/var/log/pm2/cadence-api-error.log",
      out_file: "/var/log/pm2/cadence-api-out.log",
      merge_logs: true,
      time: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
    {
      name: "cadence-sync",
      cwd: "./api",
      script: "src/jobs/sync-cron.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      // Restart on crash
      max_restarts: 5,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      // Log config
      error_file: "/var/log/pm2/cadence-sync-error.log",
      out_file: "/var/log/pm2/cadence-sync-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "cadence-kom-refresh",
      cwd: "./api",
      script: "src/jobs/kom-refresh-cron.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      // Restart on crash
      max_restarts: 5,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      // Log config
      error_file: "/var/log/pm2/cadence-kom-refresh-error.log",
      out_file: "/var/log/pm2/cadence-kom-refresh-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
