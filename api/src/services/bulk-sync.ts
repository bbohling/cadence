import { eq, and, notInArray, sql } from "drizzle-orm";
import { db } from "../db/connection";
import {
  users,
  srcActivities,
  srcSegmentEfforts,
  srcGears,
  bulkSyncStates,
  bulkSyncSummaries,
} from "../db/schema";
import {
  ensureValidToken,
  getActivities,
  getActivityDetail,
  getAthlete,
} from "./strava";
import { config } from "../utils/config";
import { log } from "../utils/logger";
import { generateId, now } from "../utils/ids";
import type { User, BulkSyncState } from "../db/schema";

/**
 * Bulk sync service.
 *
 * Handles the initial historical import of ALL activities from Strava.
 * Because Strava rate-limits to ~1,000 read requests/day, a full sync
 * can take multiple days. This service is designed to:
 *
 *   1. Pause and resume across runs
 *   2. Track progress per-activity
 *   3. Work in two phases:
 *      a) Summary fetch — get all activity IDs (fast, 200 per request)
 *      b) Detail fetch — get full data per activity (1 request each)
 */

// ── Public API ─────────────────────────────────────────

/**
 * Start or resume a bulk sync for a user.
 *
 * @param force — if true, resets a completed sync and starts over
 */
export async function startBulkSync(
  userId: string,
  force = false
): Promise<{ status: string; message: string }> {
  const user = await db.select().from(users).where(eq(users.name, userId)).get();
  if (!user) throw new Error(`User not found: ${userId}`);

  let state = await db
    .select()
    .from(bulkSyncStates)
    .where(eq(bulkSyncStates.userId, userId))
    .get();

  // Reset if forced or if we need to start fresh
  if (force && state) {
    await db.delete(bulkSyncStates).where(eq(bulkSyncStates.userId, userId)).run();
    await db.delete(bulkSyncSummaries).where(eq(bulkSyncSummaries.userId, userId)).run();
    state = undefined;
  }

  if (state?.status === "complete" && !force) {
    return { status: "complete", message: "Bulk sync already complete. Use force=true to re-run." };
  }

  if (state?.status === "running") {
    return { status: "running", message: "Bulk sync is already running." };
  }

  // Create or update state
  if (!state) {
    await db.insert(bulkSyncStates)
      .values({
        id: generateId(),
        userId,
        athleteId: user.athleteId,
        status: "running",
        phase: "summary_fetch",
        startDate: now(),
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  } else {
    await db.update(bulkSyncStates)
      .set({ status: "running", updatedAt: now() })
      .where(eq(bulkSyncStates.userId, userId))
      .run();
  }

  // Run the sync (this is async and can take a long time)
  runBulkSync(user).catch(async (error) => {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Bulk sync failed", { userId, error: msg });
    await db.update(bulkSyncStates)
      .set({ status: "error", errorMessage: msg, updatedAt: now() })
      .where(eq(bulkSyncStates.userId, userId))
      .run();
  });

  return { status: "running", message: "Bulk sync started." };
}

/**
 * Get current bulk sync status.
 */
export async function getBulkSyncStatus(userId: string): Promise<BulkSyncState | null> {
  return (
    await db
      .select()
      .from(bulkSyncStates)
      .where(eq(bulkSyncStates.userId, userId))
      .get() ?? null
  );
}

/**
 * Reset a bulk sync (delete state and summaries).
 */
export async function resetBulkSync(userId: string): Promise<void> {
  await db.delete(bulkSyncStates).where(eq(bulkSyncStates.userId, userId)).run();
  await db.delete(bulkSyncSummaries).where(eq(bulkSyncSummaries.userId, userId)).run();
  log.info("Bulk sync reset", { userId });
}

// ── Internal ───────────────────────────────────────────

async function runBulkSync(user: User): Promise<void> {
  const token = await ensureValidToken(user);
  const userId = user.name!;

  let state = (await db
    .select()
    .from(bulkSyncStates)
    .where(eq(bulkSyncStates.userId, userId))
    .get())!;

  // Phase 1: Fetch all activity summaries
  if (state.phase === "summary_fetch") {
    log.info("Bulk sync: starting summary fetch", { userId });
    await fetchAllSummaries(token, userId);

    await db.update(bulkSyncStates)
      .set({ phase: "detail_fetch", updatedAt: now() })
      .where(eq(bulkSyncStates.userId, userId))
      .run();
  }

  // Phase 2: Fetch details for each activity
  state = (await db
    .select()
    .from(bulkSyncStates)
    .where(eq(bulkSyncStates.userId, userId))
    .get())!;

  if (state.phase === "detail_fetch") {
    log.info("Bulk sync: starting detail fetch", { userId });
    await fetchAllDetails(token, user);
  }

  // Mark complete
  await db.update(bulkSyncStates)
    .set({
      status: "complete",
      phase: "complete",
      completedAt: now(),
      updatedAt: now(),
    })
    .where(eq(bulkSyncStates.userId, userId))
    .run();

  log.info("Bulk sync complete", { userId });
}

/**
 * Phase 1: Paginate through all activity summaries and store them.
 */
async function fetchAllSummaries(token: string, userId: string): Promise<void> {
  const state = (await db
    .select()
    .from(bulkSyncStates)
    .where(eq(bulkSyncStates.userId, userId))
    .get())!;

  let page = state.currentPage ?? 1;
  let total = 0;

  while (true) {
    const summaries = await getActivities(token, { page, perPage: 200 });

    if (summaries.length === 0) break;

    // Store each summary
    for (const summary of summaries) {
      await db.insert(bulkSyncSummaries)
        .values({
          id: generateId(),
          userId,
          activityId: summary.id,
          summaryData: JSON.stringify(summary),
          createdAt: now(),
        })
        .onConflictDoNothing()
        .run();
    }

    total += summaries.length;

    // Update progress
    await db.update(bulkSyncStates)
      .set({
        currentPage: page + 1,
        processedSummaries: total,
        updatedAt: now(),
      })
      .where(eq(bulkSyncStates.userId, userId))
      .run();

    log.info("Bulk sync: fetched summaries page", { page, count: summaries.length, total });

    if (summaries.length < 200) break;
    page++;
  }

  // Count total activities to process
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(bulkSyncSummaries)
    .where(eq(bulkSyncSummaries.userId, userId))
    .get();

  await db.update(bulkSyncStates)
    .set({ totalActivities: countResult?.count ?? total, updatedAt: now() })
    .where(eq(bulkSyncStates.userId, userId))
    .run();
}

/**
 * Phase 2: Fetch detailed data for each activity.
 *
 * Processes in batches with delays to respect rate limits.
 * Tracks which activities have been processed so we can resume.
 */
async function fetchAllDetails(token: string, user: User): Promise<void> {
  const userId = user.name!;
  const athleteId = user.athleteId!;

  const state = (await db
    .select()
    .from(bulkSyncStates)
    .where(eq(bulkSyncStates.userId, userId))
    .get())!;

  const processedIds: Set<number> = new Set(
    JSON.parse(state.processedActivityIds ?? "[]")
  );

  // Get all summaries that haven't been processed yet
  const summaries = await db
    .select()
    .from(bulkSyncSummaries)
    .where(eq(bulkSyncSummaries.userId, userId))
    .all();

  const remaining = summaries.filter((s) => !processedIds.has(s.activityId));
  log.info("Bulk sync: detail fetch", {
    total: summaries.length,
    remaining: remaining.length,
    alreadyProcessed: processedIds.size,
  });

  // Process in batches
  const { batchSize, delayBetweenBatches } = config.bulkSync;

  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);

    // Fetch details for this batch in parallel
    const details = await Promise.all(
      batch.map((s) => getActivityDetail(token, s.activityId).catch((err) => {
        log.warn("Failed to fetch activity detail", {
          activityId: s.activityId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }))
    );

    // Store each successfully fetched activity
    for (const detail of details) {
      if (!detail) continue;

      upsertSrcActivity(detail, athleteId);

      if (detail.segment_efforts) {
        upsertSrcSegmentEfforts(detail.segment_efforts, detail.id, athleteId);
      }

      if (detail.gear) {
        upsertSrcGear(detail.gear, athleteId);
      }

      processedIds.add(detail.id);
    }

    // Update progress
    await db.update(bulkSyncStates)
      .set({
        processedActivities: processedIds.size,
        processedActivityIds: JSON.stringify([...processedIds]),
        updatedAt: now(),
      })
      .where(eq(bulkSyncStates.userId, userId))
      .run();

    log.info("Bulk sync: batch complete", {
      processed: processedIds.size,
      total: summaries.length,
    });

    // Delay between batches to respect rate limits
    if (i + batchSize < remaining.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  // Sync gear from athlete profile too
  const athlete = await getAthlete(token);
  for (const gear of [...(athlete.bikes ?? []), ...(athlete.shoes ?? [])]) {
    upsertSrcGear(gear, athleteId);
  }
}

// ── Upsert helpers (duplicated from sync.ts for isolation) ──

async function upsertSrcActivity(detail: any, athleteId: number): Promise<void> {
  const timestamp = now();
  const values = {
    id: detail.id,
    athleteId,
    rawJson: JSON.stringify(detail),
    name: detail.name,
    type: detail.type,
    sportType: detail.sport_type,
    distance: detail.distance,
    movingTime: detail.moving_time,
    elapsedTime: detail.elapsed_time,
    totalElevationGain: detail.total_elevation_gain,
    elevHigh: detail.elev_high ?? null,
    elevLow: detail.elev_low ?? null,
    startDate: detail.start_date,
    startDateLocal: detail.start_date_local,
    timezone: detail.timezone,
    averageSpeed: detail.average_speed,
    maxSpeed: detail.max_speed,
    averageCadence: detail.average_cadence ?? null,
    averageWatts: detail.average_watts ?? null,
    maxWatts: detail.max_watts ?? null,
    weightedAverageWatts: detail.weighted_average_watts ?? null,
    kilojoules: detail.kilojoules ?? null,
    deviceWatts: detail.device_watts ? 1 : 0,
    averageHeartrate: detail.average_heartrate ?? null,
    maxHeartrate: detail.max_heartrate ?? null,
    hasHeartrate: detail.has_heartrate ? 1 : 0,
    sufferScore: detail.suffer_score ?? null,
    achievementCount: detail.achievement_count,
    prCount: detail.pr_count,
    calories: detail.calories ?? null,
    averageTemp: detail.average_temp ?? null,
    trainer: detail.trainer ? 1 : 0,
    commute: detail.commute ? 1 : 0,
    gearId: detail.gear_id,
    segmentEffortsJson: detail.segment_efforts
      ? JSON.stringify(detail.segment_efforts)
      : null,
    mapSummaryPolyline: detail.map?.summary_polyline ?? null,
    fetchedAt: timestamp,
  };

  const existing = await db
    .select({ id: srcActivities.id })
    .from(srcActivities)
    .where(eq(srcActivities.id, detail.id))
    .get();

  if (existing) {
    await db.update(srcActivities)
      .set({ ...values, updatedAt: timestamp })
      .where(eq(srcActivities.id, detail.id))
      .run();
  } else {
    await db.insert(srcActivities)
      .values({ ...values, createdAt: timestamp, updatedAt: timestamp })
      .run();
  }
}

async function upsertSrcSegmentEfforts(
  efforts: any[],
  activityId: number,
  athleteId: number
): Promise<void> {
  const timestamp = now();
  for (const effort of efforts) {
    const existing = await db
      .select({ id: srcSegmentEfforts.id })
      .from(srcSegmentEfforts)
      .where(eq(srcSegmentEfforts.id, effort.id))
      .get();

    const values = {
      id: effort.id,
      activityId,
      segmentId: effort.segment.id,
      athleteId,
      rawJson: JSON.stringify(effort),
      name: effort.name,
      elapsedTime: effort.elapsed_time,
      movingTime: effort.moving_time,
      startDate: effort.start_date,
      startDateLocal: effort.start_date_local,
      distance: effort.distance,
      averageCadence: effort.average_cadence ?? null,
      averageWatts: effort.average_watts ?? null,
      averageHeartrate: effort.average_heartrate ?? null,
      maxHeartrate: effort.max_heartrate ?? null,
      deviceWatts: effort.device_watts ? 1 : 0,
      prRank: effort.pr_rank,
      komRank: effort.kom_rank,
      segmentJson: JSON.stringify(effort.segment),
      achievementsJson: JSON.stringify(effort.achievements ?? []),
    };

    if (existing) {
      await db.update(srcSegmentEfforts)
        .set({ ...values, updatedAt: timestamp })
        .where(eq(srcSegmentEfforts.id, effort.id))
        .run();
    } else {
      await db.insert(srcSegmentEfforts)
        .values({ ...values, createdAt: timestamp, updatedAt: timestamp })
        .run();
    }
  }
}

async function upsertSrcGear(gear: any, athleteId: number): Promise<void> {
  const timestamp = now();
  const existing = await db
    .select({ id: srcGears.id })
    .from(srcGears)
    .where(eq(srcGears.id, gear.id))
    .get();

  const values = {
    id: gear.id,
    athleteId,
    rawJson: JSON.stringify(gear),
    name: gear.name,
    primaryGear: gear.primary ? 1 : 0,
    distance: gear.distance,
    brandName: gear.brand_name ?? null,
    modelName: gear.model_name ?? null,
    frameType: gear.frame_type ?? null,
    description: gear.description ?? null,
    resourceState: gear.resource_state ?? null,
  };

  if (existing) {
    await db.update(srcGears)
      .set({ ...values, updatedAt: timestamp })
      .where(eq(srcGears.id, gear.id))
      .run();
  } else {
    await db.insert(srcGears)
      .values({ ...values, createdAt: timestamp, updatedAt: timestamp })
      .run();
  }
}
