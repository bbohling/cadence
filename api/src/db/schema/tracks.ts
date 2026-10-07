import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Track-derived tables.
 *
 * Built from full-resolution recordings (Strava export files for history,
 * Strava streams for new rides) by services/tracks/. Raw tracks are never
 * stored — only these small derived products, which keep D1 well inside
 * the free tier.
 *
 * Kept out of `activities` on purpose: normalization owns that table, and
 * the seed dump stays valid without them.
 *
 * Units are metric (meters, seconds, watts); the report layer converts.
 */

/** One row per activity that has been through track processing. */
export const activityTracks = sqliteTable(
  "activity_tracks",
  {
    /** Strava activity ID */
    activityId: integer("activity_id").primaryKey(),
    athleteId: integer("athlete_id").notNull(),
    /** 'export' (backfill from the Strava archive) or 'streams' (Worker) */
    source: text("source").notNull(),
    /** 'ok' | 'no_data' (nothing usable in the file/streams) */
    status: text("status").notNull(),
    /** Activity start, ISO 8601 UTC (denormalized for year grouping) */
    startDate: text("start_date"),
    /** Points with valid GPS after cleaning */
    gpsPoints: integer("gps_points").notNull().default(0),
    /** GPS distance, meters */
    distanceM: real("distance_m"),
    /** Sorted z14 tile keys, base-36, comma-separated (see tracks/tiles.ts) */
    tilesZ14: text("tiles_z14"),
    /** Google-encoded polyline, ≤1000 points */
    detailPolyline: text("detail_polyline"),
    /** route_clusters.id this ride belongs to */
    routeClusterId: integer("route_cluster_id"),
    processedAt: text("processed_at").notNull(),
  },
  (table) => [
    index("idx_activity_tracks_athlete").on(table.athleteId),
    index("idx_activity_tracks_route").on(table.routeClusterId),
  ]
);

/** Best average power per duration per activity (mean-maximal power). */
export const powerBests = sqliteTable(
  "power_bests",
  {
    activityId: integer("activity_id").notNull(),
    athleteId: integer("athlete_id").notNull(),
    durationS: integer("duration_s").notNull(),
    watts: integer("watts").notNull(),
    /** ISO 8601 UTC, denormalized so the power curve groups by year without a join */
    startDate: text("start_date").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.durationS] }),
    index("idx_power_bests_athlete_duration").on(table.athleteId, table.durationS),
  ]
);

/** Canonical climbs, auto-detected; efforts on the same hill share one. */
export const climbs = sqliteTable(
  "climbs",
  {
    id: integer("id").primaryKey(),
    athleteId: integer("athlete_id").notNull(),
    /** Null until renamed; the UI shows a generated label */
    name: text("name"),
    startLat: real("start_lat").notNull(),
    startLng: real("start_lng").notNull(),
    endLat: real("end_lat").notNull(),
    endLng: real("end_lng").notNull(),
    lengthM: real("length_m").notNull(),
    gainM: real("gain_m").notNull(),
    /** Percent */
    avgGrade: real("avg_grade").notNull(),
  },
  (table) => [index("idx_climbs_athlete").on(table.athleteId)]
);

/** One effort on a canonical climb. */
export const climbEfforts = sqliteTable(
  "climb_efforts",
  {
    activityId: integer("activity_id").notNull(),
    /** Seconds from activity start; with activityId, identifies the effort */
    startOffsetS: integer("start_offset_s").notNull(),
    climbId: integer("climb_id").notNull(),
    athleteId: integer("athlete_id").notNull(),
    /** Effort start, ISO 8601 UTC */
    startDate: text("start_date").notNull(),
    elapsedS: integer("elapsed_s").notNull(),
    avgWatts: integer("avg_watts"),
    avgHr: integer("avg_hr"),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.startOffsetS] }),
    index("idx_climb_efforts_climb").on(table.climbId),
  ]
);

/** Groups of rides over the same route, matched by z16 tile overlap. */
export const routeClusters = sqliteTable(
  "route_clusters",
  {
    id: integer("id").primaryKey(),
    athleteId: integer("athlete_id").notNull(),
    name: text("name"),
    /** First ride on this route; its geometry represents the cluster */
    repActivityId: integer("rep_activity_id").notNull(),
    /** Sorted z16 tile keys of the representative ride, base-36 */
    tilesZ16: text("tiles_z16").notNull(),
    distanceM: real("distance_m").notNull(),
  },
  (table) => [index("idx_route_clusters_athlete_distance").on(table.athleteId, table.distanceM)]
);

export type ActivityTrack = typeof activityTracks.$inferSelect;
export type PowerBestRow = typeof powerBests.$inferSelect;
export type Climb = typeof climbs.$inferSelect;
export type ClimbEffort = typeof climbEfforts.$inferSelect;
export type RouteClusterRow = typeof routeClusters.$inferSelect;
