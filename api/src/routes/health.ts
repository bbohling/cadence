import { Hono } from "hono";
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

/**
 * Health check route.
 *
 * Used by PM2, Caddy, or any monitoring tool to verify the API
 * is running and can reach the database.
 */
const health = new Hono();

health.get("/", (c) => {
  try {
    // Quick database ping
    db.get(sql`SELECT 1`);

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch {
    return c.json({ status: "error", message: "Database unreachable" }, 503);
  }
});

export { health };
