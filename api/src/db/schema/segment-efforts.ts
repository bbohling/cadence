import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * segment_efforts — Normalized segment effort data in American English units.
 *
 * Populated by the normalization job from `src_segment_efforts`.
 * Distances converted from meters → miles, elevation from meters → feet.
 *
 * Includes denormalized segment metadata (name, grade, city, etc.)
 * so reports can query without joining additional tables.
 */
export const segmentEfforts = sqliteTable(
  "segment_efforts",
  {
    id: integer("id").primaryKey(),
    activityId: integer("activity_id").notNull(),
    segmentId: integer("segment_id").notNull(),
    athleteId: integer("athlete_id").notNull(),

    name: text("name"),
    elapsedTime: integer("elapsed_time"),
    movingTime: integer("moving_time"),

    startDate: text("start_date"),
    startDateLocal: text("start_date_local"),

    /** Distance in miles */
    distance: real("distance"),
    averageCadence: real("average_cadence"),
    averageWatts: real("average_watts"),
    averageHeartrate: real("average_heartrate"),
    maxHeartrate: real("max_heartrate"),
    deviceWatts: integer("device_watts"),

    prRank: integer("pr_rank"),
    komRank: integer("kom_rank"),

    /** JSON array of achievement objects */
    achievementsJson: text("achievements_json"),

    // ── Denormalized segment metadata ──────────────────
    segmentName: text("segment_name"),
    /** Segment distance in miles */
    segmentDistance: real("segment_distance"),
    segmentAverageGrade: real("segment_average_grade"),
    segmentMaximumGrade: real("segment_maximum_grade"),
    /** Elevation in feet */
    segmentElevationHigh: real("segment_elevation_high"),
    /** Elevation in feet */
    segmentElevationLow: real("segment_elevation_low"),
    segmentClimbCategory: integer("segment_climb_category"),
    segmentCity: text("segment_city"),
    segmentState: text("segment_state"),

    normalizedAt: text("normalized_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_efforts_activity").on(table.activityId),
    index("idx_efforts_segment").on(table.segmentId),
    index("idx_efforts_athlete").on(table.athleteId),
    index("idx_efforts_kom_rank").on(table.komRank),
    index("idx_efforts_pr_rank").on(table.prRank),
    index("idx_efforts_start_date").on(table.startDate),
    index("idx_efforts_athlete_kom").on(table.athleteId, table.komRank),
  ]
);

export type SegmentEffort = typeof segmentEfforts.$inferSelect;
export type NewSegmentEffort = typeof segmentEfforts.$inferInsert;
