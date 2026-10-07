import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users } from "../db/schema";
import {
  getExplorerTiles,
  getPowerCurve,
  getClimbs,
  getClimbDetail,
  getRoutes,
  getRouteRides,
  getRideTrackExtras,
} from "../services/track-reports";

/**
 * Track routes — reports over the track-derived tables.
 *
 * The data only changes when the hourly cron processes a ride, so every
 * response carries a short private cache lifetime.
 */
const tracks = new Hono();

async function resolveAthleteId(userId: string): Promise<number> {
  const user = await db.select().from(users).where(eq(users.name, userId)).get();
  if (!user?.athleteId) {
    throw new Error(`User not found: ${userId}`);
  }
  return user.athleteId;
}

function positiveId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

tracks.use("*", async (c, next) => {
  await next();
  if (c.res.status === 200) c.header("Cache-Control", "private, max-age=600");
});

// GET /tracks/tiles/:userId — explorer tiles + max square / cluster
tracks.get("/tiles/:userId", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  return c.json(await getExplorerTiles(athleteId));
});

// GET /tracks/power-curve/:userId — mean-max power by year and all-time
tracks.get("/power-curve/:userId", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  return c.json(await getPowerCurve(athleteId));
});

// GET /tracks/climbs/:userId?min=2 — climbs ridden at least `min` times
tracks.get("/climbs/:userId", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const min = Math.min(Math.max(Number(c.req.query("min")) || 2, 1), 100);
  return c.json(await getClimbs(athleteId, min));
});

// GET /tracks/climbs/:userId/:id — every effort on one climb
tracks.get("/climbs/:userId/:id", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const id = positiveId(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid climb id" }, 400);
  const detail = await getClimbDetail(athleteId, id);
  if (!detail) return c.json({ error: "Climb not found" }, 404);
  return c.json(detail);
});

// GET /tracks/routes/:userId?min=3 — routes ridden at least `min` times
tracks.get("/routes/:userId", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const min = Math.min(Math.max(Number(c.req.query("min")) || 3, 2), 100);
  return c.json(await getRoutes(athleteId, min));
});

// GET /tracks/routes/:userId/:id — every ride on one route
tracks.get("/routes/:userId/:id", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const id = positiveId(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid route id" }, 400);
  return c.json(await getRouteRides(athleteId, id));
});

// GET /tracks/ride/:userId/:id — detail polyline, climbs and power for one ride
tracks.get("/ride/:userId/:id", async (c) => {
  const athleteId = await resolveAthleteId(c.req.param("userId"));
  const id = positiveId(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ride id" }, 400);
  return c.json(await getRideTrackExtras(athleteId, id));
});

export { tracks };
