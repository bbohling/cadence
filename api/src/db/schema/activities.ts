import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * activities — Normalized activity data in American English units.
 *
 * Populated by the normalization job which reads from `src_activities`
 * and converts all measurements:
 *   - distance: meters → miles
 *   - elevation: meters → feet
 *   - speed: m/s → mph
 *   - temperature: °C → °F
 *
 * Also includes computed fields (komCount, bestKomRank, bestPrRank)
 * derived from the segment efforts normalization.
 */
export const activities = sqliteTable(
  "activities",
  {
    /** Same ID as src_activities (Strava activity ID) */
    id: integer("id").primaryKey(),
    athleteId: integer("athlete_id").notNull(),

    name: text("name"),
    type: text("type"),
    sportType: text("sport_type"),

    // ── Distance & time (imperial) ─────────────────────
    /** Distance in miles */
    distance: real("distance"),
    /** Moving time in seconds (unchanged from source) */
    movingTime: integer("moving_time"),
    /** Total elapsed time in seconds */
    elapsedTime: integer("elapsed_time"),

    // ── Elevation (feet) ───────────────────────────────
    totalElevationGain: real("total_elevation_gain"),
    elevHigh: real("elev_high"),
    elevLow: real("elev_low"),

    // ── Timestamps ─────────────────────────────────────
    startDate: text("start_date"),
    startDateLocal: text("start_date_local"),
    timezone: text("timezone"),

    // ── Speed (mph) ────────────────────────────────────
    averageSpeed: real("average_speed"),
    maxSpeed: real("max_speed"),

    // ── Power & cadence (unchanged — already universal) ─
    averageCadence: real("average_cadence"),
    averageWatts: real("average_watts"),
    maxWatts: real("max_watts"),
    weightedAverageWatts: real("weighted_average_watts"),
    kilojoules: real("kilojoules"),
    deviceWatts: integer("device_watts"),

    // ── Heart rate (unchanged — BPM is universal) ──────
    averageHeartrate: real("average_heartrate"),
    maxHeartrate: real("max_heartrate"),
    hasHeartrate: integer("has_heartrate"),

    // ── Misc ───────────────────────────────────────────
    sufferScore: integer("suffer_score"),
    achievementCount: integer("achievement_count"),
    prCount: integer("pr_count"),
    calories: real("calories"),
    /** Temperature in Fahrenheit */
    averageTemp: real("average_temp"),

    // ── Flags ──────────────────────────────────────────
    trainer: integer("trainer"),
    commute: integer("commute"),
    gearId: text("gear_id"),

    // ── Computed from segment efforts ──────────────────
    /** Number of KOMs in this activity's segment efforts */
    komCount: integer("kom_count").default(0),
    /** Best (lowest) KOM rank across all segment efforts */
    bestKomRank: integer("best_kom_rank"),
    /** Best (lowest) PR rank across all segment efforts */
    bestPrRank: integer("best_pr_rank"),

    // ── Map ────────────────────────────────────────────
    mapSummaryPolyline: text("map_summary_polyline"),

    /** ISO timestamp of when normalization last ran on this row */
    normalizedAt: text("normalized_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_activities_athlete").on(table.athleteId),
    index("idx_activities_start_date").on(table.startDate),
    index("idx_activities_type").on(table.type),
    index("idx_activities_kom_count").on(table.komCount),
    index("idx_activities_gear").on(table.gearId),
    index("idx_activities_athlete_date").on(table.athleteId, table.startDate),
    index("idx_activities_athlete_type").on(table.athleteId, table.type),
  ]
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
