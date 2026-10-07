import { sql } from "drizzle-orm";
import { db } from "../db/connection";
import { decodeTiles, explorerStats, keyToXY } from "./tracks/tiles";
import { POWER_DURATIONS_S } from "./tracks/power";

/**
 * Reports over the track-derived tables (tiles, power, climbs, routes).
 *
 * Storage is metric; responses are imperial like every other report
 * (miles, feet), except watts and seconds.
 */

const M_PER_MI = 1609.344;
const FT_PER_M = 3.28084;

// ── Explorer tiles ─────────────────────────────────────

export interface ExplorerTilesReport {
  tiles: number;
  maxSquare: number;
  /** Top-left [x, y] of the max square, z14 */
  maxSquareOrigin: [number, number] | null;
  maxCluster: number;
  newThisYear: number;
  year: number;
  /** [x, y, firstVisitYear] for every visited z14 tile */
  visited: Array<[number, number, number]>;
}

export async function getExplorerTiles(athleteId: number): Promise<ExplorerTilesReport> {
  const rows = await db.all<{ tiles_z14: string; start_date: string | null }>(sql`
    SELECT tiles_z14, start_date
    FROM activity_tracks
    WHERE athlete_id = ${athleteId} AND tiles_z14 IS NOT NULL
    ORDER BY start_date ASC
  `);

  // Oldest first, so the first time a tile is seen is its first visit
  const firstYear = new Map<number, number>();
  for (const r of rows) {
    const year = r.start_date ? Number(r.start_date.slice(0, 4)) : 0;
    for (const k of decodeTiles(r.tiles_z14)) {
      if (!firstYear.has(k)) firstYear.set(k, year);
    }
  }

  const year = new Date().getUTCFullYear();
  const stats = explorerStats(firstYear.keys());
  let newThisYear = 0;
  const visited: Array<[number, number, number]> = [];
  for (const [k, y] of firstYear) {
    if (y === year) newThisYear++;
    const [x, ty] = keyToXY(k, 14);
    visited.push([x, ty, y]);
  }

  return { ...stats, newThisYear, year, visited };
}

// ── Power curve ────────────────────────────────────────

export interface PowerCurvePoint {
  durationS: number;
  watts: number;
  activityId: number;
  startDate: string;
}

export interface PowerCurveReport {
  durations: number[];
  /** Best per duration across all years */
  allTime: PowerCurvePoint[];
  /** Best per duration, per year (newest first) */
  years: Array<{ year: number; points: PowerCurvePoint[] }>;
}

export async function getPowerCurve(athleteId: number): Promise<PowerCurveReport> {
  // SQLite returns the bare columns from the row that holds MAX(watts)
  const rows = await db.all<{
    year: string;
    duration_s: number;
    watts: number;
    activity_id: number;
    start_date: string;
  }>(sql`
    SELECT substr(start_date, 1, 4) AS year, duration_s, MAX(watts) AS watts,
           activity_id, start_date
    FROM power_bests
    WHERE athlete_id = ${athleteId}
    GROUP BY year, duration_s
    ORDER BY year DESC, duration_s ASC
  `);

  const byYear = new Map<number, PowerCurvePoint[]>();
  const allTime = new Map<number, PowerCurvePoint>();
  for (const r of rows) {
    const point = { durationS: r.duration_s, watts: r.watts, activityId: r.activity_id, startDate: r.start_date };
    const y = Number(r.year);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(point);
    const best = allTime.get(r.duration_s);
    if (!best || point.watts > best.watts) allTime.set(r.duration_s, point);
  }

  return {
    durations: [...POWER_DURATIONS_S],
    allTime: [...allTime.values()].sort((a, b) => a.durationS - b.durationS),
    years: [...byYear].map(([year, points]) => ({ year, points })),
  };
}

// ── Climbs ─────────────────────────────────────────────

export interface ClimbSummary {
  id: number;
  name: string | null;
  /** Miles */
  length: number;
  /** Feet */
  gain: number;
  avgGrade: number;
  efforts: number;
  bestElapsedS: number;
  bestDate: string;
  bestActivityId: number;
  lastDate: string;
  /** [lat, lng] */
  start: [number, number];
  end: [number, number];
}

/** Climbs ridden at least `minEfforts` times, most-ridden first. */
export async function getClimbs(athleteId: number, minEfforts = 2): Promise<ClimbSummary[]> {
  const rows = await db.all<{
    id: number; name: string | null; length_m: number; gain_m: number; avg_grade: number;
    start_lat: number; start_lng: number; end_lat: number; end_lng: number;
    efforts: number; best_elapsed_s: number; best_date: string; best_activity_id: number; last_date: string;
  }>(sql`
    SELECT c.id, c.name, c.length_m, c.gain_m, c.avg_grade,
           c.start_lat, c.start_lng, c.end_lat, c.end_lng,
           COUNT(*) AS efforts,
           MIN(e.elapsed_s) AS best_elapsed_s,
           e.start_date AS best_date,
           e.activity_id AS best_activity_id,
           (SELECT MAX(start_date) FROM climb_efforts WHERE climb_id = c.id) AS last_date
    FROM climbs c
    JOIN climb_efforts e ON e.climb_id = c.id
    WHERE c.athlete_id = ${athleteId}
    GROUP BY c.id
    HAVING COUNT(*) >= ${minEfforts}
    ORDER BY efforts DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    length: r.length_m / M_PER_MI,
    gain: r.gain_m * FT_PER_M,
    avgGrade: r.avg_grade,
    efforts: r.efforts,
    bestElapsedS: r.best_elapsed_s,
    bestDate: r.best_date,
    bestActivityId: r.best_activity_id,
    lastDate: r.last_date,
    start: [r.start_lat, r.start_lng],
    end: [r.end_lat, r.end_lng],
  }));
}

export interface ClimbEffortRow {
  activityId: number;
  activityName: string | null;
  startDate: string;
  elapsedS: number;
  avgWatts: number | null;
  avgHr: number | null;
  /** 1 = fastest */
  rank: number;
}

export interface ClimbDetail {
  climb: Omit<ClimbSummary, "bestElapsedS" | "bestDate" | "bestActivityId" | "lastDate" | "efforts">;
  /** Chronological */
  efforts: ClimbEffortRow[];
}

export async function getClimbDetail(athleteId: number, climbId: number): Promise<ClimbDetail | null> {
  const climb = await db.get<{
    id: number; name: string | null; length_m: number; gain_m: number; avg_grade: number;
    start_lat: number; start_lng: number; end_lat: number; end_lng: number;
  }>(sql`
    SELECT id, name, length_m, gain_m, avg_grade, start_lat, start_lng, end_lat, end_lng
    FROM climbs WHERE id = ${climbId} AND athlete_id = ${athleteId}
  `);
  if (!climb) return null;

  const efforts = await db.all<{
    activity_id: number; name: string | null; start_date: string;
    elapsed_s: number; avg_watts: number | null; avg_hr: number | null; rank: number;
  }>(sql`
    SELECT e.activity_id, a.name, e.start_date, e.elapsed_s, e.avg_watts, e.avg_hr,
           RANK() OVER (ORDER BY e.elapsed_s ASC) AS rank
    FROM climb_efforts e
    LEFT JOIN activities a ON a.id = e.activity_id
    WHERE e.climb_id = ${climbId}
    ORDER BY e.start_date ASC
  `);

  return {
    climb: {
      id: climb.id,
      name: climb.name,
      length: climb.length_m / M_PER_MI,
      gain: climb.gain_m * FT_PER_M,
      avgGrade: climb.avg_grade,
      start: [climb.start_lat, climb.start_lng],
      end: [climb.end_lat, climb.end_lng],
    },
    efforts: efforts.map((e) => ({
      activityId: e.activity_id,
      activityName: e.name,
      startDate: e.start_date,
      elapsedS: e.elapsed_s,
      avgWatts: e.avg_watts,
      avgHr: e.avg_hr,
      rank: e.rank,
    })),
  };
}

// ── Routes ─────────────────────────────────────────────

export interface RouteSummary {
  id: number;
  /** Name of the first ride on the route (clusters have no name of their own) */
  name: string | null;
  /** Miles */
  distance: number;
  rides: number;
  firstDate: string;
  lastDate: string;
  /** Fastest average speed of any ride on the route, mph */
  bestSpeed: number | null;
  /** Encoded polyline of the representative ride */
  polyline: string | null;
}

/** Routes ridden at least `minRides` times, most-ridden first. */
export async function getRoutes(athleteId: number, minRides = 3): Promise<RouteSummary[]> {
  const rows = await db.all<{
    id: number; name: string | null; rep_name: string | null; distance_m: number;
    rides: number; first_date: string; last_date: string; best_speed: number | null;
    polyline: string | null;
  }>(sql`
    SELECT r.id, r.name, rep.name AS rep_name, r.distance_m,
           COUNT(t.activity_id) AS rides,
           MIN(t.start_date) AS first_date,
           MAX(t.start_date) AS last_date,
           MAX(a.average_speed) AS best_speed,
           rt.detail_polyline AS polyline
    FROM route_clusters r
    JOIN activity_tracks t ON t.route_cluster_id = r.id
    LEFT JOIN activities a ON a.id = t.activity_id
    LEFT JOIN activities rep ON rep.id = r.rep_activity_id
    LEFT JOIN activity_tracks rt ON rt.activity_id = r.rep_activity_id
    WHERE r.athlete_id = ${athleteId}
    GROUP BY r.id
    HAVING COUNT(t.activity_id) >= ${minRides}
    ORDER BY rides DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? r.rep_name,
    distance: r.distance_m / M_PER_MI,
    rides: r.rides,
    firstDate: r.first_date,
    lastDate: r.last_date,
    bestSpeed: r.best_speed,
    polyline: r.polyline,
  }));
}

export interface RouteRide {
  activityId: number;
  name: string | null;
  startDate: string;
  /** mph */
  avgSpeed: number | null;
  avgWatts: number | null;
  avgHeartrate: number | null;
  movingTime: number | null;
}

/** Every ride on one route, chronological — the fitness-trend view. */
export async function getRouteRides(athleteId: number, routeId: number): Promise<RouteRide[]> {
  const rows = await db.all<{
    id: number; name: string | null; start_date: string; average_speed: number | null;
    average_watts: number | null; average_heartrate: number | null; moving_time: number | null;
  }>(sql`
    SELECT a.id, a.name, t.start_date, a.average_speed, a.average_watts,
           a.average_heartrate, a.moving_time
    FROM activity_tracks t
    JOIN activities a ON a.id = t.activity_id
    WHERE t.route_cluster_id = ${routeId} AND t.athlete_id = ${athleteId}
    ORDER BY t.start_date ASC
  `);
  return rows.map((r) => ({
    activityId: r.id,
    name: r.name,
    startDate: r.start_date,
    avgSpeed: r.average_speed,
    avgWatts: r.average_watts,
    avgHeartrate: r.average_heartrate,
    movingTime: r.moving_time,
  }));
}

// ── Per-ride extras (ride detail page) ─────────────────

export interface RideTrackExtras {
  detailPolyline: string | null;
  climbs: Array<{
    climbId: number;
    name: string | null;
    length: number;
    avgGrade: number;
    elapsedS: number;
    avgWatts: number | null;
    rank: number;
    efforts: number;
  }>;
  powerBests: Array<{ durationS: number; watts: number; allTimeBest: number }>;
}

export async function getRideTrackExtras(athleteId: number, activityId: number): Promise<RideTrackExtras> {
  const track = await db.get<{ detail_polyline: string | null }>(sql`
    SELECT detail_polyline FROM activity_tracks
    WHERE activity_id = ${activityId} AND athlete_id = ${athleteId}
  `);

  const climbRows = await db.all<{
    climb_id: number; name: string | null; length_m: number; avg_grade: number;
    elapsed_s: number; avg_watts: number | null; rank: number; efforts: number;
  }>(sql`
    SELECT ranked.climb_id, c.name, c.length_m, c.avg_grade,
           ranked.elapsed_s, ranked.avg_watts, ranked.rank, ranked.efforts
    FROM (
      SELECT climb_id, activity_id, start_offset_s, elapsed_s, avg_watts,
             RANK() OVER (PARTITION BY climb_id ORDER BY elapsed_s) AS rank,
             COUNT(*) OVER (PARTITION BY climb_id) AS efforts
      FROM climb_efforts
      WHERE climb_id IN (SELECT climb_id FROM climb_efforts WHERE activity_id = ${activityId})
    ) ranked
    JOIN climbs c ON c.id = ranked.climb_id
    WHERE ranked.activity_id = ${activityId}
    ORDER BY ranked.start_offset_s
  `);

  const powerRows = await db.all<{ duration_s: number; watts: number; all_time: number }>(sql`
    SELECT p.duration_s, p.watts,
           (SELECT MAX(watts) FROM power_bests
            WHERE athlete_id = ${athleteId} AND duration_s = p.duration_s) AS all_time
    FROM power_bests p
    WHERE p.activity_id = ${activityId}
    ORDER BY p.duration_s
  `);

  return {
    detailPolyline: track?.detail_polyline ?? null,
    climbs: climbRows.map((r) => ({
      climbId: r.climb_id,
      name: r.name,
      length: r.length_m / M_PER_MI,
      avgGrade: r.avg_grade,
      elapsedS: r.elapsed_s,
      avgWatts: r.avg_watts,
      rank: r.rank,
      efforts: r.efforts,
    })),
    powerBests: powerRows.map((r) => ({ durationS: r.duration_s, watts: r.watts, allTimeBest: r.all_time })),
  };
}
