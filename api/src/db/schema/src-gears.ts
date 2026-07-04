import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * src_gears — Raw gear data from Strava (metric units).
 *
 * Gear = bikes, shoes, or other equipment linked to a Strava account.
 * Distance is stored in meters (Strava's native unit).
 */
export const srcGears = sqliteTable(
  "src_gears",
  {
    /** Strava gear ID (e.g., "b12345678") */
    id: text("id").primaryKey(),

    /** Strava athlete ID */
    athleteId: integer("athlete_id").notNull(),

    /** Complete gear JSON from the API */
    rawJson: text("raw_json").notNull(),

    name: text("name"),
    /** Whether this is the athlete's primary gear */
    primaryGear: integer("primary_gear"),
    /** Total distance in meters */
    distance: real("distance"),
    brandName: text("brand_name"),
    modelName: text("model_name"),
    frameType: integer("frame_type"),
    description: text("description"),
    resourceState: integer("resource_state"),

    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_src_gears_athlete").on(table.athleteId)]
);

export type SrcGear = typeof srcGears.$inferSelect;
export type NewSrcGear = typeof srcGears.$inferInsert;
