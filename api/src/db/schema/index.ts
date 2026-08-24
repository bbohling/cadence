/**
 * Database schema barrel export.
 *
 * All Drizzle table definitions are re-exported from here so you can
 * import everything from a single path:
 *
 *   import { users, activities, srcActivities } from "@/db/schema";
 */

// ── Source tables (raw Strava data, metric units) ──────
export { srcActivities } from "./src-activities";
export type { SrcActivity, NewSrcActivity } from "./src-activities";

export { srcSegmentEfforts } from "./src-segment-efforts";
export type { SrcSegmentEffort, NewSrcSegmentEffort } from "./src-segment-efforts";

export { srcGears } from "./src-gears";
export type { SrcGear, NewSrcGear } from "./src-gears";

// ── Normalized tables (imperial / American English) ────
export { activities } from "./activities";
export type { Activity, NewActivity } from "./activities";

export { segmentEfforts } from "./segment-efforts";
export type { SegmentEffort, NewSegmentEffort } from "./segment-efforts";

export { gears } from "./gears";
export type { Gear, NewGear } from "./gears";

// ── User & auth ────────────────────────────────────────
export { users } from "./users";
export type { User, NewUser } from "./users";

// ── Current KOM rankings ────────────────────────────────
export { segmentCurrentRanks } from "./segment-current-ranks";
export type { SegmentCurrentRank, NewSegmentCurrentRank } from "./segment-current-ranks";

// ── Sync & operational ─────────────────────────────────
export {
  syncLogs,
  bulkSyncStates,
  bulkSyncSummaries,
  rateLimitLogs,
  normalizeState,
} from "./sync";
export type { SyncLog, BulkSyncState, RateLimitLog, NormalizeState } from "./sync";
