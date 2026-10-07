/**
 * Douglas–Peucker line simplification, iterative (no recursion depth
 * limits on 20k-point rides).
 *
 * Works on lat/lng directly with longitude scaled by cos(latitude), which
 * is accurate enough at ride scale.
 */

/** Indices of `indices` to keep at the given tolerance (degrees of latitude). */
export function douglasPeucker(
  lat: number[],
  lng: number[],
  indices: number[],
  tolerance: number
): number[] {
  if (indices.length <= 2) return indices;

  const cos = Math.cos(((lat[indices[0]!] ?? 0) * Math.PI) / 180);
  const keep = new Uint8Array(indices.length);
  keep[0] = 1;
  keep[indices.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, indices.length - 1]];
  const tol2 = tolerance * tolerance;

  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = lng[indices[a]!]! * cos, ay = lat[indices[a]!]!;
    const bx = lng[indices[b]!]! * cos, by = lat[indices[b]!]!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = lng[indices[i]!]! * cos, py = lat[indices[i]!]!;
      let d2: number;
      if (len2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - (ax + u * dx)) ** 2 + (py - (ay + u * dy)) ** 2;
      }
      if (d2 > maxD) { maxD = d2; maxI = i; }
    }

    if (maxD > tol2 && maxI > 0) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }

  return indices.filter((_, i) => keep[i]);
}

/**
 * Simplify to at most `maxPoints`, starting at ~5 m tolerance and
 * loosening until it fits.
 */
export function simplifyToMax(
  lat: number[],
  lng: number[],
  indices: number[],
  maxPoints: number
): number[] {
  let tolerance = 0.00005; // ~5.5 m of latitude
  let kept = douglasPeucker(lat, lng, indices, tolerance);
  while (kept.length > maxPoints && tolerance < 0.01) {
    tolerance *= 1.6;
    kept = douglasPeucker(lat, lng, indices, tolerance);
  }
  return kept;
}
