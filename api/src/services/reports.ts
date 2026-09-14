import { eq, sql, and, gte, lte, desc, asc, isNotNull } from "drizzle-orm";
import { db } from "../db/connection";
import { activities, segmentEfforts, gears } from "../db/schema";
import { log } from "../utils/logger";

/**
 * Report service.
 *
 * All report queries operate on the normalized tables (imperial units).
 * Each function returns data ready for the API response — no further
 * transformation needed.
 *
 * PERFORMANCE: All queries use indexed columns and avoid full table scans.
 * Most return in <50ms for typical data volumes (<10,000 activities).
 */

// ── Types ──────────────────────────────────────────────

export interface YearlyStats {
  year: number;
  totalRides: number;
  totalDistance: number;
  totalElevation: number;
  totalCalories: number;
  totalMovingTime: number;
  avgSpeed: number;
  avgDistance: number;
  avgHeartrate: number | null;
  avgWatts: number | null;
}

export interface YearProgress {
  year: number;
  throughDate: string;
  rides: number;
  distance: number;
  elevation: number;
  calories: number;
  movingTime: number;
}

export interface GearUsage {
  id: string;
  name: string;
  brandName: string | null;
  modelName: string | null;
  totalDistance: number;
  totalRides: number;
  totalElevation: number;
  totalMovingTime: number;
  isPrimary: boolean;
}

export interface ActivityTypeBreakdown {
  type: string;
  count: number;
  totalDistance: number;
  totalMovingTime: number;
  totalElevation: number;
}

export interface KomAchievement {
  id: number;
  activityId: number;
  activityName: string | null;
  segmentName: string;
  komRank: number;
  prRank: number | null;
  elapsedTime: number;
  distance: number | null;
  startDate: string;
  segmentAverageGrade: number | null;
  segmentCity: string | null;
  segmentState: string | null;
}

// ── Yearly Stats ───────────────────────────────────────

/**
 * Get yearly cycling statistics.
 *
 * Returns one row per year with aggregate totals for rides,
 * distance, elevation, calories, and moving time.
 */
export async function getYearlyStats(athleteId: number): Promise<YearlyStats[]> {
  const rows = await db.all<{
    year: number;
    total_rides: number;
    total_distance: number;
    total_elevation: number;
    total_calories: number;
    total_moving_time: number;
    avg_speed: number;
    avg_distance: number;
    avg_heartrate: number | null;
    avg_watts: number | null;
  }>(sql`
    SELECT
      CAST(strftime('%Y', start_date) AS INTEGER) AS year,
      COUNT(*) AS total_rides,
      ROUND(COALESCE(SUM(distance), 0), 2) AS total_distance,
      ROUND(COALESCE(SUM(total_elevation_gain), 0), 0) AS total_elevation,
      ROUND(COALESCE(SUM(calories), 0), 0) AS total_calories,
      COALESCE(SUM(moving_time), 0) AS total_moving_time,
      ROUND(COALESCE(AVG(average_speed), 0), 2) AS avg_speed,
      ROUND(COALESCE(AVG(distance), 0), 2) AS avg_distance,
      ROUND(AVG(CASE WHEN average_heartrate > 0 THEN average_heartrate END), 1) AS avg_heartrate,
      ROUND(AVG(CASE WHEN average_watts > 0 THEN average_watts END), 1) AS avg_watts
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date IS NOT NULL
    GROUP BY year
    ORDER BY year DESC
  `);

  return rows.map((r) => ({
    year: r.year,
    totalRides: r.total_rides,
    totalDistance: r.total_distance,
    totalElevation: r.total_elevation,
    totalCalories: r.total_calories,
    totalMovingTime: r.total_moving_time,
    avgSpeed: r.avg_speed,
    avgDistance: r.avg_distance,
    avgHeartrate: r.avg_heartrate,
    avgWatts: r.avg_watts,
  }));
}

// ── Year-over-Year Progress ────────────────────────────

/**
 * Compare current year progress vs. last year at the same date.
 *
 * Returns stats for both years through today's month/day,
 * so the comparison is fair (apples to apples).
 */
export async function getYearOverYearProgress(athleteId: number): Promise<YearProgress[]> {
  const currentYear = new Date().getFullYear();
  const mmdd = new Date().toISOString().slice(5, 10); // "02-15"

  const years = [currentYear, currentYear - 1];

  return Promise.all(years.map(async (year) => {
    const startOfYear = `${year}-01-01T00:00:00Z`;
    const throughDate = `${year}-${mmdd}T23:59:59Z`;

    // NOTE: await db.all() returns objects with named keys; await db.get() returns
    // an array of values (Drizzle bun-sqlite quirk), so we use all()[0].
    const row = (await db.all<{
      rides: number;
      distance: number;
      elevation: number;
      calories: number;
      moving_time: number;
    }>(sql`
      SELECT
        COUNT(*) AS rides,
        ROUND(COALESCE(SUM(distance), 0), 2) AS distance,
        ROUND(COALESCE(SUM(total_elevation_gain), 0), 0) AS elevation,
        ROUND(COALESCE(SUM(calories), 0), 0) AS calories,
        COALESCE(SUM(moving_time), 0) AS moving_time
      FROM activities
      WHERE athlete_id = ${athleteId}
        AND type IN ('Ride', 'VirtualRide')
        AND start_date >= ${startOfYear}
        AND start_date <= ${throughDate}
    `))[0];

    return {
      year,
      throughDate: `${year}-${mmdd}`,
      rides: row?.rides ?? 0,
      distance: row?.distance ?? 0,
      elevation: row?.elevation ?? 0,
      calories: row?.calories ?? 0,
      movingTime: row?.moving_time ?? 0,
    };
  }));
}

// ── Gear Usage ─────────────────────────────────────────

/**
 * Get usage statistics for each piece of gear.
 *
 * Joins gear metadata with activity aggregates so we can show
 * total distance, rides, etc. per bike/shoe.
 */
export async function getGearUsage(athleteId: number): Promise<GearUsage[]> {
  const rows = await db.all<{
    id: string;
    name: string;
    brand_name: string | null;
    model_name: string | null;
    primary_gear: number;
    total_distance: number;
    total_rides: number;
    total_elevation: number;
    total_moving_time: number;
  }>(sql`
    SELECT
      g.id,
      g.name,
      g.brand_name,
      g.model_name,
      g.primary_gear,
      ROUND(COALESCE(SUM(a.distance), 0), 2) AS total_distance,
      COUNT(a.id) AS total_rides,
      ROUND(COALESCE(SUM(a.total_elevation_gain), 0), 0) AS total_elevation,
      COALESCE(SUM(a.moving_time), 0) AS total_moving_time
    FROM gears g
    LEFT JOIN activities a ON a.gear_id = g.id
    WHERE g.athlete_id = ${athleteId}
    GROUP BY g.id
    ORDER BY total_distance DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brandName: r.brand_name,
    modelName: r.model_name,
    totalDistance: r.total_distance,
    totalRides: r.total_rides,
    totalElevation: r.total_elevation,
    totalMovingTime: r.total_moving_time,
    isPrimary: r.primary_gear === 1,
  }));
}

// ── Activity Type Breakdown ────────────────────────────

/**
 * Get activity counts and totals grouped by activity type.
 */
export async function getActivityTypeBreakdown(athleteId: number): Promise<ActivityTypeBreakdown[]> {
  const rows = await db.all<{
    type: string;
    count: number;
    total_distance: number;
    total_moving_time: number;
    total_elevation: number;
  }>(sql`
    SELECT
      type,
      COUNT(*) AS count,
      ROUND(COALESCE(SUM(distance), 0), 2) AS total_distance,
      COALESCE(SUM(moving_time), 0) AS total_moving_time,
      ROUND(COALESCE(SUM(total_elevation_gain), 0), 0) AS total_elevation
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IS NOT NULL
    GROUP BY type
    ORDER BY count DESC
  `);

  return rows.map((r) => ({
    type: r.type,
    count: r.count,
    totalDistance: r.total_distance,
    totalMovingTime: r.total_moving_time,
    totalElevation: r.total_elevation,
  }));
}

// ── KOM/PR Achievements ────────────────────────────────

/**
 * Get KOM and PR achievements — one row per unique segment.
 *
 * For each segment, returns only the effort with the best (lowest) KOM rank.
 * If there are ties (same rank on same segment), picks the most recent effort.
 * Sorted by best rank ascending, then most recent first.
 */
export async function getKomAchievements(
  athleteId: number,
  limit = 50,
  offset = 0
): Promise<{ data: KomAchievement[]; total: number }> {
  const total = (await db.all<{ count: number }>(sql`
    SELECT COUNT(DISTINCT se.segment_id) AS count
    FROM segment_efforts se
    WHERE se.athlete_id = ${athleteId}
      AND se.kom_rank IS NOT NULL
  `))[0];

  const rows = await db.all<{
    id: number;
    activity_id: number;
    activity_name: string | null;
    segment_name: string;
    kom_rank: number;
    pr_rank: number | null;
    elapsed_time: number;
    distance: number | null;
    start_date: string;
    segment_average_grade: number | null;
    segment_city: string | null;
    segment_state: string | null;
  }>(sql`
    SELECT
      se.id,
      se.activity_id,
      a.name AS activity_name,
      se.segment_name,
      se.kom_rank,
      se.pr_rank,
      se.elapsed_time,
      se.distance,
      se.start_date,
      se.segment_average_grade,
      se.segment_city,
      se.segment_state
    FROM segment_efforts se
    JOIN activities a ON a.id = se.activity_id
    WHERE se.athlete_id = ${athleteId}
      AND se.kom_rank IS NOT NULL
      AND se.id = (
        SELECT sub.id
        FROM segment_efforts sub
        WHERE sub.segment_id = se.segment_id
          AND sub.athlete_id = ${athleteId}
          AND sub.kom_rank IS NOT NULL
        ORDER BY sub.kom_rank ASC, sub.start_date DESC
        LIMIT 1
      )
    ORDER BY se.kom_rank ASC, se.start_date DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return {
    total: total?.count ?? 0,
    data: rows.map((r) => ({
      id: r.id,
      activityId: r.activity_id,
      activityName: r.activity_name,
      segmentName: r.segment_name,
      komRank: r.kom_rank,
      prRank: r.pr_rank,
      elapsedTime: r.elapsed_time,
      distance: r.distance,
      startDate: r.start_date,
      segmentAverageGrade: r.segment_average_grade,
      segmentCity: r.segment_city,
      segmentState: r.segment_state,
    })),
  };
}

/**
 * Get KOM stats summary — counts by best rank per unique segment.
 *
 * Each segment is counted once using its best (lowest) kom_rank across
 * all efforts. This matches what Strava/VeloViewer show: "how many
 * unique segments do I hold 1st, 2nd, 3rd place on?"
 *
 * Also returns cumulative "top N" counts (top5 = segments ranked 1–5,
 * top10 = segments ranked 1–10).
 */
export async function getKomStats(athleteId: number): Promise<{
  total: number;
  byRank: Record<string, number>;
  top5: number;
  top10: number;
}> {
  const rows = await db.all<{ best_rank: number; count: number }>(sql`
    SELECT
      best_rank,
      COUNT(*) AS count
    FROM (
      SELECT
        segment_id,
        MIN(kom_rank) AS best_rank
      FROM segment_efforts
      WHERE athlete_id = ${athleteId}
        AND kom_rank IS NOT NULL
      GROUP BY segment_id
    )
    GROUP BY best_rank
    ORDER BY best_rank ASC
  `);

  const byRank: Record<string, number> = {};
  let total = 0;
  let top5 = 0;
  let top10 = 0;

  for (const row of rows) {
    byRank[String(row.best_rank)] = row.count;
    total += row.count;
    if (row.best_rank <= 5) top5 += row.count;
    if (row.best_rank <= 10) top10 += row.count;
  }

  return { total, byRank, top5, top10 };
}

// ── Current KOM Rankings ────────────────────────────────

/**
 * Get current KOM stats from the segment_current_ranks table.
 *
 * Returns the same shape as getKomStats (byRank, top5, top10) but
 * based on the latest fetched ranks rather than historic sync data.
 */
export async function getCurrentKomStats(athleteId: number): Promise<{
  total: number;
  byRank: Record<string, number>;
  top5: number;
  top10: number;
  lastChecked: string | null;
}> {
  const rows = await db.all<{ current_rank: number; count: number }>(sql`
    SELECT
      current_rank,
      COUNT(*) AS count
    FROM segment_current_ranks
    WHERE athlete_id = ${athleteId}
      AND current_rank IS NOT NULL
    GROUP BY current_rank
    ORDER BY current_rank ASC
  `);

  const lastCheckedRow = (await db.all<{ checked_at: string }>(sql`
    SELECT checked_at
    FROM segment_current_ranks
    WHERE athlete_id = ${athleteId}
    ORDER BY checked_at DESC
    LIMIT 1
  `))[0];

  const byRank: Record<string, number> = {};
  let total = 0;
  let top5 = 0;
  let top10 = 0;

  for (const row of rows) {
    byRank[String(row.current_rank)] = row.count;
    total += row.count;
    if (row.current_rank <= 5) top5 += row.count;
    if (row.current_rank <= 10) top10 += row.count;
  }

  return { total, byRank, top5, top10, lastChecked: lastCheckedRow?.checked_at ?? null };
}

/**
 * Get current KOM achievements — ranked segments with current data.
 *
 * Similar to getKomAchievements but reads from segment_current_ranks
 * to show the most up-to-date leaderboard positions.
 */
export async function getCurrentKomAchievements(
  athleteId: number,
  limit = 50,
  offset = 0
): Promise<{
  data: Array<{
    segmentId: number;
    segmentName: string | null;
    currentRank: number;
    previousRank: number | null;
    elapsedTime: number | null;
    distance: number | null;
    averageGrade: number | null;
    city: string | null;
    state: string | null;
    checkedAt: string;
  }>;
  total: number;
}> {
  const total = (await db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count
    FROM segment_current_ranks
    WHERE athlete_id = ${athleteId}
      AND current_rank IS NOT NULL
  `))[0];

  const rows = await db.all<{
    segment_id: number;
    segment_name: string | null;
    current_rank: number;
    previous_rank: number | null;
    elapsed_time: number | null;
    distance: number | null;
    average_grade: number | null;
    city: string | null;
    state: string | null;
    checked_at: string;
  }>(sql`
    SELECT
      segment_id,
      segment_name,
      current_rank,
      previous_rank,
      elapsed_time,
      distance,
      average_grade,
      city,
      state,
      checked_at
    FROM segment_current_ranks
    WHERE athlete_id = ${athleteId}
      AND current_rank IS NOT NULL
    ORDER BY current_rank ASC, segment_name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return {
    total: total?.count ?? 0,
    data: rows.map((r) => ({
      segmentId: r.segment_id,
      segmentName: r.segment_name,
      currentRank: r.current_rank,
      previousRank: r.previous_rank,
      elapsedTime: r.elapsed_time,
      distance: r.distance,
      averageGrade: r.average_grade,
      city: r.city,
      state: r.state,
      checkedAt: r.checked_at,
    })),
  };
}

// ── Infographic Stats ───────────────────────────────────

export interface InfographicStats {
  year: number;
  athleteName: string;
  totalDistance: number;
  totalElevation: number;
  totalMovingTime: number;
  totalRides: number;
  totalCalories: number;
  avgSpeed: number;
  maxRideDistance: number;
  maxRideElevation: number;
  maxRideTime: number;
  maxRideAvgSpeed: number;
  activeDays: number;
  maxStreak: number;
  newKoms: number;
  everestMultiplier: number;
  /** Daily ride flags for heatmap — "YYYY-MM-DD" strings */
  activeDates: string[];
  /** Per-ride data for the elevation/distance chart at the bottom */
  rides: Array<{
    date: string;
    distance: number;
    elevation: number;
  }>;
}

const EVEREST_FEET = 29_032;

/**
 * Compute all statistics needed for a year-in-review infographic.
 *
 * Returns aggregated totals, single-ride maxima, active day streak,
 * KOM count, and per-ride data for charting.
 */
export async function getInfographicStats(
  athleteId: number,
  year: number,
  athleteName: string
): Promise<InfographicStats> {
  const startOfYear = `${year}-01-01T00:00:00Z`;
  const endOfYear = `${year}-12-31T23:59:59Z`;

  // ── Aggregates ────────────────────────────────────
  const agg = (await db.all<{
    total_rides: number;
    total_distance: number;
    total_elevation: number;
    total_moving_time: number;
    total_calories: number;
    avg_speed: number;
    max_ride_distance: number;
    max_ride_elevation: number;
    max_ride_time: number;
    max_ride_avg_speed: number;
  }>(sql`
    SELECT
      COUNT(*) AS total_rides,
      ROUND(COALESCE(SUM(distance), 0), 2) AS total_distance,
      ROUND(COALESCE(SUM(total_elevation_gain), 0), 0) AS total_elevation,
      COALESCE(SUM(moving_time), 0) AS total_moving_time,
      ROUND(COALESCE(SUM(calories), 0), 0) AS total_calories,
      ROUND(COALESCE(AVG(average_speed), 0), 1) AS avg_speed,
      ROUND(COALESCE(MAX(distance), 0), 1) AS max_ride_distance,
      ROUND(COALESCE(MAX(total_elevation_gain), 0), 0) AS max_ride_elevation,
      COALESCE(MAX(moving_time), 0) AS max_ride_time,
      ROUND(COALESCE(MAX(average_speed), 0), 1) AS max_ride_avg_speed
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date >= ${startOfYear}
      AND start_date <= ${endOfYear}
  `))[0]!;

  // ── Active dates + streak calculation ─────────────
  const dateRows = await db.all<{ ride_date: string }>(sql`
    SELECT DISTINCT DATE(start_date) AS ride_date
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date >= ${startOfYear}
      AND start_date <= ${endOfYear}
    ORDER BY ride_date ASC
  `);

  const activeDates = dateRows.map((r) => r.ride_date);
  const activeDays = activeDates.length;

  // Compute max consecutive-day streak
  let maxStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < activeDates.length; i++) {
    if (i === 0) {
      currentStreak = 1;
    } else {
      const prev = new Date(activeDates[i - 1]!);
      const curr = new Date(activeDates[i]!);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  // ── New KOMs earned this year ─────────────────────
  const komRow = (await db.all<{ new_koms: number }>(sql`
    SELECT COUNT(DISTINCT segment_id) AS new_koms
    FROM segment_efforts
    WHERE athlete_id = ${athleteId}
      AND kom_rank IS NOT NULL
      AND start_date >= ${startOfYear}
      AND start_date <= ${endOfYear}
  `))[0]!;

  // ── Per-ride data for chart ───────────────────────
  const rides = await db.all<{
    ride_date: string;
    distance: number;
    elevation: number;
  }>(sql`
    SELECT
      DATE(start_date) AS ride_date,
      ROUND(COALESCE(distance, 0), 2) AS distance,
      ROUND(COALESCE(total_elevation_gain, 0), 0) AS elevation
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date >= ${startOfYear}
      AND start_date <= ${endOfYear}
    ORDER BY start_date ASC
  `);

  return {
    year,
    athleteName,
    totalDistance: agg.total_distance,
    totalElevation: agg.total_elevation,
    totalMovingTime: agg.total_moving_time,
    totalRides: agg.total_rides,
    totalCalories: agg.total_calories,
    avgSpeed: agg.avg_speed,
    maxRideDistance: agg.max_ride_distance,
    maxRideElevation: agg.max_ride_elevation,
    maxRideTime: agg.max_ride_time,
    maxRideAvgSpeed: agg.max_ride_avg_speed,
    activeDays,
    maxStreak,
    newKoms: komRow.new_koms,
    everestMultiplier: Math.round((agg.total_elevation / EVEREST_FEET) * 10) / 10,
    activeDates,
    rides: rides.map((r) => ({
      date: r.ride_date,
      distance: r.distance,
      elevation: r.elevation,
    })),
  };
}

// ── Recent Rides ───────────────────────────────────────

export interface RecentRide {
  id: number;
  name: string | null;
  type: string;
  /** Strava's start_date_local — wall-clock time at the ride, despite the trailing "Z" */
  startDateLocal: string;
  distance: number;
  movingTime: number;
  elevation: number;
  avgSpeed: number | null;
  avgHeartrate: number | null;
  avgWatts: number | null;
  calories: number | null;
  achievementCount: number;
  prCount: number;
  komCount: number;
  trainer: boolean;
}

/**
 * Most recent rides (Ride + VirtualRide), newest first.
 */
export async function getRecentRides(athleteId: number, limit = 5): Promise<RecentRide[]> {
  const rows = await db.all<{
    id: number;
    name: string | null;
    type: string;
    start_date_local: string;
    distance: number | null;
    moving_time: number | null;
    total_elevation_gain: number | null;
    average_speed: number | null;
    average_heartrate: number | null;
    average_watts: number | null;
    calories: number | null;
    achievement_count: number | null;
    pr_count: number | null;
    kom_count: number | null;
    trainer: number | null;
  }>(sql`
    SELECT
      id, name, type, start_date_local, distance, moving_time,
      total_elevation_gain, average_speed, average_heartrate, average_watts,
      calories, achievement_count, pr_count, kom_count, trainer
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND type IN ('Ride', 'VirtualRide')
      AND start_date IS NOT NULL
    ORDER BY start_date DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    startDateLocal: r.start_date_local,
    distance: r.distance ?? 0,
    movingTime: r.moving_time ?? 0,
    elevation: r.total_elevation_gain ?? 0,
    avgSpeed: r.average_speed,
    avgHeartrate: r.average_heartrate,
    avgWatts: r.average_watts,
    calories: r.calories,
    achievementCount: r.achievement_count ?? 0,
    prCount: r.pr_count ?? 0,
    komCount: r.kom_count ?? 0,
    trainer: r.trainer === 1,
  }));
}

// ── KOM/PR Achievement Timeline ────────────────────────

/**
 * KOM/PR achievements grouped by month for timeline charts.
 */
export async function getKomPrTimeline(athleteId: number): Promise<
  Array<{
    month: string;
    koms: number;
    prs: number;
  }>
> {
  return await db.all<{ month: string; koms: number; prs: number }>(sql`
    SELECT
      strftime('%Y-%m', start_date) AS month,
      SUM(CASE WHEN kom_rank IS NOT NULL THEN 1 ELSE 0 END) AS koms,
      SUM(CASE WHEN pr_rank IS NOT NULL THEN 1 ELSE 0 END) AS prs
    FROM segment_efforts
    WHERE athlete_id = ${athleteId}
      AND (kom_rank IS NOT NULL OR pr_rank IS NOT NULL)
    GROUP BY month
    ORDER BY month ASC
  `);
}
