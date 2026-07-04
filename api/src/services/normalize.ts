import { eq, sql, isNull, or, lt } from "drizzle-orm";
import { db } from "../db/connection";
import {
  srcActivities,
  srcSegmentEfforts,
  srcGears,
  activities,
  segmentEfforts,
  gears,
} from "../db/schema";
import {
  metersToMiles,
  metersToFeet,
  mpsToMph,
  celsiusToFahrenheit,
} from "../utils/conversions";
import { log } from "../utils/logger";
import { now } from "../utils/ids";

/**
 * Normalization service.
 *
 * Reads raw data from `src_*` tables and writes converted data into
 * the normalized tables. All metric → American English unit conversions
 * happen here.
 *
 * DESIGN DECISIONS:
 * ─────────────────
 * 1. Idempotent — safe to run multiple times on the same data.
 * 2. Incremental — only processes rows where src_.updatedAt > normalized.normalizedAt
 *    (or where the normalized row doesn't exist yet).
 * 3. Batch processing — works in configurable batch sizes to avoid
 *    holding the database lock for too long.
 * 4. KOM/PR computation — when normalizing activities, we also compute
 *    komCount, bestKomRank, and bestPrRank from the segment_efforts table.
 */

/** How many rows to process per batch */
const BATCH_SIZE = 500;

// ── Public API ─────────────────────────────────────────

export interface NormalizeResult {
  activitiesNormalized: number;
  segmentEffortsNormalized: number;
  gearsNormalized: number;
  durationMs: number;
}

/**
 * Run a full normalization pass.
 *
 * Processes all three entity types (activities, segment efforts, gears).
 * Only touches rows that are new or have been updated since the last
 * normalization.
 *
 * @param force — if true, re-normalizes ALL rows regardless of timestamps
 */
export function runNormalization(force = false): NormalizeResult {
  const start = Date.now();

  log.info("Starting normalization", { force });

  const activitiesNormalized = normalizeActivities(force);
  const segmentEffortsNormalized = normalizeSegmentEfforts(force);
  const gearsNormalized = normalizeGears(force);

  // After normalizing segment efforts, recompute KOM/PR counts on activities
  recomputeKomStats();

  const durationMs = Date.now() - start;

  log.info("Normalization complete", {
    activitiesNormalized,
    segmentEffortsNormalized,
    gearsNormalized,
    durationMs,
  });

  return { activitiesNormalized, segmentEffortsNormalized, gearsNormalized, durationMs };
}

// ── Activity Normalization ─────────────────────────────

function normalizeActivities(force: boolean): number {
  let processed = 0;
  let offset = 0;

  while (true) {
    // Find src_activities that need normalization
    let rows;

    if (force) {
      rows = db
        .select()
        .from(srcActivities)
        .limit(BATCH_SIZE)
        .offset(offset)
        .all();
    } else {
      // Only rows that are new or updated since last normalization
      rows = db
        .select({
          src: srcActivities,
          normalizedAt: activities.normalizedAt,
        })
        .from(srcActivities)
        .leftJoin(activities, eq(srcActivities.id, activities.id))
        .where(
          or(
            isNull(activities.normalizedAt),
            lt(activities.updatedAt, srcActivities.updatedAt)
          )
        )
        .limit(BATCH_SIZE)
        .all()
        .map((r) => r.src);
    }

    if (rows.length === 0) break;

    const timestamp = now();

    for (const src of rows) {
      const normalized = {
        id: src.id,
        athleteId: src.athleteId,
        name: src.name,
        type: src.type,
        sportType: src.sportType,

        // ── Unit conversions ─────────────────────────
        distance: metersToMiles(src.distance),
        movingTime: src.movingTime,
        elapsedTime: src.elapsedTime,
        totalElevationGain: metersToFeet(src.totalElevationGain),
        elevHigh: metersToFeet(src.elevHigh),
        elevLow: metersToFeet(src.elevLow),
        averageSpeed: mpsToMph(src.averageSpeed),
        maxSpeed: mpsToMph(src.maxSpeed),
        averageTemp: celsiusToFahrenheit(src.averageTemp),

        // ── Pass-through (already universal units) ───
        averageCadence: src.averageCadence,
        averageWatts: src.averageWatts,
        maxWatts: src.maxWatts,
        weightedAverageWatts: src.weightedAverageWatts,
        kilojoules: src.kilojoules,
        deviceWatts: src.deviceWatts,
        averageHeartrate: src.averageHeartrate,
        maxHeartrate: src.maxHeartrate,
        hasHeartrate: src.hasHeartrate,
        sufferScore: src.sufferScore,
        achievementCount: src.achievementCount,
        prCount: src.prCount,
        calories: src.calories,
        trainer: src.trainer,
        commute: src.commute,
        gearId: src.gearId,
        mapSummaryPolyline: src.mapSummaryPolyline,

        // ── Timestamps ───────────────────────────────
        startDate: src.startDate,
        startDateLocal: src.startDateLocal,
        timezone: src.timezone,

        // KOM stats will be computed in a separate pass
        komCount: 0,
        bestKomRank: null as number | null,
        bestPrRank: null as number | null,

        normalizedAt: timestamp,
        updatedAt: timestamp,
      };

      // Upsert into the normalized activities table
      const existing = db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.id, src.id))
        .get();

      if (existing) {
        db.update(activities)
          .set(normalized)
          .where(eq(activities.id, src.id))
          .run();
      } else {
        db.insert(activities)
          .values({ ...normalized, createdAt: timestamp })
          .run();
      }

      processed++;
    }

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  return processed;
}

// ── Segment Effort Normalization ───────────────────────

function normalizeSegmentEfforts(force: boolean): number {
  let processed = 0;
  let offset = 0;

  while (true) {
    let rows;

    if (force) {
      rows = db
        .select()
        .from(srcSegmentEfforts)
        .limit(BATCH_SIZE)
        .offset(offset)
        .all();
    } else {
      rows = db
        .select({
          src: srcSegmentEfforts,
          normalizedAt: segmentEfforts.normalizedAt,
        })
        .from(srcSegmentEfforts)
        .leftJoin(segmentEfforts, eq(srcSegmentEfforts.id, segmentEfforts.id))
        .where(
          or(
            isNull(segmentEfforts.normalizedAt),
            lt(segmentEfforts.updatedAt, srcSegmentEfforts.updatedAt)
          )
        )
        .limit(BATCH_SIZE)
        .all()
        .map((r) => r.src);
    }

    if (rows.length === 0) break;

    const timestamp = now();

    for (const src of rows) {
      // Parse segment JSON for denormalized fields
      let segment: Record<string, any> = {};
      try {
        segment = src.segmentJson ? JSON.parse(src.segmentJson) : {};
      } catch {
        // If JSON is malformed, skip segment metadata
      }

      const normalized = {
        id: src.id,
        activityId: src.activityId,
        segmentId: src.segmentId,
        athleteId: src.athleteId,
        name: src.name,
        elapsedTime: src.elapsedTime,
        movingTime: src.movingTime,
        startDate: src.startDate,
        startDateLocal: src.startDateLocal,

        // ── Unit conversions ─────────────────────────
        distance: metersToMiles(src.distance),

        // ── Pass-through ─────────────────────────────
        averageCadence: src.averageCadence,
        averageWatts: src.averageWatts,
        averageHeartrate: src.averageHeartrate,
        maxHeartrate: src.maxHeartrate,
        deviceWatts: src.deviceWatts,
        prRank: src.prRank,
        komRank: src.komRank,
        achievementsJson: src.achievementsJson,

        // ── Denormalized segment metadata ────────────
        segmentName: segment.name ?? null,
        segmentDistance: metersToMiles(segment.distance),
        segmentAverageGrade: segment.average_grade ?? null,
        segmentMaximumGrade: segment.maximum_grade ?? null,
        segmentElevationHigh: metersToFeet(segment.elevation_high),
        segmentElevationLow: metersToFeet(segment.elevation_low),
        segmentClimbCategory: segment.climb_category ?? null,
        segmentCity: segment.city ?? null,
        segmentState: segment.state ?? null,

        normalizedAt: timestamp,
        updatedAt: timestamp,
      };

      const existing = db
        .select({ id: segmentEfforts.id })
        .from(segmentEfforts)
        .where(eq(segmentEfforts.id, src.id))
        .get();

      if (existing) {
        db.update(segmentEfforts)
          .set(normalized)
          .where(eq(segmentEfforts.id, src.id))
          .run();
      } else {
        db.insert(segmentEfforts)
          .values({ ...normalized, createdAt: timestamp })
          .run();
      }

      processed++;
    }

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  return processed;
}

// ── Gear Normalization ─────────────────────────────────

function normalizeGears(force: boolean): number {
  let processed = 0;

  // Gears are few enough to always process all at once
  const rows = db.select().from(srcGears).all();

  const timestamp = now();

  for (const src of rows) {
    if (!force) {
      const existing = db
        .select({ normalizedAt: gears.normalizedAt })
        .from(gears)
        .where(eq(gears.id, src.id))
        .get();

      if (existing && existing.normalizedAt && existing.normalizedAt >= src.updatedAt) {
        continue; // Already up to date
      }
    }

    const normalized = {
      id: src.id,
      athleteId: src.athleteId,
      name: src.name,
      primaryGear: src.primaryGear,
      distance: metersToMiles(src.distance),
      brandName: src.brandName,
      modelName: src.modelName,
      frameType: src.frameType,
      description: src.description,
      resourceState: src.resourceState,
      normalizedAt: timestamp,
      updatedAt: timestamp,
    };

    const existing = db
      .select({ id: gears.id })
      .from(gears)
      .where(eq(gears.id, src.id))
      .get();

    if (existing) {
      db.update(gears)
        .set(normalized)
        .where(eq(gears.id, src.id))
        .run();
    } else {
      db.insert(gears)
        .values({ ...normalized, createdAt: timestamp })
        .run();
    }

    processed++;
  }

  return processed;
}

// ── KOM/PR Stats Computation ───────────────────────────

/**
 * Recomputes komCount, bestKomRank, and bestPrRank on every
 * normalized activity based on its segment efforts.
 *
 * This runs as a single SQL update for efficiency rather than
 * looping through activities one by one.
 */
function recomputeKomStats(): void {
  // Use raw SQL for this aggregation — it's much faster than
  // looping through activities in JavaScript.
  db.run(sql`
    UPDATE activities SET
      kom_count = COALESCE((
        SELECT COUNT(*) FROM segment_efforts
        WHERE segment_efforts.activity_id = activities.id
          AND segment_efforts.kom_rank IS NOT NULL
      ), 0),
      best_kom_rank = (
        SELECT MIN(kom_rank) FROM segment_efforts
        WHERE segment_efforts.activity_id = activities.id
          AND segment_efforts.kom_rank IS NOT NULL
      ),
      best_pr_rank = (
        SELECT MIN(pr_rank) FROM segment_efforts
        WHERE segment_efforts.activity_id = activities.id
          AND segment_efforts.pr_rank IS NOT NULL
      )
  `);

  log.debug("Recomputed KOM/PR stats on activities");
}
