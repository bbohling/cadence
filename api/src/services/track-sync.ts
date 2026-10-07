import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection";
import {
  users,
  activityTracks,
  powerBests,
  climbs,
  climbEfforts,
  routeClusters,
} from "../db/schema";
import { ensureValidToken, getActivityStreams, type StravaStreams } from "./strava";
import { processTrack } from "./tracks/process";
import { matchClimb, matchRoute, ROUTE_DISTANCE_TOLERANCE } from "./tracks/match";
import { decodeTiles, encodeTiles } from "./tracks/tiles";
import type { ProcessedTrack, Track } from "./tracks/types";
import { log } from "../utils/logger";
import { now } from "../utils/ids";

/**
 * Track sync — the Worker-side twin of scripts/backfill-tracks.ts.
 *
 * Picks rides that have no activity_tracks row yet, fetches their Strava
 * streams, and runs them through the same services/tracks/ code as the
 * backfill. History comes from the export; this keeps up with new rides.
 *
 * Free-tier budget: one ride per call by default. Processing a 3-hour ride
 * is ~3 ms warm, plus ~1.5 ms to parse the streams JSON — comfortably
 * inside the 10 ms CPU limit on its own, but not stacked on a heavy sync,
 * which is why the cron only calls this when the sync found nothing new.
 */

const RIDE_TYPES = ["Ride", "VirtualRide"] as const;

export interface TrackSyncResult {
  processed: number;
  noData: number;
  remaining: number;
}

export async function syncTracks(userId: string, limit = 1): Promise<TrackSyncResult> {
  const user = await db.select().from(users).where(eq(users.name, userId)).get();
  if (!user?.athleteId) throw new Error(`User not found: ${userId}`);
  const athleteId = user.athleteId;

  const pending = await db.all<{ id: number; type: string; start_date: string | null }>(sql`
    SELECT a.id, a.type, a.start_date
    FROM activities a
    LEFT JOIN activity_tracks t ON t.activity_id = a.id
    WHERE a.athlete_id = ${athleteId}
      AND a.type IN ${RIDE_TYPES}
      AND t.activity_id IS NULL
    ORDER BY a.start_date DESC
    LIMIT ${limit + 1}
  `);

  const result: TrackSyncResult = { processed: 0, noData: 0, remaining: Math.max(0, pending.length - limit) };
  if (pending.length === 0) return result;

  const token = await ensureValidToken(user);

  for (const activity of pending.slice(0, limit)) {
    const startTime = activity.start_date ? Date.parse(activity.start_date) / 1000 : 0;
    let streams: StravaStreams | null;
    try {
      streams = await getActivityStreams(token, activity.id);
    } catch (err) {
      // 404 = no recording (manual entry). Anything else is transient: leave
      // the ride unprocessed so the next run retries it.
      if (err instanceof Error && err.message.includes("error 404")) {
        streams = null;
      } else {
        throw err;
      }
    }

    const track = streams ? streamsToTrack(streams, startTime) : null;
    const processed = track
      ? processTrack(track, { virtual: activity.type === "VirtualRide" })
      : null;

    if (!processed || (processed.gpsPoints < 2 && processed.powerBests.length === 0)) {
      await db.insert(activityTracks).values({
        activityId: activity.id,
        athleteId,
        source: "streams",
        status: "no_data",
        startDate: activity.start_date,
        processedAt: now(),
      }).onConflictDoNothing().run();
      result.noData++;
      continue;
    }

    await storeProcessed(athleteId, activity.id, activity.start_date, startTime, processed);
    result.processed++;
    log.info("Track processed", {
      activityId: activity.id,
      gpsPoints: processed.gpsPoints,
      climbs: processed.climbs.length,
      powerBests: processed.powerBests.length,
    });
  }

  return result;
}

/** Strava streams → Track (parallel arrays, NaN for missing samples). */
export function streamsToTrack(streams: StravaStreams, startTime: number): Track | null {
  const t = streams.time?.data;
  if (!t || t.length < 2) return null;
  const latlng = streams.latlng?.data;
  const at = <T>(arr: T[] | undefined, i: number) => (arr ? arr[i] : undefined);
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : NaN);

  return {
    startTime,
    t,
    lat: t.map((_, i) => num(at(latlng, i)?.[0])),
    lng: t.map((_, i) => num(at(latlng, i)?.[1])),
    ele: t.map((_, i) => num(at(streams.altitude?.data, i))),
    watts: t.map((_, i) => num(at(streams.watts?.data, i))),
    hr: t.map((_, i) => num(at(streams.heartrate?.data, i))),
  };
}

async function storeProcessed(
  athleteId: number,
  activityId: number,
  startDate: string | null,
  startTime: number,
  p: ProcessedTrack
): Promise<void> {
  const iso = (epochS: number) => new Date(epochS * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

  // ── Route cluster ──────────────────────────────────
  let routeClusterId: number | null = null;
  if (p.tilesZ16.length >= 5) {
    // Distance prefilter in SQL keeps the tile comparison to a handful of rows
    const candidates = await db
      .select()
      .from(routeClusters)
      .where(
        and(
          eq(routeClusters.athleteId, athleteId),
          gte(routeClusters.distanceM, p.distanceM / (1 + ROUTE_DISTANCE_TOLERANCE)),
          lte(routeClusters.distanceM, p.distanceM / (1 - ROUTE_DISTANCE_TOLERANCE))
        )
      )
      .all();
    const match = matchRoute(
      p.tilesZ16,
      p.distanceM,
      candidates.map((c) => ({ id: c.id, tilesZ16: decodeTiles(c.tilesZ16), distanceM: c.distanceM }))
    );
    if (match) {
      routeClusterId = match.id;
    } else {
      const [created] = await db
        .insert(routeClusters)
        .values({
          athleteId,
          repActivityId: activityId,
          tilesZ16: encodeTiles(p.tilesZ16),
          distanceM: p.distanceM,
        })
        .returning({ id: routeClusters.id });
      routeClusterId = created?.id ?? null;
    }
  }

  // ── Climbs ─────────────────────────────────────────
  const effortRows: Array<typeof climbEfforts.$inferInsert> = [];
  for (const c of p.climbs) {
    // ~300 m box around the start; matchClimb applies the precise checks
    const near = await db
      .select()
      .from(climbs)
      .where(
        and(
          eq(climbs.athleteId, athleteId),
          gte(climbs.startLat, c.startLat - 0.003),
          lte(climbs.startLat, c.startLat + 0.003),
          gte(climbs.startLng, c.startLng - 0.004),
          lte(climbs.startLng, c.startLng + 0.004)
        )
      )
      .all();
    let climbId = matchClimb(c, near)?.id;
    if (climbId === undefined) {
      const [created] = await db
        .insert(climbs)
        .values({
          athleteId,
          startLat: round6(c.startLat),
          startLng: round6(c.startLng),
          endLat: round6(c.endLat),
          endLng: round6(c.endLng),
          lengthM: c.lengthM,
          gainM: c.gainM,
          avgGrade: c.avgGrade,
        })
        .returning({ id: climbs.id });
      climbId = created!.id;
    }
    effortRows.push({
      activityId,
      startOffsetS: c.startOffsetS,
      climbId,
      athleteId,
      startDate: iso(startTime + c.startOffsetS),
      elapsedS: c.elapsedS,
      avgWatts: c.avgWatts,
      avgHr: c.avgHr,
    });
  }

  // ── Writes ─────────────────────────────────────────
  // activity_tracks goes last: it's what marks the ride done, so a failure
  // part-way leaves the ride pending and the next run redoes it (the other
  // inserts are idempotent on their primary keys).
  if (p.powerBests.length) {
    await db
      .insert(powerBests)
      .values(
        p.powerBests.map((b) => ({
          activityId,
          athleteId,
          durationS: b.durationS,
          watts: b.watts,
          startDate: startDate ?? iso(startTime),
        }))
      )
      .onConflictDoNothing()
      .run();
  }
  if (effortRows.length) {
    await db.insert(climbEfforts).values(effortRows).onConflictDoNothing().run();
  }
  await db
    .insert(activityTracks)
    .values({
      activityId,
      athleteId,
      source: "streams",
      status: "ok",
      startDate,
      gpsPoints: p.gpsPoints,
      distanceM: p.distanceM,
      tilesZ14: p.tilesZ14.length ? encodeTiles(p.tilesZ14) : null,
      detailPolyline: p.detailPolyline,
      routeClusterId,
      processedAt: now(),
    })
    .onConflictDoNothing()
    .run();
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
