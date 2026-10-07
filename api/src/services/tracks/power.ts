import type { PowerBest } from "./types";

/**
 * Mean-maximal power: the best average power held for each duration.
 *
 * Samples are resampled onto a 1 Hz grid. A sample's value fills forward
 * for up to MAX_FILL_S seconds (covers 1 s / smart recording jitter);
 * longer gaps — auto-pause, stops — count as 0 W, the conservative
 * choice Strava and Golden Cheetah also make.
 */

export const POWER_DURATIONS_S = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600] as const;

const MAX_FILL_S = 5;
/**
 * Samples above this are power-meter glitches, not efforts: dropouts and
 * calibration faults read as ~2500 W (Strava's own cap) for a few seconds.
 * They're dropped, not clamped, so they can't fill a 5 s or 60 s window.
 */
const MAX_VALID_W = 1800;
/**
 * A faulty or uncalibrated meter reads high for the whole ride rather than
 * spiking. Real sprints are well under 1% of a ride's samples above 1000 W;
 * past this share, the ride's power is discarded entirely.
 */
const GLITCH_W = 1000;
const MAX_GLITCH_SHARE = 0.03;

export function powerBests(t: number[], watts: number[]): PowerBest[] {
  if (looksFaulty(watts)) return [];
  const grid = resample1Hz(t, watts);
  if (!grid) return [];

  // Prefix sums make every window O(1)
  const prefix = new Float64Array(grid.length + 1);
  for (let i = 0; i < grid.length; i++) prefix[i + 1] = prefix[i]! + grid[i]!;

  const bests: PowerBest[] = [];
  for (const d of POWER_DURATIONS_S) {
    if (d > grid.length) break;
    let best = 0;
    for (let end = d; end <= grid.length; end++) {
      const sum = prefix[end]! - prefix[end - d]!;
      if (sum > best) best = sum;
    }
    if (best > 0) bests.push({ durationS: d, watts: Math.round(best / d) });
  }
  return bests;
}

function looksFaulty(watts: number[]): boolean {
  let pedaling = 0;
  let high = 0;
  for (const w of watts) {
    if (!(w > 0)) continue;
    pedaling++;
    if (w > GLITCH_W) high++;
  }
  return pedaling > 0 && high / pedaling > MAX_GLITCH_SHARE;
}

function resample1Hz(t: number[], watts: number[]): Float64Array | null {
  let last = -1;
  for (let i = 0; i < t.length; i++) if (Number.isFinite(watts[i])) last = i;
  if (last < 0) return null;

  const length = Math.floor(t[last]!) + 1;
  // Guard against corrupt timestamps producing absurd arrays (> 24 h)
  if (length <= 0 || length > 86_400) return null;

  const grid = new Float64Array(length);
  for (let i = 0; i < t.length; i++) {
    const w = watts[i]!;
    if (!Number.isFinite(w) || w <= 0 || w > MAX_VALID_W) continue;
    const start = Math.floor(t[i]!);
    const next = i + 1 < t.length ? Math.floor(t[i + 1]!) : start + 1;
    const end = Math.min(length, start + Math.min(Math.max(1, next - start), MAX_FILL_S));
    for (let s = Math.max(0, start); s < end; s++) grid[s] = w;
  }
  return grid;
}
