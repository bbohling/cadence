import { Hono } from "hono";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  getKomAchievements,
  getKomStats,
  getCurrentKomStats,
  getCurrentKomAchievements,
} from "../services/reports";
import { refreshCurrentKoms, getRefreshStatus } from "../services/kom-refresh";
import { log } from "../utils/logger";

/**
 * KOM routes.
 *
 * Dedicated endpoints for King of the Mountain data.
 *
 * Historic endpoints use the normalized segment_efforts table
 * (rank at time of sync). Current endpoints use segment_current_ranks
 * (refreshed daily from Strava).
 */
const koms = new Hono();

async function resolveAthleteId(userId: string): Promise<number> {
  const user = await db.select().from(users).where(eq(users.name, userId)).get();
  if (!user?.athleteId) throw new Error(`User not found: ${userId}`);
  return user.athleteId;
}

// ── Historic (sync-time) KOM data ───────────────────────

// GET /koms/:userId — paginated KOM list (historic)
koms.get("/:userId", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json(await getKomAchievements(athleteId, limit, offset));
});

// GET /koms/:userId/stats — KOM aggregate stats (historic)
koms.get("/:userId/stats", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  return c.json(await getKomStats(athleteId));
});

// GET /koms/:userId/all — all KOMs, no pagination (historic)
koms.get("/:userId/all", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  return c.json(await getKomAchievements(athleteId, 10000, 0));
});

// ── Current (live) KOM data ─────────────────────────────

// GET /koms/:userId/current/stats — current leaderboard stats
koms.get("/:userId/current/stats", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  return c.json(await getCurrentKomStats(athleteId));
});

// GET /koms/:userId/current — paginated current ranked segments
koms.get("/:userId/current", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json(await getCurrentKomAchievements(athleteId, limit, offset));
});

// POST /koms/:userId/current/refresh — trigger a background KOM refresh
//
// Returns 202 immediately and runs the refresh asynchronously.
// Poll GET /koms/:userId/current/refresh/status to check progress.
koms.post("/:userId/current/refresh", async (c) => {
  const userId = c.req.param("userId");

  const status = getRefreshStatus();
  if (status.running) {
    return c.json(
      { success: false, error: "Refresh already in progress", ...status },
      409
    );
  }

  // Fire-and-forget — run in background
  refreshCurrentKoms(userId)
    .then((result) => {
      log.info("Background KOM refresh finished", { ...result });
    })
    .catch((error) => {
      log.error("Background KOM refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return c.json({ success: true, message: "KOM refresh started" }, 202);
});

// GET /koms/:userId/current/refresh/status — poll refresh progress
koms.get("/:userId/current/refresh/status", async (c) => {
  return c.json(await getRefreshStatus());
});

export { koms };
