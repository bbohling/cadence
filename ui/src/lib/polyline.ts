/**
 * Google encoded-polyline helpers.
 *
 * Strava's `map.summary_polyline` uses Google's format at 1e5 precision.
 * Decoding is ~20 lines, so it lives here rather than in a dependency.
 */

/** [lng, lat] — GeoJSON / MapLibre order */
export type LngLat = [number, number];

/**
 * Decode a Google encoded polyline into [lng, lat] pairs.
 * @example decodePolyline("_p~iF~ps|U_ulLnnqC") → [[-120.2, 38.5], [-120.95, 40.7]]
 */
export function decodePolyline(encoded: string): LngLat[] {
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += readValue();
    lng += readValue();
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;

  function readValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/**
 * Split a line wherever consecutive points are more than `maxKm` apart.
 * GPS glitches show up as a single teleporting point, which draws a long
 * straight streak across a heatmap; summary polylines otherwise space
 * points ~1–2 km apart.
 */
export function splitJumps(line: LngLat[], maxKm = 10): LngLat[][] {
  const parts: LngLat[][] = [];
  let current: LngLat[] = [];
  for (const p of line) {
    const prev = current[current.length - 1];
    if (prev && haversineKm(prev, p) > maxKm) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 1) parts.push(current);
  return parts;
}

function haversineKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

/** Bounding box of one or more lines. Null when there are no points. */
export function boundsOf(lines: LngLat[][]): Bounds | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const line of lines) {
    for (const [lng, lat] of line) {
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return w === Infinity ? null : [w, s, e, n];
}

/**
 * Bounds of the "home" area: lines whose start lies within the 10th–90th
 * percentile box of all starts. Keeps a handful of travel rides from
 * zooming a heatmap out to the whole continent. Falls back to boundsOf.
 */
export function coreBounds(lines: LngLat[][]): Bounds | null {
  const starts = lines.map((l) => l[0]).filter((p): p is LngLat => !!p);
  if (starts.length < 10) return boundsOf(lines);

  const pct = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(q * (sorted.length - 1))]!;
  };
  const lngs = starts.map((p) => p[0]);
  const lats = starts.map((p) => p[1]);
  const [w, e] = [pct(lngs, 0.1), pct(lngs, 0.9)];
  const [s, n] = [pct(lats, 0.1), pct(lats, 0.9)];

  const core = lines.filter((l) => {
    const p = l[0];
    return p && p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n;
  });
  return boundsOf(core.length ? core : lines);
}

/**
 * Project a line into a size×size SVG box (Web Mercator, aspect preserved,
 * centered) and return the path `d` string. Used for route art, where every
 * ride is drawn at its own scale.
 */
export function toSvgPath(line: LngLat[], size: number, pad = 2): string {
  if (line.length < 2) return "";
  const projected = line.map(([lng, lat]) => {
    const rad = (lat * Math.PI) / 180;
    return [lng, (-Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180) / Math.PI] as const;
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of projected) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const inner = size - pad * 2;
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = inner / span;
  const offX = pad + (inner - (maxX - minX) * scale) / 2;
  const offY = pad + (inner - (maxY - minY) * scale) / 2;

  return projected
    .map(([x, y], i) => {
      const px = (offX + (x - minX) * scale).toFixed(1);
      const py = (offY + (y - minY) * scale).toFixed(1);
      return `${i === 0 ? "M" : "L"}${px} ${py}`;
    })
    .join("");
}
