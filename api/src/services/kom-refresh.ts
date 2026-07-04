import { eq, sql } from "drizzle-orm";
import { db } from "../db/connection";
import { users, segmentCurrentRanks } from "../db/schema";
import {
  ensureValidToken,
  getAthleteKoms,
  type StravaSegmentEffort,
} from "./strava";
import { metersToMiles } from "../utils/conversions";
import { log } from "../utils/logger";
import { now } from "../utils/ids";

/**
 * KOM Refresh service.
 *
 * Fetches the athlete's current KOMs (1st place) from the Strava API
 * and writes them to the `segment_current_ranks` table.
 *
 * STRAVA API LIMITATIONS:
 * ───────────────────────
 * The only reliable endpoint for CURRENT leaderboard data is
 * /athletes/{id}/koms, which returns segments where the athlete
 * holds the KOM (1st place only).
 *
 * Other approaches we tested don't work:
 *   - /segment_efforts: `kom_rank` is frozen at recording time (stale)
 *   - /segments/{id}/leaderboard: returns 403 (requires Summit/partner access)
 *
 * For rankings 2nd–10th, we rely on the historic data in segment_efforts
 * (from activity sync). Only KOMs (1st place) have reliable "current" data.
 *
 * STRATEGY:
 * ─────────
 * 1. Fetch all pages from /athletes/{id}/koms — cheap: 1-2 API calls
 * 2. Upsert each KOM into segment_current_ranks with rank = 1
 * 3. Mark any previously-known KOMs not in the response as lost
 *    (current_rank = null, previous_rank preserved)
 */

export interface KomRefreshResult {
  currentKoms: number;
  previousKoms: number;
  gained: number;
  lost: number;
  durationMs: number;
}

/** Track whether a refresh is currently running (prevent duplicates) */
let activeRefresh: { userId: string; startedAt: string } | null = null;

/** Get the current refresh status */
export function getRefreshStatus(): {
  running: boolean;
  userId?: string;
  startedAt?: string;
} {
  if (!activeRefresh) return { running: false };
  return { running: true, ...activeRefresh };
}

/**
 * Run a KOM refresh for a user.
 *
 * Fetches the athlete's current KOMs from Strava and updates the
 * segment_current_ranks table. Fast: typically completes in <10 seconds.
 */
export async function refreshCurrentKoms(userId: string): Promise<KomRefreshResult> {
  if (activeRefresh) {
    throw new Error(`KOM refresh already running for ${activeRefresh.userId}`);
  }

  activeRefresh = { userId, startedAt: now() };
  const start = Date.now();

  try {
    const user = db.select().from(users).where(eq(users.name, userId)).get();
    if (!user) throw new Error(`User not found: ${userId}`);
    if (!user.athleteId) throw new Error(`User has no athlete ID: ${userId}`);

    const token = await ensureValidToken(user);
    const athleteId = user.athleteId;
    const timestamp = now();

    // Count previous KOMs for change tracking
    const previousCount = db.all<{ count: number }>(sql`
      SELECT COUNT(*) AS count
      FROM segment_current_ranks
      WHERE athlete_id = ${athleteId}
        AND current_rank = 1
    `)[0]?.count ?? 0;

    // ── Fetch current KOMs from /athletes/{id}/koms ─────────────

    log.info("KOM refresh: fetching current KOMs from Strava", { userId });

    const currentKomEfforts = await fetchAllKomPages(token, athleteId);
    const currentKoms = currentKomEfforts.length;

    log.info("Fetched current KOMs", { count: currentKoms });

    // Track which segment IDs we see in this refresh
    const currentSegmentIds = new Set<number>();

    for (const effort of currentKomEfforts) {
      upsertKom(effort, athleteId, timestamp);
      currentSegmentIds.add(effort.segment.id);
    }

    // ── Mark lost KOMs ──────────────────────────────────────────
    //
    // Any segment_current_ranks row with rank=1 that wasn't in this
    // refresh means the athlete lost that KOM.

    const lostResult = db.all<{ count: number }>(sql`
      SELECT COUNT(*) AS count
      FROM segment_current_ranks
      WHERE athlete_id = ${athleteId}
        AND current_rank IS NOT NULL
        AND checked_at < ${timestamp}
    `)[0];

    const lost = lostResult?.count ?? 0;

    if (lost > 0) {
      db.run(sql`
        UPDATE segment_current_ranks
        SET
          previous_rank = current_rank,
          current_rank = NULL,
          checked_at = ${timestamp},
          updated_at = ${timestamp}
        WHERE athlete_id = ${athleteId}
          AND current_rank IS NOT NULL
          AND checked_at < ${timestamp}
      `);
    }

    // Calculate gained KOMs (segments that are new or were previously lost)
    const gained = Math.max(0, currentKoms - (previousCount - lost));

    const durationMs = Date.now() - start;

    log.info("KOM refresh complete", {
      currentKoms,
      previousKoms: previousCount,
      gained,
      lost,
      durationMs,
    });

    return { currentKoms, previousKoms: previousCount, gained, lost, durationMs };
  } finally {
    activeRefresh = null;
  }
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Fetch all pages from the /athletes/{id}/koms endpoint.
 */
async function fetchAllKomPages(
  token: string,
  athleteId: number
): Promise<StravaSegmentEffort[]> {
  const all: StravaSegmentEffort[] = [];
  let page = 1;

  while (true) {
    const efforts = await getAthleteKoms(token, athleteId, page, 200);
    all.push(...efforts);

    if (efforts.length < 200) break;
    page++;
  }

  return all;
}

/**
 * Upsert a KOM into segment_current_ranks.
 *
 * Stores the previous rank for change tracking and updates all
 * denormalized fields.
 */
function upsertKom(
  effort: StravaSegmentEffort,
  athleteId: number,
  timestamp: string
): void {
  const segmentId = effort.segment.id;

  const existing = db
    .select({ currentRank: segmentCurrentRanks.currentRank })
    .from(segmentCurrentRanks)
    .where(eq(segmentCurrentRanks.segmentId, segmentId))
    .get();

  const values = {
    segmentId,
    athleteId,
    effortId: effort.id,
    segmentName: effort.segment.name ?? effort.name,
    currentRank: 1, // KOM endpoint only returns 1st place
    previousRank: existing?.currentRank ?? null,
    elapsedTime: effort.elapsed_time,
    distance: metersToMiles(effort.distance),
    averageGrade: effort.segment.average_grade ?? null,
    city: effort.segment.city ?? null,
    state: effort.segment.state ?? null,
    checkedAt: timestamp,
    updatedAt: timestamp,
  };

  if (existing !== undefined) {
    db.update(segmentCurrentRanks)
      .set(values)
      .where(eq(segmentCurrentRanks.segmentId, segmentId))
      .run();
  } else {
    db.insert(segmentCurrentRanks)
      .values({ ...values, createdAt: timestamp })
      .run();
  }
}
