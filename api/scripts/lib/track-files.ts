/**
 * Parse Strava export files (FIT / GPX / TCX, optionally .gz) into a Track.
 *
 * Local-only (bun): uses node:zlib and @garmin/fitsdk, neither of which
 * belongs in the Worker. The Worker builds Tracks from Strava streams
 * instead (services/track-sync.ts).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Decoder, Stream } from "@garmin/fitsdk";
import type { Track } from "../../src/services/tracks/types";

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

export function readTrackFile(path: string): Track | null {
  let buf = readFileSync(path);
  const name = path.replace(/\.gz$/, "");
  if (path.endsWith(".gz")) buf = gunzipSync(buf);

  if (name.endsWith(".fit")) return parseFit(buf);
  // Strava's TCX exports start with whitespace before <?xml; trim before parsing
  const text = buf.toString("utf8").trimStart();
  if (name.endsWith(".gpx")) return parseGpx(text);
  if (name.endsWith(".tcx")) return parseTcx(text);
  return null;
}

// ── FIT ────────────────────────────────────────────────

interface FitRecord {
  timestamp?: Date;
  positionLat?: number;
  positionLong?: number;
  enhancedAltitude?: number;
  altitude?: number;
  power?: number;
  heartRate?: number;
}

function parseFit(buf: Buffer): Track | null {
  const stream = Stream.fromBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read({ mergeHeartRates: true });
  const records = (messages.recordMesgs ?? []) as FitRecord[];
  return build(
    records
      .filter((r) => r.timestamp instanceof Date)
      .map((r) => ({
        time: r.timestamp!.getTime() / 1000,
        lat: r.positionLat !== undefined ? r.positionLat * SEMICIRCLE_TO_DEG : NaN,
        lng: r.positionLong !== undefined ? r.positionLong * SEMICIRCLE_TO_DEG : NaN,
        ele: r.enhancedAltitude ?? r.altitude ?? NaN,
        watts: r.power ?? NaN,
        hr: r.heartRate ?? NaN,
      }))
  );
}

// ── GPX / TCX ──────────────────────────────────────────
// Regex scanning instead of a DOM parser: these files are machine-written,
// flat, and up to tens of MB; a full XML DOM is slow and adds a dependency.

function parseGpx(xml: string): Track | null {
  const points: Sample[] = [];
  for (const m of xml.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)) {
    const attrs = m[1]!;
    const body = m[2]!;
    const time = tag(body, "time");
    if (!time) continue;
    points.push({
      time: Date.parse(time) / 1000,
      lat: num(/lat="([^"]+)"/.exec(attrs)?.[1]),
      lng: num(/lon="([^"]+)"/.exec(attrs)?.[1]),
      ele: num(tag(body, "ele")),
      watts: num(tag(body, "power") ?? tag(body, "gpxtpx:power")),
      hr: num(tag(body, "gpxtpx:hr") ?? tag(body, "hr")),
    });
  }
  return build(points);
}

function parseTcx(xml: string): Track | null {
  const points: Sample[] = [];
  for (const m of xml.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) {
    const body = m[1]!;
    const time = tag(body, "Time");
    if (!time) continue;
    points.push({
      time: Date.parse(time) / 1000,
      lat: num(tag(body, "LatitudeDegrees")),
      lng: num(tag(body, "LongitudeDegrees")),
      ele: num(tag(body, "AltitudeMeters")),
      watts: num(tag(body, "Watts") ?? tag(body, "ns3:Watts")),
      hr: num(/<HeartRateBpm[^>]*>\s*<Value>([^<]+)<\/Value>/.exec(body)?.[1]),
    });
  }
  return build(points);
}

function tag(body: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1];
}

function num(s: string | undefined): number {
  if (s === undefined) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ── Shared ─────────────────────────────────────────────

interface Sample {
  time: number;
  lat: number;
  lng: number;
  ele: number;
  watts: number;
  hr: number;
}

function build(samples: Sample[]): Track | null {
  const valid = samples.filter((s) => Number.isFinite(s.time)).sort((a, b) => a.time - b.time);
  if (valid.length < 2) return null;
  const startTime = valid[0]!.time;
  return {
    startTime,
    t: valid.map((s) => s.time - startTime),
    lat: valid.map((s) => s.lat),
    lng: valid.map((s) => s.lng),
    ele: valid.map((s) => s.ele),
    watts: valid.map((s) => s.watts),
    hr: valid.map((s) => s.hr),
  };
}
