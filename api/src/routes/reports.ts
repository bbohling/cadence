import { Hono } from "hono";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import {
  getYearlyStats,
  getYearOverYearProgress,
  getGearUsage,
  getActivityTypeBreakdown,
  getKomPrTimeline,
  getInfographicStats,
} from "../services/reports";

/**
 * Report routes.
 *
 * All report endpoints return pre-computed data from the normalized
 * tables. They should all respond in <100ms for typical data volumes.
 *
 * The :userId param is the human-readable username (e.g., "brandon"),
 * which gets resolved to an athleteId for database queries.
 */
const reports = new Hono();

/**
 * Resolve a userId (like "brandon") to a Strava athleteId.
 * Throws 404 if the user doesn't exist.
 */
function resolveAthleteId(userId: string): number {
  const user = db.select().from(users).where(eq(users.name, userId)).get();
  if (!user?.athleteId) {
    throw new Error(`User not found: ${userId}`);
  }
  return user.athleteId;
}

// GET /reports/cycling/yearly/:userId
reports.get("/cycling/yearly/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getYearlyStats(athleteId));
});

// GET /reports/cycling/progress/:userId
reports.get("/cycling/progress/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getYearOverYearProgress(athleteId));
});

// GET /reports/year-over-year/:userId
reports.get("/year-over-year/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getYearOverYearProgress(athleteId));
});

// GET /reports/gear-usage/:userId
reports.get("/gear-usage/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getGearUsage(athleteId));
});

// GET /reports/activity-type/:userId
reports.get("/activity-type/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getActivityTypeBreakdown(athleteId));
});

// GET /reports/kom-pr-achievements/:userId
reports.get("/kom-pr-achievements/:userId", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  return c.json(getKomPrTimeline(athleteId));
});

// GET /reports/infographic/:userId/years — list available years
// NOTE: This must be registered before the /:year route so "years"
// doesn't get matched as a year parameter.
reports.get("/infographic/:userId/years", (c) => {
  const athleteId = resolveAthleteId(c.req.param("userId"));
  const rows = db.all<{ year: number }>(sql`
    SELECT DISTINCT CAST(strftime('%Y', start_date) AS INTEGER) AS year
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date IS NOT NULL
    ORDER BY year DESC
  `);
  return c.json(rows.map((r) => r.year));
});

// GET /reports/infographic/:userId/:year
reports.get("/infographic/:userId/:year", (c) => {
  const userId = c.req.param("userId");
  const athleteId = resolveAthleteId(userId);
  const year = Number(c.req.param("year"));

  if (!year || year < 2000 || year > 2100) {
    return c.json({ error: "Invalid year" }, 400);
  }

  // Use the userId as the display name (capitalized)
  const name = userId.charAt(0).toUpperCase() + userId.slice(1);
  return c.json(getInfographicStats(athleteId, year, name));
});

export { reports };
