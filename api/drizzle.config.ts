import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for generating and managing SQLite migrations.
 *
 * The DATABASE_PATH env var controls where the SQLite file lives.
 * Defaults to ./data/cadence.db in development.
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/cadence.db",
  },
});
