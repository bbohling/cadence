import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * segment_current_ranks — Current leaderboard rank per unique segment.
 *
 * Populated by a daily job that re-fetches segment data from Strava.
 * Unlike the historic `kom_rank` on segment_efforts (which is frozen at
 * sync time), these values reflect the athlete's current standing.
 *
 * One row per segment — always the athlete's best effort on that segment.
 */
export const segmentCurrentRanks = sqliteTable(
  "segment_current_ranks",
  {
    /** Strava segment ID (one row per segment) */
    segmentId: integer("segment_id").primaryKey(),

    /** Strava athlete ID */
    athleteId: integer("athlete_id").notNull(),

    /** The segment effort ID this rank comes from */
    effortId: integer("effort_id"),

    /** Segment name (denormalized for display) */
    segmentName: text("segment_name"),

    /** Current leaderboard rank (1 = KOM, 2 = 2nd, etc.) — null if dropped off */
    currentRank: integer("current_rank"),

    /** Previous rank from the last refresh (for tracking changes) */
    previousRank: integer("previous_rank"),

    /** Elapsed time in seconds for the ranked effort */
    elapsedTime: integer("elapsed_time"),

    /** Distance in miles */
    distance: real("distance"),

    /** Segment average grade */
    averageGrade: real("average_grade"),

    /** Segment city */
    city: text("city"),

    /** Segment state */
    state: text("state"),

    /** When this rank was last verified against Strava */
    checkedAt: text("checked_at").notNull(),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_current_ranks_athlete").on(table.athleteId),
    index("idx_current_ranks_rank").on(table.currentRank),
    index("idx_current_ranks_athlete_rank").on(table.athleteId, table.currentRank),
  ]
);

export type SegmentCurrentRank = typeof segmentCurrentRanks.$inferSelect;
export type NewSegmentCurrentRank = typeof segmentCurrentRanks.$inferInsert;
