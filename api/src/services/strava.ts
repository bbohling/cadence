import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users, rateLimitLogs } from "../db/schema";
import { config } from "../utils/config";
import { log } from "../utils/logger";
import { generateId, now } from "../utils/ids";
import type { User } from "../db/schema";

/**
 * Strava API client service.
 *
 * Handles OAuth token refresh, rate limit tracking, and provides
 * typed methods for each Strava endpoint we use. All methods return
 * raw Strava JSON — transformation happens in the sync/normalization
 * layers.
 *
 * RATE LIMITING:
 * Strava enforces two tiers of limits:
 *   - 15-minute window: 100 requests (read), 200 overall
 *   - Daily: 1,000 requests (read), 2,000 overall
 * We track usage from response headers and add progressive delays
 * to avoid hitting limits.
 */

// ── Types ──────────────────────────────────────────────

/** Rate limit state parsed from Strava response headers */
interface RateLimitInfo {
  readUsage15min: number;
  readLimit15min: number;
  readUsageDaily: number;
  readLimitDaily: number;
  overallUsage15min: number;
  overallLimit15min: number;
  overallUsageDaily: number;
  overallLimitDaily: number;
}

/** Strava API error shape */
interface StravaError {
  message: string;
  errors?: Array<{ resource: string; field: string; code: string }>;
}

// ── Token Management ───────────────────────────────────

/**
 * Ensures the user has a valid (non-expired) access token.
 *
 * Strava access tokens expire after 6 hours. This function checks
 * the expiration time and automatically refreshes if needed, saving
 * the new tokens back to the database.
 */
export async function ensureValidToken(user: User): Promise<string> {
  const nowSecs = Math.floor(Date.now() / 1000);

  // Token is still valid (with 5-minute buffer)
  if (user.expiresAt && user.expiresAt > nowSecs + 300 && user.accessToken) {
    return user.accessToken;
  }

  log.info("Refreshing Strava access token", { user: user.name });

  const response = await fetch(config.strava.oauthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as StravaError;
    throw new Error(`Token refresh failed: ${error.message}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  // Save the new tokens to the database
  await db.update(users)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      updatedAt: now(),
    })
    .where(eq(users.id, user.id))
    .run();

  log.info("Token refreshed successfully", { expiresAt: data.expires_at });
  return data.access_token;
}

// ── Rate Limit Tracking ────────────────────────────────

/**
 * Parses rate limit info from Strava response headers.
 *
 * Strava sends limits in this format:
 *   X-RateLimit-Limit: 600,30000     (15min, daily)
 *   X-RateLimit-Usage: 50,1200       (15min, daily)
 *   X-ReadRateLimit-Limit: 300,3000
 *   X-ReadRateLimit-Usage: 25,600
 */
function parseRateLimits(headers: Headers): RateLimitInfo {
  const parse = (header: string): [number, number] => {
    const val = headers.get(header);
    if (!val) return [0, 0];
    const parts = val.split(",").map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0];
  };

  const [overallLimit15min, overallLimitDaily] = parse("x-ratelimit-limit");
  const [overallUsage15min, overallUsageDaily] = parse("x-ratelimit-usage");
  const [readLimit15min, readLimitDaily] = parse("x-readratelimit-limit");
  const [readUsage15min, readUsageDaily] = parse("x-readratelimit-usage");

  return {
    readUsage15min,
    readLimit15min: readLimit15min || config.rateLimits.read15min,
    readUsageDaily,
    readLimitDaily: readLimitDaily || config.rateLimits.readDaily,
    overallUsage15min,
    overallLimit15min: overallLimit15min || config.rateLimits.overall15min,
    overallUsageDaily,
    overallLimitDaily: overallLimitDaily || config.rateLimits.overallDaily,
  };
}

/**
 * Calculates how much of the rate limit we've used (0 to 1).
 * Returns the highest utilization across all limit tiers.
 */
function getUtilization(limits: RateLimitInfo): number {
  const ratios = [
    limits.readUsage15min / limits.readLimit15min,
    limits.readUsageDaily / limits.readLimitDaily,
    limits.overallUsage15min / limits.overallLimit15min,
    limits.overallUsageDaily / limits.overallLimitDaily,
  ];
  return Math.max(...ratios);
}

/**
 * Calculates a progressive delay based on rate limit utilization.
 * Higher utilization = longer delay to avoid hitting limits.
 */
function calculateDelay(utilization: number): number {
  if (utilization < 0.5) return 0;
  if (utilization < 0.7) return 1000;
  if (utilization < 0.8) return 3000;
  if (utilization < 0.9) return 5000;
  return 10000;
}

/**
 * Logs rate limit data to the database for monitoring.
 */
async function logRateLimits(
  endpoint: string,
  limits: RateLimitInfo,
  delayMs: number,
  wasLimited: boolean
): Promise<void> {
  const utilization = getUtilization(limits);
  await db.insert(rateLimitLogs)
    .values({
      id: generateId(),
      timestamp: now(),
      endpoint,
      overallUsage15min: limits.overallUsage15min,
      overallUsageDaily: limits.overallUsageDaily,
      readUsage15min: limits.readUsage15min,
      readUsageDaily: limits.readUsageDaily,
      maxUtilizationPct: Math.round(utilization * 10000) / 100,
      delayAppliedMs: delayMs,
      wasRateLimited: wasLimited ? 1 : 0,
      retryAfterMs: null,
      createdAt: now(),
    })
    .run();
}

// ── API Client ─────────────────────────────────────────

/**
 * Makes an authenticated request to the Strava API.
 *
 * Handles:
 * 1. Rate limit tracking and progressive delays
 * 2. 429 (rate limited) responses with exponential backoff
 * 3. Error responses with descriptive messages
 *
 * Returns the parsed JSON response.
 */
export async function stravaFetch<T>(
  token: string,
  endpoint: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${config.strava.apiBaseUrl}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Parse rate limits from every response
    const limits = parseRateLimits(response.headers);
    const utilization = getUtilization(limits);
    const delay = calculateDelay(utilization);

    if (response.status === 429) {
      // Rate limited — back off and retry
      const retryAfter = parseInt(response.headers.get("retry-after") ?? "60", 10);
      const waitMs = retryAfter * 1000 * (retries + 1);

      logRateLimits(endpoint, limits, waitMs, true);
      log.warn("Rate limited by Strava, backing off", {
        endpoint,
        retryAfter,
        attempt: retries + 1,
      });

      await sleep(waitMs);
      retries++;
      continue;
    }

    // Log rate limit data
    logRateLimits(endpoint, limits, delay, false);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Strava API error ${response.status} on ${endpoint}: ${errorBody}`
      );
    }

    // Apply progressive delay if we're getting close to limits
    if (delay > 0) {
      log.debug("Applying rate limit delay", { endpoint, delay, utilization });
      await sleep(delay);
    }

    return (await response.json()) as T;
  }

  throw new Error(`Strava API: max retries exceeded for ${endpoint}`);
}

// ── Strava API Methods ─────────────────────────────────

/** Raw Strava activity from the list endpoint (summary) */
export interface StravaActivitySummary {
  id: number;
  athlete: { id: number };
  name: string;
  type: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  timezone: string;
  gear_id: string | null;
  average_speed: number;
  max_speed: number;
  achievement_count: number;
  pr_count: number;
  trainer: boolean;
  commute: boolean;
  [key: string]: unknown; // Strava may add fields at any time
}

/** Raw Strava detailed activity (includes segment_efforts) */
export interface StravaDetailedActivity extends StravaActivitySummary {
  calories: number;
  description: string | null;
  segment_efforts: StravaSegmentEffort[];
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
  average_temp?: number;
  elev_high?: number;
  elev_low?: number;
  map?: { summary_polyline?: string };
  gear?: StravaGear;
}

/** Raw Strava segment effort */
export interface StravaSegmentEffort {
  id: number;
  activity: { id: number };
  athlete: { id: number };
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
    climb_category: number;
    city: string;
    state: string;
    [key: string]: unknown;
  };
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  average_cadence?: number;
  average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  device_watts?: boolean;
  pr_rank: number | null;
  kom_rank: number | null;
  achievements: Array<{ type_id: number; type: string; rank: number }>;
  [key: string]: unknown;
}

/** Raw Strava gear */
export interface StravaGear {
  id: string;
  primary: boolean;
  name: string;
  distance: number;
  brand_name?: string;
  model_name?: string;
  frame_type?: number;
  description?: string;
  resource_state?: number;
}

/**
 * Fetch a page of activity summaries.
 *
 * @param after - Unix timestamp; only return activities after this time
 * @param page  - Page number (1-indexed)
 */
export async function getActivities(
  token: string,
  options: { after?: number; page?: number; perPage?: number } = {}
): Promise<StravaActivitySummary[]> {
  const params: Record<string, string | number> = {
    per_page: options.perPage ?? 200,
    page: options.page ?? 1,
  };
  if (options.after) params.after = options.after;

  return stravaFetch<StravaActivitySummary[]>(
    token,
    "/athlete/activities",
    params
  );
}

/**
 * Fetch full details for a single activity (includes segment efforts).
 */
export async function getActivityDetail(
  token: string,
  activityId: number
): Promise<StravaDetailedActivity> {
  return stravaFetch<StravaDetailedActivity>(
    token,
    `/activities/${activityId}`,
    { include_all_efforts: "true" }
  );
}

/**
 * Fetch the authenticated athlete's profile.
 */
export async function getAthlete(
  token: string
): Promise<{ id: number; bikes: StravaGear[]; shoes: StravaGear[] }> {
  return stravaFetch(token, "/athlete");
}

/**
 * Fetch all KOMs for an athlete (paginated).
 */
export async function getAthleteKoms(
  token: string,
  athleteId: number,
  page = 1,
  perPage = 200
): Promise<StravaSegmentEffort[]> {
  return stravaFetch<StravaSegmentEffort[]>(
    token,
    `/athletes/${athleteId}/koms`,
    { page, per_page: perPage }
  );
}

/**
 * Fetch the authenticated athlete's efforts on a specific segment.
 *
 * NOTE: The `kom_rank` values returned are STALE (frozen at recording
 * time). Use getSegmentLeaderboard() instead for current rankings.
 */
export async function getSegmentEfforts(
  token: string,
  segmentId: number,
  perPage = 200
): Promise<StravaSegmentEffort[]> {
  return stravaFetch<StravaSegmentEffort[]>(
    token,
    "/segment_efforts",
    { segment_id: segmentId, per_page: perPage }
  );
}

/**
 * Segment leaderboard response from Strava.
 *
 * The `athlete_entries` array contains the authenticated athlete's
 * position on the leaderboard — this is the CURRENT rank.
 */
export interface SegmentLeaderboard {
  effort_count: number;
  entry_count: number;
  entries: SegmentLeaderboardEntry[];
}

export interface SegmentLeaderboardEntry {
  athlete_name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  rank: number;
  effort_id: number;
  athlete_id: number;
}

/**
 * Fetch the leaderboard for a segment.
 *
 * Returns entries with CURRENT `rank` values — the actual live
 * leaderboard position. This is the reliable way to get an athlete's
 * current standing on a segment.
 *
 * Use `context_entries` to control how many entries around the athlete
 * are returned (reduces response size when you only need the rank).
 */
export async function getSegmentLeaderboard(
  token: string,
  segmentId: number,
  perPage = 10
): Promise<SegmentLeaderboard> {
  return stravaFetch<SegmentLeaderboard>(
    token,
    `/segments/${segmentId}/leaderboard`,
    { per_page: perPage, context_entries: 0 }
  );
}

// ── Helpers ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
