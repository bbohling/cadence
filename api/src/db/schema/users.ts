import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Users table — stores Strava OAuth credentials and sync metadata.
 *
 * Currently single-user ("brandon"), but the schema supports multiple
 * users if that's ever needed. The athleteId comes from Strava's API
 * and uniquely identifies the athlete on their platform.
 */
export const users = sqliteTable("users", {
  /** UUID primary key */
  id: text("id").primaryKey(),

  /** Human-readable username (e.g., "brandon") */
  name: text("name").notNull().unique(),

  /** Strava's unique athlete identifier */
  athleteId: integer("athlete_id").unique(),

  /** OAuth access token — short-lived, auto-refreshed */
  accessToken: text("access_token"),

  /** OAuth refresh token — used to get new access tokens */
  refreshToken: text("refresh_token"),

  /** Unix timestamp (seconds) when the access token expires */
  expiresAt: integer("expires_at"),

  /** ISO 8601 timestamp of the last successful data sync */
  lastSyncAt: text("last_sync_at"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** TypeScript type for a full user row */
export type User = typeof users.$inferSelect;

/** TypeScript type for inserting a new user */
export type NewUser = typeof users.$inferInsert;
