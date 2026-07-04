import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { config } from "../utils/config";

/**
 * Database connection singleton.
 *
 * Uses Bun's built-in SQLite driver (bun:sqlite) which is synchronous
 * and extremely fast. Drizzle wraps it to give us type-safe queries
 * with full TypeScript inference.
 *
 * WAL mode is enabled for better concurrent read performance,
 * which helps when the sync job runs while the API serves requests.
 */
const sqlite = new Database(config.databasePath, { create: true });

// Enable WAL mode for better read concurrency during writes
sqlite.exec("PRAGMA journal_mode = WAL");
// Improve write performance (OS handles sync)
sqlite.exec("PRAGMA synchronous = normal");
// Increase cache for faster reads
sqlite.exec("PRAGMA cache_size = -64000"); // 64MB
// Enable foreign keys
sqlite.exec("PRAGMA foreign_keys = ON");

/** Drizzle ORM instance — use this for all database queries */
export const db = drizzle(sqlite, { schema });

/** Direct access to the underlying bun:sqlite instance (for raw queries) */
export { sqlite };
