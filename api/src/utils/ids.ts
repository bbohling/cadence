import { nanoid } from "nanoid";

/**
 * Generate a unique ID for database rows.
 *
 * Uses nanoid which produces URL-safe, compact IDs.
 * 21 characters gives ~150 years of unique IDs at 1000 IDs/second.
 */
export function generateId(): string {
  return nanoid();
}

/** Get the current time as an ISO 8601 string */
export function now(): string {
  return new Date().toISOString();
}
