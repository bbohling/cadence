#!/usr/bin/env bun
/**
 * Backfill track-derived tables from a Strava account export.
 *
 *   bun scripts/backfill-tracks.ts <export-dir> [--athlete 144579] [--out data/tracks]
 *
 * <export-dir> is the unzipped archive (Strava → Settings → My Account →
 * Download or Delete Your Account → Request your archive). It holds
 * activities.csv plus activities/*.fit.gz|.gpx|.tcx.gz.
 *
 * Every ride is processed oldest-first through services/tracks/ (the same
 * code the Worker runs for new rides), climbs and routes are matched in
 * memory, and the result is written as SQL files that REBUILD the five
 * track tables for the athlete:
 *
 *   <out>/tracks-01.sql, tracks-02.sql, …   ≤ ROWS_PER_FILE rows each
 *
 * Apply them in order. Locally:
 *   for f in data/tracks/tracks-*.sql; do npx wrangler d1 execute cadence --local --file "$f"; done
 * Remote (prod D1 — the free tier allows 100k rows written/day, and index
 * updates count, so spread the files over more than one day if needed):
 *   npx wrangler d1 execute cadence --remote --file data/tracks/tracks-01.sql
 *
 * The first file deletes existing rows for the athlete, so re-running the
 * whole sequence is safe. Statements stay under ~90 KB (D1's limit is 100 KB).
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { readTrackFile } from "./lib/track-files";
import { processTrack } from "../src/services/tracks/process";
import { matchClimb, matchRoute, type CanonicalClimb, type RouteCluster } from "../src/services/tracks/match";
import { encodeTiles } from "../src/services/tracks/tiles";
import { haversineM } from "../src/services/tracks/geo";

const RIDE_TYPES = new Set(["Ride", "Virtual Ride"]);
const MAX_STATEMENT_BYTES = 90_000;
const ROWS_PER_FILE = 15_000;

// ── Args ───────────────────────────────────────────────

const args = process.argv.slice(2);
const exportDir = args.find((a) => !a.startsWith("--"));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!exportDir || !existsSync(join(exportDir, "activities.csv"))) {
  console.error("usage: bun scripts/backfill-tracks.ts <export-dir> [--athlete ID] [--out DIR]");
  process.exit(1);
}
const apiDir = resolve(import.meta.dir, "..");
const outDir = resolve(flag("out") ?? join(apiDir, "data", "tracks"));
const athleteId = Number(flag("athlete") ?? athleteFromLocalDb());

function athleteFromLocalDb(): number {
  const db = new Database(join(apiDir, "data", "cadence.db"), { readonly: true });
  const row = db.query("SELECT athlete_id FROM users WHERE athlete_id IS NOT NULL LIMIT 1").get() as
    | { athlete_id: number }
    | null;
  db.close();
  if (!row) throw new Error("No athlete in data/cadence.db; pass --athlete");
  return row.athlete_id;
}

// ── Read the activity list ─────────────────────────────

const csv = parseCsv(readFileSync(join(exportDir, "activities.csv"), "utf8"));
const header = csv[0]!;
const col = (name: string) => header.indexOf(name);
const [idCol, typeCol, fileCol] = [col("Activity ID"), col("Activity Type"), col("Filename")];

const rides = csv
  .slice(1)
  .filter((r) => RIDE_TYPES.has(r[typeCol]!) && r[fileCol])
  .map((r) => ({ id: Number(r[idCol]), virtual: r[typeCol] === "Virtual Ride", file: r[fileCol]! }));

console.log(`${rides.length} rides with files for athlete ${athleteId}`);

// ── Process ────────────────────────────────────────────

interface Processed {
  id: number;
  virtual: boolean;
  startTime: number;
  result: ReturnType<typeof processTrack> | null;
}

const processed: Processed[] = [];
let failed = 0;
const started = Date.now();
for (const [i, ride] of rides.entries()) {
  try {
    const track = readTrackFile(join(exportDir, ride.file));
    processed.push({
      id: ride.id,
      virtual: ride.virtual,
      startTime: track?.startTime ?? 0,
      result: track ? processTrack(track, { virtual: ride.virtual }) : null,
    });
  } catch (err) {
    failed++;
    console.warn(`  ! ${ride.id} (${ride.file}): ${err instanceof Error ? err.message : err}`);
  }
  if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${rides.length}`);
}
console.log(`processed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${failed} failed`);

// Oldest first: the first effort on a climb / ride of a route defines it
processed.sort((a, b) => a.startTime - b.startTime);

// ── Match + build rows ─────────────────────────────────

const now = new Date().toISOString();
const iso = (epochS: number) => new Date(epochS * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

const canonicalClimbs: Array<CanonicalClimb & { gainM: number; avgGrade: number }> = [];
const clusters: RouteCluster[] = [];
const rows: Record<string, unknown[][]> = {
  activity_tracks: [],
  power_bests: [],
  climbs: [],
  climb_efforts: [],
  route_clusters: [],
};

for (const p of processed) {
  const r = p.result;
  const startDate = p.startTime ? iso(p.startTime) : null;

  if (!r || (r.gpsPoints < 2 && r.powerBests.length === 0)) {
    rows.activity_tracks!.push([p.id, athleteId, "export", "no_data", startDate, 0, null, null, null, null, now]);
    continue;
  }

  let routeClusterId: number | null = null;
  if (!p.virtual && r.tilesZ16.length >= 5) {
    const match = matchRoute(r.tilesZ16, r.distanceM, clusters);
    if (match) {
      routeClusterId = match.id;
    } else {
      const cluster = { id: clusters.length + 1, tilesZ16: r.tilesZ16, distanceM: r.distanceM };
      clusters.push(cluster);
      rows.route_clusters!.push([cluster.id, athleteId, null, p.id, encodeTiles(r.tilesZ16), r.distanceM]);
      routeClusterId = cluster.id;
    }
  }

  rows.activity_tracks!.push([
    p.id, athleteId, "export", "ok", startDate, r.gpsPoints, r.distanceM,
    r.tilesZ14.length ? encodeTiles(r.tilesZ14) : null, r.detailPolyline, routeClusterId, now,
  ]);

  for (const b of r.powerBests) {
    rows.power_bests!.push([p.id, athleteId, b.durationS, b.watts, startDate]);
  }

  for (const c of r.climbs) {
    let climb = matchClimb(c, canonicalClimbs);
    if (!climb) {
      const created = {
        id: canonicalClimbs.length + 1,
        startLat: c.startLat, startLng: c.startLng, endLat: c.endLat, endLng: c.endLng,
        lengthM: c.lengthM, gainM: c.gainM, avgGrade: c.avgGrade,
      };
      canonicalClimbs.push(created);
      rows.climbs!.push([
        created.id, athleteId, null, round6(c.startLat), round6(c.startLng),
        round6(c.endLat), round6(c.endLng), c.lengthM, c.gainM, c.avgGrade,
      ]);
      climb = created;
    }
    rows.climb_efforts!.push([
      p.id, c.startOffsetS, climb.id, athleteId, iso(p.startTime + c.startOffsetS),
      c.elapsedS, c.avgWatts, c.avgHr,
    ]);
  }
}

// ── Climb names from Strava segments ───────────────────
// A detected climb has no name. Borrow one from a Strava segment the
// athlete has ridden that sits on it. Segments usually start/end inside a
// detected climb, so endpoints get slack proportional to climb length, and
// the best fit wins: score = length overlap ratio − endpoint offset / length.
// Read from the local copy of the database (data/cadence.db), since
// segment coordinates only live in raw_json.

const NAME_MIN_SLACK_M = 300;
const NAME_SLACK_FRACTION = 0.35;
const NAME_MIN_LENGTH_RATIO = 0.5;

interface Segment { name: string; startLat: number; startLng: number; endLat: number; endLng: number; lengthM: number; efforts: number }

function loadSegments(): Segment[] {
  const path = join(apiDir, "data", "cadence.db");
  if (!existsSync(path)) return [];
  const db = new Database(path, { readonly: true });
  const rows = db.query(`
    SELECT json_extract(raw_json, '$.segment.name') AS name,
           json_extract(raw_json, '$.segment.start_latlng') AS start,
           json_extract(raw_json, '$.segment.end_latlng') AS end,
           json_extract(raw_json, '$.segment.distance') AS length,
           COUNT(*) AS efforts
    FROM src_segment_efforts
    WHERE athlete_id = ?
    GROUP BY segment_id
  `).all(athleteId) as Array<{ name: string | null; start: string | null; end: string | null; length: number | null; efforts: number }>;
  db.close();
  return rows.flatMap((r) => {
    const s = r.start ? (JSON.parse(r.start) as number[]) : [];
    const e = r.end ? (JSON.parse(r.end) as number[]) : [];
    if (!r.name || s.length !== 2 || e.length !== 2 || !r.length) return [];
    return [{ name: r.name.trim(), startLat: s[0]!, startLng: s[1]!, endLat: e[0]!, endLng: e[1]!, lengthM: r.length, efforts: r.efforts }];
  });
}

const segments = loadSegments();
let named = 0;
for (const row of rows.climbs!) {
  const [, , , sLat, sLng, eLat, eLng, lengthM] = row as number[];
  const length = lengthM!;
  const slack = Math.max(NAME_MIN_SLACK_M, length * NAME_SLACK_FRACTION);
  let best: Segment | undefined;
  let bestScore = -Infinity;
  for (const seg of segments) {
    if (seg.efforts < 2) continue;
    const ratio = Math.min(seg.lengthM, length) / Math.max(seg.lengthM, length);
    if (ratio < NAME_MIN_LENGTH_RATIO) continue;
    const ds = haversineM(sLat!, sLng!, seg.startLat, seg.startLng);
    if (ds > slack) continue;
    const de = haversineM(eLat!, eLng!, seg.endLat, seg.endLng);
    if (de > slack) continue;
    const score = ratio - (ds + de) / length;
    if (score > bestScore || (score === bestScore && seg.efforts > (best?.efforts ?? 0))) {
      bestScore = score;
      best = seg;
    }
  }
  if (best) {
    row[2] = best.name;
    named++;
  }
}
console.log(`named ${named}/${rows.climbs!.length} climbs from ${segments.length} Strava segments`);

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

// ── Write SQL ──────────────────────────────────────────

const COLUMNS: Record<string, string[]> = {
  activity_tracks: ["activity_id", "athlete_id", "source", "status", "start_date", "gps_points", "distance_m", "tiles_z14", "detail_polyline", "route_cluster_id", "processed_at"],
  power_bests: ["activity_id", "athlete_id", "duration_s", "watts", "start_date"],
  climbs: ["id", "athlete_id", "name", "start_lat", "start_lng", "end_lat", "end_lng", "length_m", "gain_m", "avg_grade"],
  climb_efforts: ["activity_id", "start_offset_s", "climb_id", "athlete_id", "start_date", "elapsed_s", "avg_watts", "avg_hr"],
  route_clusters: ["id", "athlete_id", "name", "rep_activity_id", "tiles_z16", "distance_m"],
};

const statements: Array<{ sql: string; rows: number }> = [];
for (const table of Object.keys(COLUMNS)) {
  statements.push({ sql: `DELETE FROM ${table} WHERE athlete_id = ${athleteId};`, rows: 0 });
}
for (const [table, tableRows] of Object.entries(rows)) {
  const prefix = `INSERT INTO ${table} (${COLUMNS[table]!.join(", ")}) VALUES\n`;
  let batch: string[] = [];
  let bytes = prefix.length;
  const flush = () => {
    if (batch.length) statements.push({ sql: prefix + batch.join(",\n") + ";", rows: batch.length });
    batch = [];
    bytes = prefix.length;
  };
  for (const row of tableRows) {
    const values = `(${row.map(sqlValue).join(", ")})`;
    if (bytes + values.length + 2 > MAX_STATEMENT_BYTES) flush();
    batch.push(values);
    bytes += values.length + 2;
  }
  flush();
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const files: string[][] = [[]];
let fileRows = 0;
for (const s of statements) {
  if (fileRows + s.rows > ROWS_PER_FILE && files[files.length - 1]!.length) {
    files.push([]);
    fileRows = 0;
  }
  files[files.length - 1]!.push(s.sql);
  fileRows += s.rows;
}
for (const [i, sqls] of files.entries()) {
  writeFileSync(join(outDir, `tracks-${String(i + 1).padStart(2, "0")}.sql`), sqls.join("\n") + "\n");
}

console.log("\nrows:");
for (const [table, tableRows] of Object.entries(rows)) console.log(`  ${table.padEnd(16)} ${tableRows.length}`);
console.log(`\nwrote ${files.length} file(s) to ${outDir}`);

// ── CSV ────────────────────────────────────────────────

/** RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out;
}
