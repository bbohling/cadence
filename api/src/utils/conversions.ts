/**
 * Unit conversion functions — metric → American English.
 *
 * All Strava data arrives in metric. These pure functions convert
 * values for the normalized tables. Each function handles null/undefined
 * gracefully by returning null, making them safe to use directly on
 * potentially missing API fields.
 *
 * CONVERSION REFERENCE:
 * ─────────────────────
 *   meters  → miles:       ÷ 1609.344
 *   meters  → feet:        × 3.28084
 *   m/s     → mph:         × 2.23694
 *   celsius → fahrenheit:  × 9/5 + 32
 */

/**
 * Converts meters to miles.
 * @example metersToMiles(1609.344) // → 1.0
 */
export function metersToMiles(meters: number | null | undefined): number | null {
  if (meters == null) return null;
  return Math.round((meters / 1609.344) * 100) / 100;
}

/**
 * Converts meters to feet.
 * @example metersToFeet(100) // → 328.08
 */
export function metersToFeet(meters: number | null | undefined): number | null {
  if (meters == null) return null;
  return Math.round(meters * 3.28084 * 100) / 100;
}

/**
 * Converts meters per second to miles per hour.
 * @example mpsToMph(10) // → 22.37
 */
export function mpsToMph(mps: number | null | undefined): number | null {
  if (mps == null) return null;
  return Math.round(mps * 2.23694 * 100) / 100;
}

/**
 * Converts Celsius to Fahrenheit.
 * @example celsiusToFahrenheit(0) // → 32
 */
export function celsiusToFahrenheit(celsius: number | null | undefined): number | null {
  if (celsius == null) return null;
  return Math.round((celsius * 9) / 5 + 32);
}

/**
 * Rounds a number to the specified decimal places.
 * Returns null if the input is null/undefined.
 */
export function round(value: number | null | undefined, decimals = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Formats seconds into a human-readable string.
 * @example formatDuration(3661) // → "1h 1m 1s"
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}
