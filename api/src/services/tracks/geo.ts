/**
 * Small geo helpers shared by the track processors.
 */

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Great-circle distance in meters. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when the sample has a usable position. */
export function hasPosition(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/**
 * Indices of samples with a usable position, dropping GPS teleports: a
 * point implying more than 70 m/s (~157 mph) from the last kept point is
 * discarded rather than drawing a streak across the map.
 *
 * `minSpacingS` thins dense recordings (1 Hz → one point per N seconds):
 * the GPS-derived products don't need per-second resolution, and halving
 * the points keeps processing inside a Worker's CPU budget.
 */
export function cleanGpsIndices(
  lat: number[],
  lng: number[],
  t: number[],
  minSpacingS = 0
): number[] {
  const kept: number[] = [];
  const last = lat.length - 1;
  for (let i = 0; i <= last; i++) {
    if (!hasPosition(lat[i]!, lng[i]!)) continue;
    const prev = kept[kept.length - 1];
    if (prev !== undefined) {
      const dt = t[i]! - t[prev]!;
      // Thin 1 Hz recordings; always keep the final point
      if (dt < minSpacingS && i !== last) continue;
      const d = haversineM(lat[prev]!, lng[prev]!, lat[i]!, lng[i]!);
      if (d / Math.max(1, dt) > 70) continue;
    }
    kept.push(i);
  }
  return kept;
}

/**
 * Encode [lat, lng] pairs as a Google polyline (1e5 precision) — the same
 * format Strava uses for map.summary_polyline, so the UI decodes both.
 */
export function encodePolyline(points: Array<[number, number]>): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = "";
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}
