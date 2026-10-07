/**
 * Slippy-map tiles visited by a track.
 *
 * z14 (~1.6 km squares at 45°N) is the VeloViewer/Squadrats "explorer
 * tile" convention. z16 (~400 m) is fine enough to tell two routes in the
 * same area apart, and is used for route clustering.
 *
 * A tile is stored as a single integer key: x * 2^zoom + y.
 */

/** Tile x/y for a coordinate at `zoom`. */
export function tileXY(lat: number, lng: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

export function tileKey(x: number, y: number, zoom: number): number {
  return x * 2 ** zoom + y;
}

export function keyToXY(key: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  return [Math.floor(key / n), key % n];
}

/**
 * Sorted unique tile keys touched by the path through `indices`.
 *
 * When consecutive points land in non-adjacent tiles (fast descent, sparse
 * smart recording), the segment is subdivided so no tile in between is
 * skipped. Callers pass teleport-free indices (see cleanGpsIndices).
 */
export function visitedTiles(
  lat: number[],
  lng: number[],
  indices: number[],
  zoom: number
): number[] {
  const keys = new Set<number>();
  let prev: number | undefined;

  for (const i of indices) {
    const [x, y] = tileXY(lat[i]!, lng[i]!, zoom);
    keys.add(tileKey(x, y, zoom));

    if (prev !== undefined) {
      const [px, py] = tileXY(lat[prev]!, lng[prev]!, zoom);
      const gap = Math.max(Math.abs(x - px), Math.abs(y - py));
      if (gap > 1) {
        // Sample at quarter-tile spacing so diagonal crossings are caught
        const steps = gap * 4;
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          const [ix, iy] = tileXY(
            lat[prev]! + (lat[i]! - lat[prev]!) * f,
            lng[prev]! + (lng[i]! - lng[prev]!) * f,
            zoom
          );
          keys.add(tileKey(ix, iy, zoom));
        }
      }
    }
    prev = i;
  }

  return [...keys].sort((a, b) => a - b);
}

/**
 * Coarsen tile keys to a lower zoom (each zoom level halves x and y), so
 * z14 comes from the z16 set for free instead of a second projection pass.
 */
export function coarsenTiles(keys: number[], fromZoom: number, toZoom: number): number[] {
  const shift = fromZoom - toZoom;
  const out = new Set<number>();
  for (const k of keys) {
    const [x, y] = keyToXY(k, fromZoom);
    out.add(tileKey(x >> shift, y >> shift, toZoom));
  }
  return [...out].sort((a, b) => a - b);
}

/** Compact text form for D1: sorted keys in base 36, comma-separated. */
export function encodeTiles(keys: number[]): string {
  return keys.map((k) => k.toString(36)).join(",");
}

export function decodeTiles(sig: string | null | undefined): number[] {
  if (!sig) return [];
  return sig.split(",").map((s) => parseInt(s, 36));
}

/** Jaccard similarity of two sorted key lists. */
export function jaccard(a: number[], b: number[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  let i = 0;
  let j = 0;
  let shared = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      shared++;
      i++;
      j++;
    } else if (a[i]! < b[j]!) {
      i++;
    } else {
      j++;
    }
  }
  return shared / (a.length + b.length - shared);
}

export interface ExplorerStats {
  tiles: number;
  /** Side length of the largest fully-visited square */
  maxSquare: number;
  /** Top-left tile of that square */
  maxSquareOrigin: [number, number] | null;
  /** Size of the largest connected group of tiles whose 4 neighbors are all visited */
  maxCluster: number;
}

/**
 * Explorer stats over a set of z14 tile keys.
 *
 * Max square: classic largest-square DP over the visited grid (bounded to
 * the tiles' bounding box). Cluster: tiles with all 4 neighbors visited,
 * grouped by 4-connectivity — the VeloViewer definition.
 */
export function explorerStats(keys: Iterable<number>, zoom = 14): ExplorerStats {
  const visited = new Set<number>(keys);
  if (visited.size === 0) {
    return { tiles: 0, maxSquare: 0, maxSquareOrigin: null, maxCluster: 0 };
  }

  const has = (x: number, y: number) => visited.has(tileKey(x, y, zoom));

  // ── Max square ─────────────────────────────────────
  // DP keyed by tile: size of the largest square whose bottom-right is here.
  // Iterate in (y, x) order so up/left/up-left are already computed.
  const coords = [...visited].map((k) => keyToXY(k, zoom));
  coords.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const dp = new Map<number, number>();
  let maxSquare = 0;
  let maxSquareOrigin: [number, number] | null = null;
  for (const [x, y] of coords) {
    const up = dp.get(tileKey(x, y - 1, zoom)) ?? 0;
    const left = dp.get(tileKey(x - 1, y, zoom)) ?? 0;
    const diag = dp.get(tileKey(x - 1, y - 1, zoom)) ?? 0;
    const size = Math.min(up, left, diag) + 1;
    dp.set(tileKey(x, y, zoom), size);
    if (size > maxSquare) {
      maxSquare = size;
      maxSquareOrigin = [x - size + 1, y - size + 1];
    }
  }

  // ── Max cluster ────────────────────────────────────
  const inner = new Set<number>();
  for (const [x, y] of coords) {
    if (has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1)) {
      inner.add(tileKey(x, y, zoom));
    }
  }
  let maxCluster = 0;
  const seen = new Set<number>();
  for (const start of inner) {
    if (seen.has(start)) continue;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const [x, y] = keyToXY(k, zoom);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        const nk = tileKey(nx, ny, zoom);
        if (inner.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    maxCluster = Math.max(maxCluster, size);
  }

  return { tiles: visited.size, maxSquare, maxSquareOrigin, maxCluster };
}
