import type { ProcessedTrack, Track } from "./types";
import { cleanGpsIndices, encodePolyline, haversineM } from "./geo";
import { coarsenTiles, visitedTiles } from "./tiles";
import { powerBests } from "./power";
import { detectClimbs } from "./climbs";
import { simplifyToMax } from "./simplify";

const DETAIL_MAX_POINTS = 1000;
/** GPS thinning for tiles/climbs/map; power still uses every sample */
const GPS_SPACING_S = 2;

export interface ProcessOptions {
  /**
   * Virtual rides (Zwift etc.) carry fake GPS for a game world. Their power
   * counts; their tiles, climbs and maps don't.
   */
  virtual?: boolean;
}

/**
 * Turn one recorded activity into the small derived products Cadence
 * stores. The raw track is not kept anywhere.
 */
export function processTrack(track: Track, options: ProcessOptions = {}): ProcessedTrack {
  const bests = powerBests(track.t, track.watts);

  const gps = options.virtual ? [] : cleanGpsIndices(track.lat, track.lng, track.t, GPS_SPACING_S);
  if (gps.length < 2) {
    return {
      gpsPoints: gps.length,
      tilesZ14: [],
      tilesZ16: [],
      powerBests: bests,
      climbs: [],
      detailPolyline: null,
      distanceM: 0,
    };
  }

  // Cumulative distance along the cleaned path (NaN off-path)
  const dist = new Array<number>(track.t.length).fill(NaN);
  let total = 0;
  dist[gps[0]!] = 0;
  for (let k = 1; k < gps.length; k++) {
    const a = gps[k - 1]!;
    const b = gps[k]!;
    total += haversineM(track.lat[a]!, track.lng[a]!, track.lat[b]!, track.lng[b]!);
    dist[b] = total;
  }

  const withEle = gps.filter((i) => Number.isFinite(track.ele[i]));
  const climbs =
    withEle.length >= gps.length * 0.8
      ? detectClimbs({ ...track, dist, indices: withEle })
      : [];

  const simplified = simplifyToMax(track.lat, track.lng, gps, DETAIL_MAX_POINTS);
  const tilesZ16 = visitedTiles(track.lat, track.lng, gps, 16);

  return {
    gpsPoints: gps.length,
    tilesZ14: coarsenTiles(tilesZ16, 16, 14),
    tilesZ16,
    powerBests: bests,
    climbs,
    detailPolyline: encodePolyline(simplified.map((i) => [track.lat[i]!, track.lng[i]!])),
    distanceM: Math.round(total),
  };
}
