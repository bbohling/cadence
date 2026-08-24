import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * src_activities — Raw Strava activity data stored as-is (metric units).
 *
 * DESIGN NOTES (Strava API resilience):
 * ─────────────────────────────────────
 * 1. `rawJson` stores the complete API response as a safety net.
 *    If Strava adds, removes, or renames fields, we never lose data.
 *
 * 2. Typed columns extract the fields we actively use. These make
 *    queries fast and let Drizzle enforce types at compile time.
 *
 * 3. `schemaVersion` tracks which extraction logic populated the
 *    typed columns. When we update our extraction code, we bump the
 *    version and can selectively re-extract older rows.
 *
 * 4. All values are in Strava's native units (metric):
 *    - distance: meters
 *    - elevation: meters
 *    - speed: meters/second
 *    - temperature: celsius
 *    The normalization job converts these to imperial in the
 *    `activities` table.
 */
export const srcActivities = sqliteTable(
  "src_activities",
  {
    /** Strava activity ID — used as primary key */
    id: integer("id").primaryKey(),

    /** Strava athlete ID */
    athleteId: integer("athlete_id").notNull(),

    /** Complete Strava API JSON response (safety net) */
    rawJson: text("raw_json").notNull(),

    // ── Basic info ─────────────────────────────────────
    name: text("name"),
    type: text("type"),
    sportType: text("sport_type"),

    // ── Distance & time (metric) ───────────────────────
    /** Distance in meters */
    distance: real("distance"),
    /** Moving time in seconds */
    movingTime: integer("moving_time"),
    /** Total elapsed time in seconds */
    elapsedTime: integer("elapsed_time"),

    // ── Elevation (meters) ─────────────────────────────
    totalElevationGain: real("total_elevation_gain"),
    elevHigh: real("elev_high"),
    elevLow: real("elev_low"),

    // ── Timestamps ─────────────────────────────────────
    /** ISO 8601 UTC start time */
    startDate: text("start_date"),
    /** ISO 8601 local start time */
    startDateLocal: text("start_date_local"),
    timezone: text("timezone"),

    // ── Speed (m/s) ────────────────────────────────────
    averageSpeed: real("average_speed"),
    maxSpeed: real("max_speed"),

    // ── Power & cadence ────────────────────────────────
    averageCadence: real("average_cadence"),
    averageWatts: real("average_watts"),
    maxWatts: real("max_watts"),
    weightedAverageWatts: real("weighted_average_watts"),
    kilojoules: real("kilojoules"),
    deviceWatts: integer("device_watts"),

    // ── Heart rate ─────────────────────────────────────
    averageHeartrate: real("average_heartrate"),
    maxHeartrate: real("max_heartrate"),
    hasHeartrate: integer("has_heartrate"),

    // ── Misc metrics ───────────────────────────────────
    sufferScore: integer("suffer_score"),
    achievementCount: integer("achievement_count"),
    prCount: integer("pr_count"),
    calories: real("calories"),
    /** Temperature in Celsius */
    averageTemp: real("average_temp"),

    // ── Flags ──────────────────────────────────────────
    trainer: integer("trainer"),
    commute: integer("commute"),

    // ── Gear ───────────────────────────────────────────
    gearId: text("gear_id"),

    // ── Segment efforts ────────────────────────────────
    /** JSON array of segment effort objects from the API */
    segmentEffortsJson: text("segment_efforts_json"),

    // ── Map data ───────────────────────────────────────
    mapSummaryPolyline: text("map_summary_polyline"),

    // ── Schema tracking ────────────────────────────────
    /**
     * Tracks the version of our field-extraction logic.
     * Bump this when changing which fields we pull from rawJson.
     */
    schemaVersion: integer("schema_version").notNull().default(1),

    /** When this row was fetched from Strava */
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_src_activities_athlete").on(table.athleteId),
    index("idx_src_activities_start_date").on(table.startDate),
    index("idx_src_activities_type").on(table.type),
    index("idx_src_activities_updated_at").on(table.updatedAt),
  ]
);

export type SrcActivity = typeof srcActivities.$inferSelect;
export type NewSrcActivity = typeof srcActivities.$inferInsert;
