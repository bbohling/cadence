import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "./connection";

/**
 * Run all pending database migrations.
 *
 * Usage:
 *   bun src/db/migrate.ts
 *
 * This reads migration SQL files from ./drizzle and applies them
 * in order. Safe to run multiple times — already-applied migrations
 * are tracked and skipped.
 */
console.log("Running database migrations...");

migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations complete.");
