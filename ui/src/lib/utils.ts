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
