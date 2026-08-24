import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { timing } from "hono/timing";
import { config } from "./utils/config";
import { log } from "./utils/logger";
import { initDb } from "./db/connection";

// ── Routes ─────────────────────────────────────────────
import { reports } from "./routes/reports";
import { koms } from "./routes/koms";
import { sync } from "./routes/sync";
import { health } from "./routes/health";
import { ensureFresh } from "./routes/ensure-fresh";

// ── Scheduled jobs ─────────────────────────────────────
import { syncUser } from "./services/sync";
import { runNormalization } from "./services/normalize";
import { refreshCurrentKoms } from "./services/kom-refresh";
import { pruneOperationalLogs } from "./services/prune";

/**
 * Cadence API — Hono on Cloudflare Workers.
 *
 * A fast, minimal API that serves normalized Strava data to the
 * dashboard UI. Data lives in D1 (serverless SQLite). Background
 * work runs via Cron Triggers in the scheduled() handler below —
 * no separate processes, no PM2.
 *
 * Route structure:
 *   /health              — health check
 *   /v1/reports/*        — dashboard reports
 *   /v1/koms/*           — KOM data
 *   /v1/sync/*           — sync triggers
 *   /v1/ensure-fresh/*   — data freshness checks
 *
 * NOTE: compression middleware is intentionally absent — Cloudflare
 * compresses responses at the edge.
 */

type Env = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ──────────────────────────────────────────

// Bind D1 to the shared drizzle instance (no-op after first request)
app.use("*", async (c, next) => {
  initDb(c.env.DB);
  await next();
});

// CORS — allow the UI to call the API from its dev server / Pages
app.use(
  "*",
  cors({
    origin: (_origin) => config.corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type"],
  })
);

// Request logging (dev only)
if (config.isDev) {
  app.use("*", honoLogger());
}

// Server timing headers (shows response time in DevTools)
app.use("*", timing());

// ── Error handling ─────────────────────────────────────

app.onError((err, c) => {
  log.error("Unhandled error", {
    error: err.message,
    path: c.req.path,
    method: c.req.method,
  });
  return c.json(
    {
      error: err.message,
      ...(config.isDev ? { stack: err.stack } : {}),
    },
    500
  );
});

// ── Routes ─────────────────────────────────────────────

app.route("/health", health);
app.route("/v1/reports", reports);
app.route("/v1/koms", koms);
app.route("/v1/sync", sync);
app.route("/v1/ensure-fresh", ensureFresh);

// The zone route cadence.bbohling.com/api/* delivers requests WITH the
// /api prefix (the Pages site owns all other paths on that host). Mount
// the same app under /api so both workers.dev and the route work.
const root = new Hono<{ Bindings: Env }>();
root.route("/", app);
root.route("/api", app);

// ── Cron handlers ──────────────────────────────────────
// Schedules are defined in wrangler.jsonc (UTC):
//   "5 * * * *"  — hourly Strava sync + normalization
//   "0 12 * * *" — daily KOM refresh (~4–5 AM Pacific)

const HOURLY_SYNC = "5 * * * *";
const DAILY_KOM_REFRESH = "0 12 * * *";

async function runScheduled(cron: string): Promise<void> {
  const userId = config.defaultUserId;

  switch (cron) {
    case HOURLY_SYNC: {
      log.info("Cron sync starting", { userId });
      const syncResult = await syncUser(userId);
      log.info("Cron sync complete, running normalization", { ...syncResult });
      const normResult = await runNormalization();
      log.info("Cron normalization complete", { ...normResult });
      break;
    }
    case DAILY_KOM_REFRESH: {
      log.info("KOM refresh cron starting", { userId });
      const result = await refreshCurrentKoms(userId);
      log.info("KOM refresh cron complete", { ...result });
      // Piggyback the log retention sweep on the once-a-day cron.
      await pruneOperationalLogs();
      break;
    }
    default:
      log.warn("Unknown cron trigger", { cron });
  }
}

// ── Worker entry ───────────────────────────────────────

export default {
  fetch: root.fetch,

  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    initDb(env.DB);
    ctx.waitUntil(runScheduled(event.cron));
  },
};
