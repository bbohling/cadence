import { asc, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "../db/connection";
import {
  srcActivities,
  srcSegmentEfforts,
  srcGears,
  activities,
  segmentEfforts,
  gears,
  normalizeState,
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
 * 2. Incremental — each source table has a watermark row in
 *    `normalize_state` holding the highest `src_*.updated_at` already
 *    normalized. A run processes only rows past that watermark, which is
 *    an indexed range scan (idx_src_activities_updated_at,
 *    idx_src_efforts_updated_at). On an idle hour it reads nothing.
 * 3. Batch processing — rows are upserted through `db.batch()` in
 *    chunks, so a run costs a handful of statements instead of two per row.
 * 4. KOM/PR computation — recomputed only for activities this run
 *    actually touched (see `recomputeKomStats`).
 *
 * COST NOTE (why it looks like this):
 * ───────────────────────────────────
 * The previous version found dirty rows with a cross-table left join
 * (`activities.updated_at < src_activities.updated_at`) — unindexable, so
 * every hourly cron scanned both source tables in full — and then ran an
 * unqualified `UPDATE activities SET kom_count = (correlated subquery)`
 * that rewrote all ~1,900 rows plus idx_activities_kom_count. Together
 * that burned ~147,000 D1 rows read and ~3,800 rows written every hour,
 * 24×/day, whether or not Strava had anything new — about 71% of the
 * account's entire D1 write budget. Keep the watermark and the id-scoped
 * recompute; without them this job alone exceeds the free tier.
 */

/** How many rows to fetch from a source table per batch */
const BATCH_SIZE = 500;

/** How many upsert statements to send in a single db.batch() call */
const WRITE_CHUNK = 50;

/** How many activity ids to put in one `WHERE id IN (...)` recompute */
const KOM_RECOMPUTE_CHUNK = 100;

type WatermarkKey = "activities" | "segment_efforts" | "gears";

// ── Public API ─────────────────────────────────────────

export interface NormalizeResult {
  activitiesNormalized: number;
  segmentEffortsNormalized: number;
  gearsNormalized: number;
  komStatsRecomputed: number;
  durationMs: number;
}

/**
 * Run a normalization pass.
 *
 * Processes all three entity types (activities, segment efforts, gears),
 * then recomputes KOM/PR stats for the activities this run touched.
 *
 * @param force — if true, re-normalizes ALL rows regardless of watermarks
 *                (and leaves the watermarks pointing at the new maximum)
 */
export async function runNormalization(force = false): Promise<NormalizeResult> {
  const start = Date.now();

  log.info("Starting normalization", { force });

  const actResult = await normalizeActivities(force);
  const effResult = await normalizeSegmentEfforts(force);
  const gearsNormalized = await normalizeGears(force);

  // Only the activities this run touched can have stale KOM/PR stats:
  // an activity whose own row changed, or one whose segment efforts did.
  const changed = new Set<number>([
    ...actResult.changedActivityIds,
    ...effResult.changedActivityIds,
  ]);
  await recomputeKomStats([...changed]);

  const durationMs = Date.now() - start;

  log.info("Normalization complete", {
    activitiesNormalized: actResult.processed,
    segmentEffortsNormalized: effResult.processed,
    gearsNormalized,
    komStatsRecomputed: changed.size,
    durationMs,
  });

  return {
    activitiesNormalized: actResult.processed,
    segmentEffortsNormalized: effResult.processed,
    gearsNormalized,
    komStatsRecomputed: changed.size,
    durationMs,
  };
}

// ── Watermarks ─────────────────────────────────────────

/**
 * Highest `src.updated_at` already normalized for this entity.
 *
 * Returns "" when the row is missing, which makes the first run process
 * everything — the same behaviour as a fresh database.
 */
async function getWatermark(key: WatermarkKey): Promise<string> {
  const row = await db
    .select({ watermark: normalizeState.watermark })
    .from(normalizeState)
    .where(eq(normalizeState.key, key))
    .get();
  return row?.watermark ?? "";
}

/**
 * Advance the watermark. Called only after the batch it covers has
 * committed, so a mid-run failure re-processes rather than skips.
 *
 * `now()` is `new Date().toISOString()` — fixed-width UTC — so string
 * comparison on these values is chronological.
 *
 * This requires every timestamp in the column to share one format. Rows
 * imported from the pre-D1 SQLite database held bare Unix-millisecond
 * strings ("1768766433749"), which happened to sort below ISO values only
 * because Unix-ms starts with '1' and ISO with '2' — an accident that
 * expires in 2033. Migration 0003 converted them; keep it that way, and
 * write timestamps through `now()` rather than raw epoch numbers.
 */
async function setWatermark(key: WatermarkKey, watermark: string): Promise<void> {
  if (!watermark) return;
  const timestamp = now();
  await db
    .insert(normalizeState)
    .values({ key, watermark, updatedAt: timestamp })
    .onConflictDoUpdate({
      target: normalizeState.key,
      set: { watermark, updatedAt: timestamp },
    })
    .run();
}

/**
 * Trim a full batch back to whole `updated_at` groups.
 *
 * The watermark scan is `updated_at > watermark`, so once the watermark is
 * advanced to a value T, every row with `updated_at = T` is excluded from
 * future runs. If a full batch ended mid-way through a group of rows that
 * share T, the leftovers would be skipped forever — silently. Dropping the
 * trailing partial group leaves them for the next iteration.
 *
 * Only relevant when a single millisecond produced more rows than fit in a
 * batch; if the whole batch is one group there is nothing to trim, and we
 * process it and move on rather than stall.
 */
function trimPartialTailGroup<T extends { updatedAt: string }>(
  rows: T[],
  batchSize: number
): T[] {
  if (rows.length < batchSize) return rows;
  const last = rows[rows.length - 1]!.updatedAt;
  if (rows[0]!.updatedAt === last) {
    log.warn("Batch is a single updated_at group — processing whole batch", {
      updatedAt: last,
      rows: rows.length,
    });
    return rows;
  }
  return rows.filter((r) => r.updatedAt !== last);
}

/** Send prepared statements to D1 in bounded batches. */
async function runBatched(statements: BatchItem<"sqlite">[]): Promise<void> {
  for (let i = 0; i < statements.length; i += WRITE_CHUNK) {
    const chunk = statements.slice(i, i + WRITE_CHUNK);
    if (chunk.length === 0) continue;
    await db.batch(chunk as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }
}

// ── Activity Normalization ─────────────────────────────

interface EntityResult {
  processed: number;
  changedActivityIds: number[];
}

async function normalizeActivities(force: boolean): Promise<EntityResult> {
  let processed = 0;
  let offset = 0;
  const changedActivityIds: number[] = [];
  let watermark = force ? "" : await getWatermark("activities");

  while (true) {
    const rows = force
      ? await db
          .select()
          .from(srcActivities)
          .limit(BATCH_SIZE)
          .offset(offset)
          .all()
      : await db
          .select()
          .from(srcActivities)
          .where(gt(srcActivities.updatedAt, watermark))
          .orderBy(asc(srcActivities.updatedAt))
          .limit(BATCH_SIZE)
          .all();

    if (rows.length === 0) break;
    const batch = force ? rows : trimPartialTailGroup(rows, BATCH_SIZE);

    const timestamp = now();
    const statements = batch.map((src) => {
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

        normalizedAt: timestamp,
        updatedAt: timestamp,
      };

      // KOM stats are deliberately NOT set here — recomputeKomStats owns
      // those columns and runs once, after efforts are normalized. Listing
      // them in the conflict update would zero them out on every pass.
      changedActivityIds.push(src.id);
      processed++;
      if (src.updatedAt > watermark) watermark = src.updatedAt;

      return db
        .insert(activities)
        .values({
          ...normalized,
          komCount: 0,
          bestKomRank: null,
          bestPrRank: null,
          createdAt: timestamp,
        })
        .onConflictDoUpdate({ target: activities.id, set: normalized });
    });

    await runBatched(statements);
    if (!force) await setWatermark("activities", watermark);

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  if (force) await setWatermark("activities", watermark);
  return { processed, changedActivityIds };
}

// ── Segment Effort Normalization ───────────────────────

async function normalizeSegmentEfforts(force: boolean): Promise<EntityResult> {
  let processed = 0;
  let offset = 0;
  const changedActivityIds: number[] = [];
  let watermark = force ? "" : await getWatermark("segment_efforts");

  while (true) {
    const rows = force
      ? await db
          .select()
          .from(srcSegmentEfforts)
          .limit(BATCH_SIZE)
          .offset(offset)
          .all()
      : await db
          .select()
          .from(srcSegmentEfforts)
          .where(gt(srcSegmentEfforts.updatedAt, watermark))
          .orderBy(asc(srcSegmentEfforts.updatedAt))
          .limit(BATCH_SIZE)
          .all();

    if (rows.length === 0) break;
    const batch = force ? rows : trimPartialTailGroup(rows, BATCH_SIZE);

    const timestamp = now();
    const statements = batch.map((src) => {
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

      changedActivityIds.push(src.activityId);
      processed++;
      if (src.updatedAt > watermark) watermark = src.updatedAt;

      return db
        .insert(segmentEfforts)
        .values({ ...normalized, createdAt: timestamp })
        .onConflictDoUpdate({ target: segmentEfforts.id, set: normalized });
    });

    await runBatched(statements);
    if (!force) await setWatermark("segment_efforts", watermark);

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  if (force) await setWatermark("segment_efforts", watermark);
  return { processed, changedActivityIds };
}

// ── Gear Normalization ─────────────────────────────────

async function normalizeGears(force: boolean): Promise<number> {
  let watermark = force ? "" : await getWatermark("gears");

  // Gears are few enough (single digits) to always process in one pass.
  const rows = force
    ? await db.select().from(srcGears).all()
    : await db
        .select()
        .from(srcGears)
        .where(gt(srcGears.updatedAt, watermark))
        .all();

  if (rows.length === 0) return 0;

  const timestamp = now();
  const statements = rows.map((src) => {
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

    if (src.updatedAt > watermark) watermark = src.updatedAt;

    return db
      .insert(gears)
      .values({ ...normalized, createdAt: timestamp })
      .onConflictDoUpdate({ target: gears.id, set: normalized });
  });

  await runBatched(statements);
  await setWatermark("gears", watermark);

  return rows.length;
}

// ── KOM/PR Stats Computation ───────────────────────────

/**
 * Recomputes komCount, bestKomRank, and bestPrRank for the given
 * activities from their segment efforts.
 *
 * Scoped by id on purpose. The unqualified version of this statement was
 * the single largest consumer of the account's D1 quota: it rewrote every
 * activity row (plus idx_activities_kom_count) and ran three correlated
 * subqueries per row, once an hour, forever. Callers pass only the
 * activities this normalization run actually touched; an empty list is
 * the common case and costs nothing.
 */
async function recomputeKomStats(activityIds: number[]): Promise<void> {
  if (activityIds.length === 0) {
    log.debug("No activities changed — skipping KOM/PR recompute");
    return;
  }

  for (let i = 0; i < activityIds.length; i += KOM_RECOMPUTE_CHUNK) {
    const chunk = activityIds.slice(i, i + KOM_RECOMPUTE_CHUNK);
    const ids = sql.join(
      chunk.map((id) => sql`${id}`),
      sql`, `
    );

    await db.run(sql`
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
      WHERE id IN (${ids})
    `);
  }

  log.debug("Recomputed KOM/PR stats", { activities: activityIds.length });
}
