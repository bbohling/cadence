import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Database connection — Cloudflare D1 edition.
 *
 * On Workers, the D1 binding (env.DB) is only available inside the
 * fetch/scheduled handlers, not at module scope. We keep the same
 * `import { db } from "../db/connection"` ergonomics the rest of the
 * codebase uses by initializing a module-level reference once per
 * isolate via initDb() — called at the top of every request
 * (middleware in index.ts) and at the start of scheduled() runs.
 *
 * The binding object is identical across requests within an isolate,
 * so init-once is safe.
 *
 * NOTE: D1 is async. All query call sites use `await` (the sync
 * bun:sqlite API was retired with the droplet deployment — see the
 * `main` branch for that version).
 */

export type Db = DrizzleD1Database<typeof schema>;

export let db: Db;

/** Initialize (once per isolate) the Drizzle D1 instance. */
export function initDb(d1: D1Database): Db {
  if (!db) {
    db = drizzle(d1, { schema });
  }
  return db;
}
