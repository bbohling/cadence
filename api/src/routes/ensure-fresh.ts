import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { syncUser } from "../services/sync";
import { runNormalization } from "../services/normalize";
import { config } from "../utils/config";
import { log } from "../utils/logger";

/**
 * Ensure-fresh endpoint.
 *
 * The UI calls this endpoint once on load to check if data is fresh.
 * If stale, a background sync is triggered automatically.
 *
 * Returns:
 *   { fresh: true }               — data is up to date
 *   { fresh: false, syncing: true } — sync in progress
 *   { fresh: false, syncFailed: true } — last sync attempt failed
 */
const ensureFresh = new Hono();

/** Track active sync promises to avoid duplicate syncs */
const activeSyncs = new Map<string, Promise<void>>();

/**
 * Track the timestamp of the last sync ATTEMPT (success or failure).
 * This prevents rapid retries when syncs fail — we enforce a cooldown
 * regardless of whether the sync succeeded.
 */
const lastSyncAttempt = new Map<string, number>();

/** Track whether the most recent sync attempt failed */
const lastSyncFailed = new Map<string, string>();

/** Cooldown after a failed sync before we try again (5 minutes) */
const SYNC_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Parse a timestamp that may be stored as an ISO 8601 string or a
 * Unix-millisecond number/string (from legacy migration data).
 * Returns 0 for null/unparseable values.
 */
function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  // If the value is all digits, treat it as a Unix timestamp in ms
  if (/^\d+$/.test(value)) return Number(value);
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

ensureFresh.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const user = await db.select().from(users).where(eq(users.name, userId)).get();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Check if data is fresh
  const staleness = config.ingestStalenessMinutes * 60 * 1000;
  const lastSync = parseTimestamp(user.lastSyncAt);
  const isFresh = Date.now() - lastSync < staleness;

  if (isFresh) {
    return c.json({ fresh: true, lastSyncAt: user.lastSyncAt });
  }

  // Check if a sync is already running
  if (activeSyncs.has(userId)) {
    return c.json({ fresh: false, syncing: true, lastSyncAt: user.lastSyncAt });
  }

  // If the last sync attempt failed, enforce a cooldown before retrying
  const lastAttemptTime = lastSyncAttempt.get(userId) ?? 0;
  const failureReason = lastSyncFailed.get(userId);
  if (failureReason && Date.now() - lastAttemptTime < SYNC_FAILURE_COOLDOWN_MS) {
    return c.json({
      fresh: false,
      syncing: false,
      syncFailed: true,
      error: failureReason,
      lastSyncAt: user.lastSyncAt,
    });
  }

  // Check minimum interval between sync attempts
  const minInterval = config.ingestMinIntervalMinutes * 60 * 1000;
  if (Date.now() - lastAttemptTime < minInterval) {
    return c.json({ fresh: true, lastSyncAt: user.lastSyncAt });
  }

  // Start a background sync
  log.info("Data stale, starting background sync", { userId });
  lastSyncAttempt.set(userId, Date.now());
  lastSyncFailed.delete(userId);

  const syncPromise = syncUser(userId)
    .then(async () => {
      await runNormalization();
      lastSyncFailed.delete(userId);
      log.info("Background sync + normalization complete", { userId });
    })
    .catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastSyncFailed.set(userId, errorMsg);
      log.error("Background sync failed", { userId, error: errorMsg });
    })
    .finally(() => {
      activeSyncs.delete(userId);
    });

  activeSyncs.set(userId, syncPromise);
  // On Workers, background work must be registered with waitUntil or it
  // may be cancelled once the response is returned.
  c.executionCtx.waitUntil(syncPromise);

  return c.json({ fresh: false, syncing: true, lastSyncAt: user.lastSyncAt });
});

export { ensureFresh };
