/**
 * Centralized configuration.
 *
 * All environment variables and constants live here. The app reads
 * from `process.env` (Bun loads .env files automatically) and falls
 * back to sensible defaults for development.
 *
 * WHY: Having one source of truth for config makes it easy to see
 * what the app depends on, and prevents env vars from being scattered
 * across random files.
 */

/** Helper to read env vars with a default value */
function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/** Helper to read numeric env vars */
function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  // ── Server ──────────────────────────────────────────
  // NOTE: env-derived values are getters so they read process.env
  // lazily — on Cloudflare Workers, vars/secrets are populated per
  // execution context, not necessarily at module-load time.
  get port() {
    return envInt("PORT", 3033);
  },
  get nodeEnv() {
    return env("NODE_ENV", "development");
  },
  get isDev() {
    return this.nodeEnv === "development";
  },

  // ── Database ────────────────────────────────────────
  get databasePath() {
    return env("DATABASE_PATH", "./data/cadence.db");
  },

  // ── Strava ──────────────────────────────────────────
  strava: {
    get clientId() {
      return env("STRAVA_CLIENT_ID", "");
    },
    get clientSecret() {
      return env("STRAVA_CLIENT_SECRET", "");
    },
    apiBaseUrl: "https://www.strava.com/api/v3",
    oauthUrl: "https://www.strava.com/oauth/token",
  },

  // ── CORS ────────────────────────────────────────────
  get corsOrigin() {
    return env("CORS_ORIGIN", "http://localhost:5173");
  },

  // ── Data freshness ──────────────────────────────────
  /** Minutes before data is considered stale */
  get ingestStalenessMinutes() {
    return envInt("INGEST_STALENESS_MINUTES", 30);
  },
  /** Minimum minutes between background syncs */
  get ingestMinIntervalMinutes() {
    return envInt("INGEST_MIN_INTERVAL_MINUTES", 15);
  },

  // ── Rate limits (Strava defaults) ───────────────────
  rateLimits: {
    overall15min: 600,
    overallDaily: 6000,
    read15min: 300,
    readDaily: 3000,
  },

  // ── Bulk sync tuning ────────────────────────────────
  bulkSync: {
    /** Max Strava API requests to use per day during bulk sync */
    dailyLimit: 2500,
    /** Number of detail requests to make in parallel */
    batchSize: 5,
    /** Milliseconds to wait between batches */
    delayBetweenBatches: 2000,
  },

  // ── User ────────────────────────────────────────────
  defaultUserId: "brandon",
} as const;
