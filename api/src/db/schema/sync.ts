import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * sync_logs — Records of each sync operation (incremental or manual).
 *
 * Useful for debugging sync issues and monitoring system health.
 */
export const syncLogs = sqliteTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    timestamp: text("timestamp").notNull(),
    success: integer("success").notNull(),
    activitiesAdded: integer("activities_added").default(0),
    activitiesUpdated: integer("activities_updated").default(0),
    komsAdded: integer("koms_added").default(0),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_sync_logs_user").on(table.userId),
    index("idx_sync_logs_timestamp").on(table.timestamp),
  ]
);

/**
 * bulk_sync_states — Tracks progress of bulk historical syncs.
 *
 * Bulk syncs can take days because of Strava's rate limits.
 * This table lets us pause, resume, and track progress across
 * multiple runs.
 */
export const bulkSyncStates = sqliteTable("bulk_sync_states", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  athleteId: integer("athlete_id"),

  /** 'pending' | 'running' | 'paused' | 'complete' | 'error' */
  status: text("status").notNull().default("pending"),
  /** 'summary_fetch' | 'detail_fetch' | 'complete' */
  phase: text("phase").notNull().default("summary_fetch"),

  totalActivities: integer("total_activities").default(0),
  processedActivities: integer("processed_activities").default(0),
  processedSummaries: integer("processed_summaries").default(0),
  requestsUsedToday: integer("requests_used_today").default(0),
  currentPage: integer("current_page").default(1),

  /** JSON array of already-processed activity IDs */
  processedActivityIds: text("processed_activity_ids").default("[]"),

  startDate: text("start_date"),
  lastResetDate: text("last_reset_date"),
  completedAt: text("completed_at"),
  errorMessage: text("error_message"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * bulk_sync_summaries — Temporary storage for activity summaries
 * during the bulk sync "summary_fetch" phase.
 *
 * Once detail fetch is complete, these can be cleaned up.
 */
export const bulkSyncSummaries = sqliteTable(
  "bulk_sync_summaries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    activityId: integer("activity_id").notNull(),
    /** Complete summary JSON from the list endpoint */
    summaryData: text("summary_data").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_bulk_summaries_user").on(table.userId)]
);

/**
 * rate_limit_logs — Tracks Strava API rate limit consumption.
 *
 * Strava enforces both 15-minute and daily limits for overall
 * and read-specific requests. This table logs each API call's
 * rate limit headers so we can monitor usage and avoid bans.
 */
export const rateLimitLogs = sqliteTable(
  "rate_limit_logs",
  {
    id: text("id").primaryKey(),
    timestamp: text("timestamp").notNull(),
    endpoint: text("endpoint"),

    overallUsage15min: integer("overall_usage_15min"),
    overallUsageDaily: integer("overall_usage_daily"),
    readUsage15min: integer("read_usage_15min"),
    readUsageDaily: integer("read_usage_daily"),

    maxUtilizationPct: real("max_utilization_pct"),
    delayAppliedMs: integer("delay_applied_ms"),
    wasRateLimited: integer("was_rate_limited"),
    retryAfterMs: integer("retry_after_ms"),

    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_rate_limits_timestamp").on(table.timestamp),
    index("idx_rate_limits_daily").on(table.overallUsageDaily),
  ]
);


/**
 * normalize_state — Watermarks for the incremental normalization pass.
 *
 * One row per source table. `watermark` holds the highest
 * `src_*.updated_at` value that has been normalized, as an ISO 8601
 * string (see `now()` in src/utils/ids.ts — always UTC, so plain string
 * comparison is chronological).
 *
 * Before this existed, each normalization run found dirty rows with a
 * cross-table left join (`activities.updated_at < src_activities.updated_at`),
 * which no index can serve — so every hourly cron scanned both source
 * tables in full whether or not anything had changed. The watermark turns
 * that into an indexed range scan that reads nothing on an idle run.
 */
export const normalizeState = sqliteTable("normalize_state", {
  /** 'activities' | 'segment_efforts' | 'gears' */
  key: text("key").primaryKey(),
  /** Highest src updated_at normalized so far ('' = nothing yet) */
  watermark: text("watermark").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type BulkSyncState = typeof bulkSyncStates.$inferSelect;
export type RateLimitLog = typeof rateLimitLogs.$inferSelect;
export type NormalizeState = typeof normalizeState.$inferSelect;
