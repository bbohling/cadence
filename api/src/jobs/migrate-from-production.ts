import { Database } from "bun:sqlite";
import { db } from "../db/connection";
import {
  users,
  srcActivities,
  srcSegmentEfforts,
  srcGears,
} from "../db/schema";
import { runNormalization } from "../services/normalize";
import { log } from "../utils/logger";
import { generateId, now } from "../utils/ids";
import { eq } from "drizzle-orm";

/**
 * Migration script — imports real data from the production Prisma database.
 *
 * Reads the existing production.db (Prisma/SQLite) and populates the
 * new Drizzle-based src_* tables with raw Strava data. Then runs
 * normalization to fill the imperial-unit tables.
 *
 * Usage:
 *   bun src/jobs/migrate-from-production.ts [path-to-production.db]
 *
 * Default path: ../../cadence-api/prisma/production.db
 */

const PRODUCTION_DB_PATH =
  process.argv[2] ?? "../../cadence-api/prisma/production.db";

log.info("Starting migration from production DB", { path: PRODUCTION_DB_PATH });

// Open the production database (read-only)
const prodDb = new Database(PRODUCTION_DB_PATH, { readonly: true });

// ── Step 1: Migrate the user record ────────────────────

log.info("Step 1: Migrating user record...");

interface ProdUser {
  id: string;
  name: string;
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const prodUser = prodDb
  .query("SELECT * FROM users WHERE name = 'brandon'")
  .get() as ProdUser | null;

if (!prodUser) {
  log.error("No user 'brandon' found in production DB!");
  process.exit(1);
}

// Check if user already exists in new DB
const existingUser = db.select().from(users).where(eq(users.name, "brandon")).get();

if (existingUser) {
  log.info("User already exists, updating tokens...");
  db.update(users)
    .set({
      accessToken: prodUser.accessToken,
      refreshToken: prodUser.refreshToken,
      expiresAt: prodUser.expiresAt,
      lastSyncAt: prodUser.lastSyncAt,
      updatedAt: now(),
    })
    .where(eq(users.name, "brandon"))
    .run();
} else {
  db.insert(users)
    .values({
      id: prodUser.id || generateId(),
      name: prodUser.name,
      athleteId: prodUser.athleteId,
      accessToken: prodUser.accessToken,
      refreshToken: prodUser.refreshToken,
      expiresAt: prodUser.expiresAt,
      lastSyncAt: prodUser.lastSyncAt,
      createdAt: prodUser.createdAt || now(),
      updatedAt: now(),
    })
    .run();
}

log.info("User migrated", {
  name: prodUser.name,
  athleteId: prodUser.athleteId,
});

// ── Step 2: Migrate raw activities into src_activities ──

log.info("Step 2: Migrating raw activities...");

interface ProdRawActivity {
  activityId: number;
  rawData: string;
  createdAt: string;
  updatedAt: string;
}

const rawActivities = prodDb
  .query("SELECT * FROM raw_activities ORDER BY activityId")
  .all() as ProdRawActivity[];

log.info(`Found ${rawActivities.length} raw activities to migrate`);

let activitiesMigrated = 0;
let segmentEffortsMigrated = 0;
let gearsMigrated = 0;
const timestamp = now();
const seenGearIds = new Set<string>();

for (const raw of rawActivities) {
  let detail: Record<string, any>;
  try {
    detail = JSON.parse(raw.rawData);
  } catch {
    log.warn("Skipping activity with invalid JSON", { activityId: raw.activityId });
    continue;
  }

  // Check if already migrated
  const existing = db
    .select({ id: srcActivities.id })
    .from(srcActivities)
    .where(eq(srcActivities.id, raw.activityId))
    .get();

  if (existing) continue;

  // Insert into src_activities
  db.insert(srcActivities)
    .values({
      id: raw.activityId,
      athleteId: detail.athlete?.id ?? prodUser.athleteId,
      rawJson: raw.rawData,
      name: detail.name ?? null,
      type: detail.type ?? null,
      sportType: detail.sport_type ?? null,
      distance: detail.distance ?? null,
      movingTime: detail.moving_time ?? null,
      elapsedTime: detail.elapsed_time ?? null,
      totalElevationGain: detail.total_elevation_gain ?? null,
      elevHigh: detail.elev_high ?? null,
      elevLow: detail.elev_low ?? null,
      startDate: detail.start_date ?? null,
      startDateLocal: detail.start_date_local ?? null,
      timezone: detail.timezone ?? null,
      averageSpeed: detail.average_speed ?? null,
      maxSpeed: detail.max_speed ?? null,
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
      achievementCount: detail.achievement_count ?? null,
      prCount: detail.pr_count ?? null,
      calories: detail.calories ?? null,
      averageTemp: detail.average_temp ?? null,
      trainer: detail.trainer ? 1 : 0,
      commute: detail.commute ? 1 : 0,
      gearId: detail.gear_id ?? null,
      segmentEffortsJson: detail.segment_efforts
        ? JSON.stringify(detail.segment_efforts)
        : null,
      mapSummaryPolyline: detail.map?.summary_polyline ?? null,
      fetchedAt: raw.createdAt || timestamp,
      createdAt: raw.createdAt || timestamp,
      updatedAt: raw.updatedAt || timestamp,
    })
    .run();

  activitiesMigrated++;

  // Extract segment efforts
  if (Array.isArray(detail.segment_efforts)) {
    for (const effort of detail.segment_efforts) {
      if (!effort.id) continue;

      const effortExists = db
        .select({ id: srcSegmentEfforts.id })
        .from(srcSegmentEfforts)
        .where(eq(srcSegmentEfforts.id, effort.id))
        .get();

      if (effortExists) continue;

      db.insert(srcSegmentEfforts)
        .values({
          id: effort.id,
          activityId: raw.activityId,
          segmentId: effort.segment?.id ?? 0,
          athleteId: effort.athlete?.id ?? prodUser.athleteId,
          rawJson: JSON.stringify(effort),
          name: effort.name ?? null,
          elapsedTime: effort.elapsed_time ?? null,
          movingTime: effort.moving_time ?? null,
          startDate: effort.start_date ?? null,
          startDateLocal: effort.start_date_local ?? null,
          distance: effort.distance ?? null,
          averageCadence: effort.average_cadence ?? null,
          averageWatts: effort.average_watts ?? null,
          averageHeartrate: effort.average_heartrate ?? null,
          maxHeartrate: effort.max_heartrate ?? null,
          deviceWatts: effort.device_watts ? 1 : 0,
          prRank: effort.pr_rank ?? null,
          komRank: effort.kom_rank ?? null,
          segmentJson: effort.segment ? JSON.stringify(effort.segment) : null,
          achievementsJson: JSON.stringify(effort.achievements ?? []),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      segmentEffortsMigrated++;
    }
  }

  // Extract gear from the activity (if present and not yet stored)
  if (detail.gear && detail.gear.id && !seenGearIds.has(detail.gear.id)) {
    seenGearIds.add(detail.gear.id);

    const gearExists = db
      .select({ id: srcGears.id })
      .from(srcGears)
      .where(eq(srcGears.id, detail.gear.id))
      .get();

    if (!gearExists) {
      db.insert(srcGears)
        .values({
          id: detail.gear.id,
          athleteId: prodUser.athleteId,
          rawJson: JSON.stringify(detail.gear),
          name: detail.gear.name ?? null,
          primaryGear: detail.gear.primary ? 1 : 0,
          distance: detail.gear.distance ?? null,
          brandName: detail.gear.brand_name ?? null,
          modelName: detail.gear.model_name ?? null,
          frameType: detail.gear.frame_type ?? null,
          description: detail.gear.description ?? null,
          resourceState: detail.gear.resource_state ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      gearsMigrated++;
    }
  }

  // Progress log every 200 activities
  if (activitiesMigrated % 200 === 0) {
    log.info("Migration progress", {
      activities: activitiesMigrated,
      segmentEfforts: segmentEffortsMigrated,
      gears: gearsMigrated,
    });
  }
}

// ── Step 3: Migrate gears that weren't in raw activity data ──

log.info("Step 3: Checking for additional gears in production...");

interface ProdGear {
  id: string;
  primary: number;
  name: string;
  resourceState: number;
  distance: number | null;
  brandName: string | null;
  modelName: string | null;
  frameType: number | null;
  description: string | null;
  athleteId: number;
}

const prodGears = prodDb.query("SELECT * FROM gears").all() as ProdGear[];

for (const gear of prodGears) {
  if (seenGearIds.has(gear.id)) continue;

  const gearExists = db
    .select({ id: srcGears.id })
    .from(srcGears)
    .where(eq(srcGears.id, gear.id))
    .get();

  if (gearExists) continue;

  // The old gears table distance is in miles (already converted).
  // We need meters for src_gears. Convert back: miles × 1609.344
  const distanceMeters = gear.distance != null ? gear.distance * 1609.344 : null;

  db.insert(srcGears)
    .values({
      id: gear.id,
      athleteId: gear.athleteId,
      rawJson: JSON.stringify(gear),
      name: gear.name,
      primaryGear: gear.primary ? 1 : 0,
      distance: distanceMeters,
      brandName: gear.brandName,
      modelName: gear.modelName,
      frameType: gear.frameType,
      description: gear.description,
      resourceState: gear.resourceState,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  gearsMigrated++;
}

log.info("Migration of source data complete", {
  activitiesMigrated,
  segmentEffortsMigrated,
  gearsMigrated,
});

// ── Step 4: Run normalization ──────────────────────────

log.info("Step 4: Running normalization (metric → imperial)...");

const normResult = runNormalization(true);

log.info("Normalization complete", normResult);

// ── Summary ────────────────────────────────────────────

log.info("Migration complete!", {
  user: prodUser.name,
  athleteId: prodUser.athleteId,
  srcActivities: activitiesMigrated,
  srcSegmentEfforts: segmentEffortsMigrated,
  srcGears: gearsMigrated,
  normalizedActivities: normResult.activitiesNormalized,
  normalizedEfforts: normResult.segmentEffortsNormalized,
  normalizedGears: normResult.gearsNormalized,
  totalDurationMs: normResult.durationMs,
});

prodDb.close();
process.exit(0);
