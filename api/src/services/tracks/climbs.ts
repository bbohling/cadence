import type { DetectedClimb } from "./types";

/**
 * Climb detection from an elevation profile.
 *
 * 1. Elevation is resampled onto a 10 m distance grid and smoothed with a
 *    ~90 m moving average (GPS/barometer noise otherwise creates fake
 *    gain on flat roads).
 * 2. A single pass tracks a running low and high. The climb ends when the
 *    road drops more than DROP_TOLERANCE_M below the high (so short dips
 *    inside a climb don't split it) or falls below the low.
 * 3. Candidates must meet MIN_LENGTH_M, MIN_GAIN_M and MIN_GRADE_PCT.
 */

const GRID_M = 10;
const SMOOTH_SAMPLES = 9;
const DROP_TOLERANCE_M = 15;
const MIN_LENGTH_M = 500;
const MIN_GAIN_M = 30;
const MIN_GRADE_PCT = 3;

export interface ClimbInput {
  t: number[];
  lat: number[];
  lng: number[];
  ele: number[];
  watts: number[];
  hr: number[];
  /** Cumulative distance (m) per sample, aligned with the arrays above */
  dist: number[];
  /** Indices with valid GPS + elevation, increasing */
  indices: number[];
}

export function detectClimbs(input: ClimbInput): DetectedClimb[] {
  const { dist, ele, indices } = input;
  if (indices.length < 2) return [];

  const total = dist[indices[indices.length - 1]!]! - dist[indices[0]!]!;
  if (total < MIN_LENGTH_M) return [];

  // ── 1. Resample + smooth ───────────────────────────
  const d0 = dist[indices[0]!]!;
  const n = Math.floor(total / GRID_M) + 1;
  const raw = new Float64Array(n);
  let k = 0;
  for (let g = 0; g < n; g++) {
    const target = d0 + g * GRID_M;
    while (k < indices.length - 2 && dist[indices[k + 1]!]! < target) k++;
    const a = indices[k]!;
    const b = indices[Math.min(k + 1, indices.length - 1)]!;
    const span = dist[b]! - dist[a]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (target - dist[a]!) / span)) : 0;
    raw[g] = ele[a]! + (ele[b]! - ele[a]!) * f;
  }
  const smooth = movingAverage(raw, SMOOTH_SAMPLES);

  // ── 2. Low/high sweep ──────────────────────────────
  const climbs: DetectedClimb[] = [];
  let low = 0;
  let high = 0;
  const emit = () => {
    const climb = toClimb(input, d0, low, high, smooth);
    if (climb) climbs.push(climb);
  };

  for (let g = 1; g < n; g++) {
    const e = smooth[g]!;
    if (e < smooth[low]!) {
      emit();
      low = high = g;
    } else if (e >= smooth[high]!) {
      high = g;
    } else if (smooth[high]! - e > DROP_TOLERANCE_M) {
      emit();
      low = high = g;
    }
  }
  emit();

  return climbs;
}

function toClimb(
  input: ClimbInput,
  d0: number,
  lowG: number,
  highG: number,
  smooth: Float64Array
): DetectedClimb | null {
  const lengthM = (highG - lowG) * GRID_M;
  const gainM = smooth[highG]! - smooth[lowG]!;
  if (lengthM < MIN_LENGTH_M || gainM < MIN_GAIN_M) return null;
  const avgGrade = (gainM / lengthM) * 100;
  if (avgGrade < MIN_GRADE_PCT) return null;

  const s = sampleAtDistance(input, d0 + lowG * GRID_M);
  const e = sampleAtDistance(input, d0 + highG * GRID_M);
  const { t, lat, lng, watts, hr } = input;
  const elapsedS = t[e]! - t[s]!;
  if (elapsedS <= 0) return null;

  return {
    startLat: lat[s]!,
    startLng: lng[s]!,
    endLat: lat[e]!,
    endLng: lng[e]!,
    startOffsetS: Math.round(t[s]!),
    elapsedS: Math.round(elapsedS),
    lengthM: Math.round(lengthM),
    gainM: Math.round(gainM * 10) / 10,
    avgGrade: Math.round(avgGrade * 10) / 10,
    avgWatts: timeWeightedMean(t, watts, s, e, true),
    avgHr: timeWeightedMean(t, hr, s, e, false),
  };
}

/** First GPS sample at or past `target` meters. */
function sampleAtDistance(input: ClimbInput, target: number): number {
  const { dist, indices } = input;
  let lo = 0;
  let hi = indices.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[indices[mid]!]! < target) lo = mid + 1;
    else hi = mid;
  }
  return indices[lo]!;
}

/**
 * Time-weighted mean of `values` between samples s and e. For power,
 * missing samples inside a ride count as 0 W (coasting); for HR they're
 * skipped. Returns null when the window has no data at all.
 */
function timeWeightedMean(
  t: number[],
  values: number[],
  s: number,
  e: number,
  zeroMissing: boolean
): number | null {
  let sum = 0;
  let weight = 0;
  let any = false;
  for (let i = s; i < e; i++) {
    const dt = Math.min(Math.max(t[i + 1]! - t[i]!, 0), 5);
    const v = values[i]!;
    if (Number.isFinite(v)) {
      any = true;
      sum += v * dt;
      weight += dt;
    } else if (zeroMissing) {
      weight += dt;
    }
  }
  return any && weight > 0 ? Math.round(sum / weight) : null;
}

function movingAverage(values: Float64Array, window: number): Float64Array {
  const out = new Float64Array(values.length);
  const half = Math.floor(window / 2);
  let sum = 0;
  let count = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < values.length; i++) {
    const wantLo = Math.max(0, i - half);
    const wantHi = Math.min(values.length - 1, i + half);
    while (hi < wantHi) { hi++; sum += values[hi]!; count++; }
    while (lo < wantLo) { sum -= values[lo]!; count--; lo++; }
    out[i] = sum / count;
  }
  return out;
}
