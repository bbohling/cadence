import type { DetectedClimb } from "./types";
import { haversineM } from "./geo";
import { jaccard } from "./tiles";

/**
 * Matching detected climbs and routes against the canonical ones already
 * stored, so efforts on the same hill (or rides of the same loop) line up
 * across years.
 *
 * Rides are matched oldest-first during backfill, so the first effort on a
 * climb defines its canonical geometry.
 */

export interface CanonicalClimb {
  id: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  lengthM: number;
}

/**
 * Where a climb "starts" is fuzzy (the grade ramps up gradually, and a
 * slower day smooths differently); where it tops out is sharp. So the
 * summit must match tightly, the start loosely. Opposite sides of the same
 * hill share a summit but start hundreds of meters apart on different
 * roads, so they stay separate.
 */
const CLIMB_END_TOLERANCE_M = 100;
const CLIMB_START_TOLERANCE_M = 300;
/** Length within this fraction of the canonical climb's length */
const CLIMB_LENGTH_TOLERANCE = 0.2;

/** Closest canonical climb this effort belongs to, if any. */
export function matchClimb(
  climb: DetectedClimb,
  candidates: CanonicalClimb[]
): CanonicalClimb | undefined {
  let best: CanonicalClimb | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (Math.abs(climb.lengthM - c.lengthM) > c.lengthM * CLIMB_LENGTH_TOLERANCE) continue;
    const de = haversineM(climb.endLat, climb.endLng, c.endLat, c.endLng);
    if (de > CLIMB_END_TOLERANCE_M) continue;
    const ds = haversineM(climb.startLat, climb.startLng, c.startLat, c.startLng);
    if (ds > CLIMB_START_TOLERANCE_M) continue;
    if (ds + de < bestScore) {
      bestScore = ds + de;
      best = c;
    }
  }
  return best;
}

export interface RouteCluster {
  id: number;
  /** z16 tiles of the representative ride, sorted */
  tilesZ16: number[];
  distanceM: number;
}

/** Minimum z16 tile overlap for two rides to count as the same route */
const ROUTE_JACCARD = 0.7;
/** Distance within this fraction — keeps a loop and its extension apart */
export const ROUTE_DISTANCE_TOLERANCE = 0.15;

/** Most similar route cluster, if any clears the threshold. */
export function matchRoute(
  tilesZ16: number[],
  distanceM: number,
  candidates: RouteCluster[]
): RouteCluster | undefined {
  let best: RouteCluster | undefined;
  let bestScore = ROUTE_JACCARD;
  for (const c of candidates) {
    if (Math.abs(distanceM - c.distanceM) > c.distanceM * ROUTE_DISTANCE_TOLERANCE) continue;
    const score = jaccard(tilesZ16, c.tilesZ16);
    if (score >= bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
