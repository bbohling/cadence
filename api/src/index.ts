import { Hono } from "hono";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { logger as honoLogger } from "hono/logger";
import { timing } from "hono/timing";
import { config } from "./utils/config";
import { log } from "./utils/logger";

// ── Routes ─────────────────────────────────────────────
import { reports } from "./routes/reports";
import { koms } from "./routes/koms";
import { sync } from "./routes/sync";
import { health } from "./routes/health";
import { ensureFresh } from "./routes/ensure-fresh";

/**
 * Cadence API — Hono on Bun.
 *
 * A fast, minimal API that serves normalized Strava data to the
 * dashboard UI. All heavy lifting (sync, normalization) happens
 * in background jobs; the API just reads from SQLite.
 *
 * Route structure:
 *   /health              — health check
 *   /v1/reports/*        — dashboard reports
 *   /v1/koms/*           — KOM data
 *   /v1/sync/*           — sync triggers
 *   /v1/ensure-fresh/*   — data freshness checks
 */

const app = new Hono();

// ── Middleware ──────────────────────────────────────────

// CORS — allow the UI to call the API from its dev server
app.use(
  "*",
  cors({
    origin: config.corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type"],
  })
);

// Response compression
app.use("*", compress());

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

// ── Start server ───────────────────────────────────────

log.info(`Cadence API starting on port ${config.port}`, {
  env: config.nodeEnv,
  database: config.databasePath,
});

export default {
  port: config.port,
  fetch: app.fetch,
};
