import { lt } from "drizzle-orm";
import { db } from "../db/connection";
import { rateLimitLogs, syncLogs } from "../db/schema";
import { log } from "../utils/logger";

/**
 * Retention for the operational log tables.
 *
 * Neither table was ever pruned, so both grew without bound — every
 * Strava API call appends a rate_limit_logs row, every cron run appends a
 * sync_logs row. They are debugging aids, not history worth keeping
 * forever, and unbounded growth eventually shows up as D1 storage and as
 * reads on any query that touches them.
 */
const RATE_LIMIT_RETENTION_DAYS = 7;
const SYNC_LOG_RETENTION_DAYS = 90;

function cutoff(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Delete aged-out operational log rows.
 *
 * Both DELETEs filter on an indexed ISO-8601 `timestamp` column
 * (idx_rate_limits_timestamp, idx_sync_logs_timestamp), so this is a
 * range scan over exactly the rows being removed.
 */
export async function pruneOperationalLogs(): Promise<void> {
  const rateLimitCutoff = cutoff(RATE_LIMIT_RETENTION_DAYS);
  const syncLogCutoff = cutoff(SYNC_LOG_RETENTION_DAYS);

  await db.delete(rateLimitLogs).where(lt(rateLimitLogs.timestamp, rateLimitCutoff)).run();
  await db.delete(syncLogs).where(lt(syncLogs.timestamp, syncLogCutoff)).run();

  log.info("Pruned operational logs", { rateLimitCutoff, syncLogCutoff });
}
