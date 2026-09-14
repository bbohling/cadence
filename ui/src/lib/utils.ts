import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx.
 *
 * Combines multiple class strings/objects and resolves
 * Tailwind conflicts (e.g., `p-2 p-4` → `p-4`).
 *
 * USAGE:
 *   cn("p-4", isActive && "bg-blue-500", "text-white")
 *   // → "p-4 bg-blue-500 text-white"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with commas.
 * @example formatNumber(12345.67) → "12,345.67"
 */
export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format seconds into a human-readable duration.
 * @example formatDuration(3661) → "1h 1m"
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Parse Strava's start_date_local as wall-clock time.
 *
 * Strava suffixes it with "Z" even though it is the athlete's local time,
 * so strip the zone and let the browser treat it as local.
 */
export function parseLocalDate(startDateLocal: string): Date {
  return new Date(startDateLocal.replace(/Z$/, ""));
}

/**
 * Relative day label for a ride date.
 * @example formatRideDay(today) → "Today", formatRideDay(lastWeek) → "Sat, Sep 6"
 */
export function formatRideDay(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * Format seconds into HH:MM:SS.
 * @example formatTime(3661) → "1:01:01"
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
