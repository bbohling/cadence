import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/connection";
import {
  users,
  srcActivities,
  srcSegmentEfforts,
  srcGears,
  syncLogs,
} from "../db/schema";
import type { User } from "../db/schema";
import {
  ensureValidToken,
  getActivities,
  getActivityDetail,
  getAthlete,
  type StravaDetailedActivity,
  type StravaSegmentEffort,
  type StravaGear,
} from "./strava";
import { log } from "../utils/logger";
import { generateId, now } from "../utils/ids";

/**
 * Activity sync service.
 *
 * Responsible for pulling data from Strava and writing it into the
 * `src_*` tables. This is the "extract" step — raw data in, no
 * transformations. The normalization job handles conversion later.
 *
 * Two sync modes:
 *   1. Incremental — fetches activities newer than the last sync
 *   2. Full — fetches all activities (used with bulk sync)
 */

// ── Types ──────────────────────────────────────────────

interface SyncResult {
  activitiesAdded: number;
  activitiesUpdated: number;
  segmentEffortsAdded: number;
  gearsAdded: number;
  durationMs: number;
}

// ── Public API ─────────────────────────────────────────

/**
 * Run an incremental sync for a user.
 *
 * Fetches any activities that are newer than the user's `lastSyncAt`
 * timestamp. For each new activity summary, fetches full details
 * (including segment efforts) and stores everything in src_ tables.
 */
export async function syncUser(userId: string): Promise<SyncResult> {
  const start = Date.now();

  // Look up the user
  const user = await db.select().from(users).where(eq(users.name, userId)).get();
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const token = await ensureValidToken(user);
  let activitiesAdded = 0;
  let activitiesUpdated = 0;
  let segmentEffortsAdded = 0;
  let gearsAdded = 0;

  try {
    // Determine the "after" timestamp for incremental sync.
    // lastSyncAt may be ISO 8601 or a legacy Unix-ms string.
    const lastSyncMs = user.lastSyncAt
      ? /^\d+$/.test(user.lastSyncAt)
        ? Number(user.lastSyncAt)
        : new Date(user.lastSyncAt).getTime()
      : 0;
    const after = lastSyncMs > 0 && !Number.isNaN(lastSyncMs)
      ? Math.floor(lastSyncMs / 1000)
      : undefined;

    log.info("Starting incremental sync", { userId, after });

    // Fetch activity summaries (paginate through all)
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const summaries = await getActivities(token, { after, page });

      if (summaries.length === 0) {
        hasMore = false;
        break;
      }

      // Fetch full details for each activity
      for (const summary of summaries) {
        const detail = await getActivityDetail(token, summary.id);
        const result = await upsertActivity(detail, user.athleteId!);
        if (result === "added") activitiesAdded++;
        if (result === "updated") activitiesUpdated++;

        // Store segment efforts
        if (detail.segment_efforts) {
          const count = await upsertSegmentEfforts(
            detail.segment_efforts,
            detail.id,
            user.athleteId!
          );
          segmentEffortsAdded += count;
        }

        // Store gear if present
        if (detail.gear) {
          const added = await upsertGear(detail.gear, user.athleteId!);
          if (added) gearsAdded++;
        }
      }

      page++;
      // Strava returns max 200 per page; fewer means we've reached the end
      if (summaries.length < 200) hasMore = false;
    }

    // Also sync athlete profile for gear data
    await syncGears(token, user.athleteId!);

    // Update lastSyncAt
    await db.update(users)
      .set({ lastSyncAt: now(), updatedAt: now() })
      .where(eq(users.id, user.id))
      .run();

    const durationMs = Date.now() - start;

    // Log the sync
    await db.insert(syncLogs)
      .values({
        id: generateId(),
        userId,
        timestamp: now(),
        success: 1,
        activitiesAdded,
        activitiesUpdated,
        komsAdded: segmentEffortsAdded,
        durationMs,
        createdAt: now(),
      })
      .run();

    log.info("Sync complete", {
      userId,
      activitiesAdded,
      activitiesUpdated,
      segmentEffortsAdded,
      gearsAdded,
      durationMs,
    });

    return { activitiesAdded, activitiesUpdated, segmentEffortsAdded, gearsAdded, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);

    await db.insert(syncLogs)
      .values({
        id: generateId(),
        userId,
        timestamp: now(),
        success: 0,
        error: errorMsg,
        durationMs,
        createdAt: now(),
      })
      .run();

    log.error("Sync failed", { userId, error: errorMsg, durationMs });
    throw error;
  }
}

// ── Upsert Functions ───────────────────────────────────

/**
 * Stores a detailed activity in src_activities.
 *
 * Uses INSERT OR REPLACE (upsert) so we can safely re-sync
 * activities that already exist. The `rawJson` column preserves
 * the complete API response for future re-extraction.
 */
async function upsertActivity(
  detail: StravaDetailedActivity,
  athleteId: number
): Promise<"added" | "updated"> {
  const existing = await db
    .select({ id: srcActivities.id })
    .from(srcActivities)
    .where(eq(srcActivities.id, detail.id))
    .get();

  const timestamp = now();
  const rawJson = JSON.stringify(detail);

  const values = {
    id: detail.id,
    athleteId,
    rawJson,
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

  if (existing) {
    await db.update(srcActivities)
      .set({ ...values, updatedAt: timestamp })
      .where(eq(srcActivities.id, detail.id))
      .run();
    return "updated";
  }

  await db.insert(srcActivities)
    .values({ ...values, createdAt: timestamp, updatedAt: timestamp })
    .run();
  return "added";
}

/**
 * Stores segment efforts from an activity in src_segment_efforts.
 *
 * Each activity can have dozens of segment efforts. We store each
 * one individually for efficient KOM/PR querying.
 */
async function upsertSegmentEfforts(
  efforts: StravaSegmentEffort[],
  activityId: number,
  athleteId: number
): Promise<number> {
  let count = 0;
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
      count++;
    }
  }

  return count;
}

/**
 * Stores a gear item in src_gears.
 */
async function upsertGear(gear: StravaGear, athleteId: number): Promise<boolean> {
  const existing = await db
    .select({ id: srcGears.id })
    .from(srcGears)
    .where(eq(srcGears.id, gear.id))
    .get();

  const timestamp = now();
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
    return false;
  }

  await db.insert(srcGears)
    .values({ ...values, createdAt: timestamp, updatedAt: timestamp })
    .run();
  return true;
}

/**
 * Syncs gear data from the athlete profile.
 *
 * The /athlete endpoint returns all bikes and shoes. We store each
 * one as a separate src_gears row.
 */
async function syncGears(token: string, athleteId: number): Promise<void> {
  const athlete = await getAthlete(token);
  const allGear = [...(athlete.bikes ?? []), ...(athlete.shoes ?? [])];

  for (const gear of allGear) {
    upsertGear(gear, athleteId);
  }

  log.info("Synced gear", { count: allGear.length });
}
