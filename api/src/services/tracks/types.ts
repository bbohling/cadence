/**
 * Track processing types.
 *
 * Everything under services/tracks/ is pure: no DB, no fetch, no Node or
 * Workers APIs. The same code runs in the Worker (Strava streams for new
 * rides) and in the local backfill script (FIT/GPX/TCX from the Strava
 * export), so both produce identical derived data.
 *
 * Units are metric throughout (meters, seconds, watts). Conversion to
 * imperial happens in the report layer, like everything else in Cadence.
 */

/**
 * One recorded activity as parallel arrays, one entry per sample.
 * Missing values are NaN (a sample can have power but no GPS, etc.).
 */
export interface Track {
  /** Unix epoch seconds of the first sample */
  startTime: number;
  /** Seconds since startTime */
  t: number[];
  lat: number[];
  lng: number[];
  /** Elevation, meters */
  ele: number[];
  /** Power, watts (NaN when no power meter) */
  watts: number[];
  /** Heart rate, bpm */
  hr: number[];
}

export interface PowerBest {
  durationS: number;
  watts: number;
}

export interface DetectedClimb {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** Seconds since track start */
  startOffsetS: number;
  elapsedS: number;
  lengthM: number;
  gainM: number;
  /** Percent */
  avgGrade: number;
  avgWatts: number | null;
  avgHr: number | null;
}

export interface ProcessedTrack {
  /** Points with valid GPS */
  gpsPoints: number;
  /** Sorted z14 tile keys (see tiles.ts), empty without GPS */
  tilesZ14: number[];
  /** Sorted z16 tile keys, used for route clustering */
  tilesZ16: number[];
  powerBests: PowerBest[];
  climbs: DetectedClimb[];
  /** Google-encoded polyline, ~1000 points max; null without GPS */
  detailPolyline: string | null;
  /** Total distance from GPS, meters */
  distanceM: number;
}
