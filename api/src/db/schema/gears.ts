import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * gears — Normalized gear data in American English units.
 *
 * Populated by the normalization job from `src_gears`.
 * Distance is converted from meters → miles.
 */
export const gears = sqliteTable(
  "gears",
  {
    /** Strava gear ID (e.g., "b12345678") */
    id: text("id").primaryKey(),
    athleteId: integer("athlete_id").notNull(),

    name: text("name"),
    primaryGear: integer("primary_gear"),
    /** Total distance in miles */
    distance: real("distance"),
    brandName: text("brand_name"),
    modelName: text("model_name"),
    frameType: integer("frame_type"),
    description: text("description"),
    resourceState: integer("resource_state"),

    normalizedAt: text("normalized_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_gears_athlete").on(table.athleteId)]
);

export type Gear = typeof gears.$inferSelect;
export type NewGear = typeof gears.$inferInsert;
