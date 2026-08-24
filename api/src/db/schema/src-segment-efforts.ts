import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * src_segment_efforts — Raw segment effort data from Strava (metric units).
 *
 * Each activity can contain many segment efforts. These are stored
 * individually so we can query KOMs, PRs, and segment stats efficiently.
 *
 * Like src_activities, each row keeps the full `rawJson` for resilience
 * against Strava API changes, plus typed columns for fast queries.
 */
export const srcSegmentEfforts = sqliteTable(
  "src_segment_efforts",
  {
    /** Strava segment effort ID */
    id: integer("id").primaryKey(),

    /** The activity this effort belongs to */
    activityId: integer("activity_id").notNull(),

    /** The segment definition ID */
    segmentId: integer("segment_id").notNull(),

    /** Strava athlete ID */
    athleteId: integer("athlete_id").notNull(),

    /** Complete segment effort JSON from the API */
    rawJson: text("raw_json").notNull(),

    name: text("name"),

    /** Elapsed time in seconds */
    elapsedTime: integer("elapsed_time"),
    /** Moving time in seconds */
    movingTime: integer("moving_time"),

    /** ISO 8601 timestamps */
    startDate: text("start_date"),
    startDateLocal: text("start_date_local"),

    /** Distance in meters */
    distance: real("distance"),

    averageCadence: real("average_cadence"),
    averageWatts: real("average_watts"),
    averageHeartrate: real("average_heartrate"),
    maxHeartrate: real("max_heartrate"),
    deviceWatts: integer("device_watts"),

    /** PR rank (1 = personal best, 2 = second best, etc.) — null if none */
    prRank: integer("pr_rank"),
    /** KOM rank (1 = KOM, 2 = second, etc.) — null if none */
    komRank: integer("kom_rank"),

    /** JSON object with segment details (name, distance, grade, etc.) */
    segmentJson: text("segment_json"),
    /** JSON array of achievement objects */
    achievementsJson: text("achievements_json"),

    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_src_efforts_activity").on(table.activityId),
    index("idx_src_efforts_segment").on(table.segmentId),
    index("idx_src_efforts_athlete").on(table.athleteId),
    index("idx_src_efforts_kom_rank").on(table.komRank),
    index("idx_src_efforts_pr_rank").on(table.prRank),
    index("idx_src_efforts_start_date").on(table.startDate),
    index("idx_src_efforts_updated_at").on(table.updatedAt),
  ]
);

export type SrcSegmentEffort = typeof srcSegmentEfforts.$inferSelect;
export type NewSrcSegmentEffort = typeof srcSegmentEfforts.$inferInsert;
