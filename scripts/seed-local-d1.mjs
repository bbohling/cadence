#!/usr/bin/env bun
/**
 * Seed the local D1 replica used by `wrangler dev`.
 *
 * `wrangler dev` starts against an EMPTY local D1 — the binding exists but has
 * no tables, so every data route 500s with "no such table: users" (surfaced by
 * Drizzle as "Failed query: select ... from users"). /health still returns 200
 * because it never touches the database, which makes the failure look stranger
 * than it is.
 *
 * This imports api/data/cadence-d1-dump.sql (the same dump used to populate
 * production) and then applies the migrations that postdate it. Takes about a
 * minute; you only run it once.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "api");
const dump = join(api, "data", "cadence-d1-dump.sql");

// Migrations created after the dump was taken. The dump is a point-in-time
// snapshot, so anything merged since has to be replayed on top of it.
const MIGRATIONS_AFTER_DUMP = [
  "drizzle/0002_useful_ultimo.sql",
  "drizzle/0003_normalize_legacy_timestamps.sql",
];

function d1(args, label) {
  process.stdout.write(`  ${label} ... `);
  const started = Date.now();
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "cadence", "--local", ...args],
    { cwd: api, encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.log("failed\n");
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

if (!existsSync(dump)) {
  console.error(`Dump not found: ${dump}

It is gitignored (api/.gitignore excludes data/), so a fresh clone won't have
it. Regenerate it from production with:

  cd api && npx wrangler d1 export cadence --remote --output data/cadence-d1-dump.sql
`);
  process.exit(1);
}

console.log("Seeding local D1 (cadence)\n");

// Wipe the replica first. The dump opens with bare CREATE TABLE statements, so
// importing over an existing replica fails on the first table. Only the local
// miniflare copy is touched — production D1 is never in reach of this script.
const state = join(api, ".wrangler", "state", "v3", "d1");
if (existsSync(state)) {
  process.stdout.write("  reset local replica ... ");
  rmSync(state, { recursive: true, force: true });
  console.log("ok");
}
rmSync(join(api, ".wrangler", ".seeded"), { force: true });

d1(["--file", "data/cadence-d1-dump.sql"], "import dump        ");
for (const m of MIGRATIONS_AFTER_DUMP) {
  d1(["--file", m], `apply ${m.replace("drizzle/", "").padEnd(14)}`);
}

// Marker so `bun run dev` can tell a seeded replica from an empty one without
// paying for a wrangler round-trip on every start. Lives inside .wrangler so
// deleting that directory correctly invalidates it.
mkdirSync(join(api, ".wrangler"), { recursive: true });
writeFileSync(join(api, ".wrangler", ".seeded"), new Date().toISOString());

console.log("\nDone. Run `bun run dev` from the repo root.");
