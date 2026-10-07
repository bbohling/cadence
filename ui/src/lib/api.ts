/**
 * API client for the Cadence backend.
 *
 * In development, requests are proxied by Vite (see vite.config.ts).
 * In production, set VITE_API_URL to the backend's URL.
 *
 * All functions return typed data — no `any` types escape this module.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Typed fetch wrapper.
 *
 * Automatically prepends the API base URL, parses JSON responses,
 * and throws descriptive errors for non-200 responses.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

// ── Types (matching API response shapes) ───────────────

export interface YearlyStats {
  year: number;
  totalRides: number;
  totalDistance: number;
  totalElevation: number;
  totalCalories: number;
  totalMovingTime: number;
  avgSpeed: number;
  avgDistance: number;
  avgHeartrate: number | null;
  avgWatts: number | null;
}

export interface YearProgress {
  year: number;
  throughDate: string;
  rides: number;
  distance: number;
  elevation: number;
  calories: number;
  movingTime: number;
}

export interface GearUsage {
  id: string;
  name: string;
  brandName: string | null;
  modelName: string | null;
  totalDistance: number;
  totalRides: number;
  totalElevation: number;
  totalMovingTime: number;
  isPrimary: boolean;
}

export interface ActivityTypeBreakdown {
  type: string;
  count: number;
  totalDistance: number;
  totalMovingTime: number;
  totalElevation: number;
}

export interface KomAchievement {
  id: number;
  activityId: number;
  activityName: string | null;
  segmentName: string;
  komRank: number;
  prRank: number | null;
  elapsedTime: number;
  distance: number | null;
  startDate: string;
  segmentAverageGrade: number | null;
  segmentCity: string | null;
  segmentState: string | null;
}

export interface KomStats {
  total: number;
  byRank: Record<string, number>;
  top5: number;
  top10: number;
}

export interface CurrentKomStats extends KomStats {
  lastChecked: string | null;
}

export interface CurrentKomAchievement {
  segmentId: number;
  segmentName: string | null;
  currentRank: number;
  previousRank: number | null;
  elapsedTime: number | null;
  distance: number | null;
  averageGrade: number | null;
  city: string | null;
  state: string | null;
  checkedAt: string;
}

export interface KomPrTimelineEntry {
  month: string;
  koms: number;
  prs: number;
}

export interface InfographicStats {
  year: number;
  athleteName: string;
  totalDistance: number;
  totalElevation: number;
  totalMovingTime: number;
  totalRides: number;
  totalCalories: number;
  avgSpeed: number;
  maxRideDistance: number;
  maxRideElevation: number;
  maxRideTime: number;
  maxRideAvgSpeed: number;
  activeDays: number;
  maxStreak: number;
  newKoms: number;
  everestMultiplier: number;
  activeDates: string[];
  rides: Array<{
    date: string;
    distance: number;
    elevation: number;
  }>;
}

export interface RecentRide {
  id: number;
  name: string | null;
  type: string;
  /** Wall-clock time at the ride. Strava appends "Z" but it is NOT UTC. */
  startDateLocal: string;
  distance: number;
  movingTime: number;
  elevation: number;
  avgSpeed: number | null;
  avgHeartrate: number | null;
  avgWatts: number | null;
  calories: number | null;
  achievementCount: number;
  prCount: number;
  komCount: number;
  trainer: boolean;
}

export interface RideDetail extends RecentRide {
  maxSpeed: number | null;
  maxWatts: number | null;
  weightedAvgWatts: number | null;
  maxHeartrate: number | null;
  avgCadence: number | null;
  avgTemp: number | null;
  elevHigh: number | null;
  elevLow: number | null;
  /** Google-encoded polyline at Strava summary resolution; null for indoor rides */
  polyline: string | null;
}

export interface RidePolyline {
  id: number;
  name: string | null;
  startDateLocal: string;
  distance: number;
  elevation: number;
  /** Google-encoded polyline */
  polyline: string;
}

export interface EnsureFreshResponse {
  fresh: boolean;
  syncing?: boolean;
  syncFailed?: boolean;
  error?: string;
  lastSyncAt?: string;
}

// ── Track-derived (tiles, power, climbs, routes) ───────

export interface ExplorerTiles {
  tiles: number;
  maxSquare: number;
  /** Top-left [x, y] of the max square, z14 */
  maxSquareOrigin: [number, number] | null;
  maxCluster: number;
  newThisYear: number;
  year: number;
  /** [x, y, firstVisitYear] per visited z14 tile */
  visited: Array<[number, number, number]>;
}

export interface PowerCurvePoint {
  durationS: number;
  watts: number;
  activityId: number;
  startDate: string;
}

export interface PowerCurve {
  durations: number[];
  allTime: PowerCurvePoint[];
  /** Newest first */
  years: Array<{ year: number; points: PowerCurvePoint[] }>;
}

export interface ClimbSummary {
  id: number;
  name: string | null;
  /** Miles */
  length: number;
  /** Feet */
  gain: number;
  avgGrade: number;
  efforts: number;
  bestElapsedS: number;
  bestDate: string;
  bestActivityId: number;
  lastDate: string;
  /** [lat, lng] */
  start: [number, number];
  end: [number, number];
}

export interface ClimbEffort {
  activityId: number;
  activityName: string | null;
  startDate: string;
  elapsedS: number;
  avgWatts: number | null;
  avgHr: number | null;
  /** 1 = fastest */
  rank: number;
}

export interface ClimbDetail {
  climb: Pick<ClimbSummary, "id" | "name" | "length" | "gain" | "avgGrade" | "start" | "end">;
  /** Chronological */
  efforts: ClimbEffort[];
}

export interface RouteSummary {
  id: number;
  name: string | null;
  /** Miles */
  distance: number;
  rides: number;
  firstDate: string;
  lastDate: string;
  /** Fastest average speed of any ride on the route, mph */
  bestSpeed: number | null;
  /** Encoded polyline of the representative ride */
  polyline: string | null;
}

export interface RouteRide {
  activityId: number;
  name: string | null;
  startDate: string;
  avgSpeed: number | null;
  avgWatts: number | null;
  avgHeartrate: number | null;
  movingTime: number | null;
}

export interface RideTrackExtras {
  /** Higher-resolution polyline than the Strava summary; null until processed */
  detailPolyline: string | null;
  climbs: Array<{
    climbId: number;
    name: string | null;
    length: number;
    avgGrade: number;
    elapsedS: number;
    avgWatts: number | null;
    rank: number;
    efforts: number;
  }>;
  powerBests: Array<{ durationS: number; watts: number; allTimeBest: number }>;
}

// ── API Functions ──────────────────────────────────────

/** Fetch yearly cycling statistics */
export function fetchYearlyStats(userId: string): Promise<YearlyStats[]> {
  return apiFetch(`/v1/reports/cycling/yearly/${userId}`);
}

/** Fetch year-over-year progress comparison */
export function fetchYearOverYear(userId: string): Promise<YearProgress[]> {
  return apiFetch(`/v1/reports/year-over-year/${userId}`);
}

/** Fetch cycling progress for current year */
export function fetchCyclingProgress(userId: string): Promise<YearProgress[]> {
  return apiFetch(`/v1/reports/cycling/progress/${userId}`);
}

/** Fetch gear usage statistics */
export function fetchGearUsage(userId: string): Promise<GearUsage[]> {
  return apiFetch(`/v1/reports/gear-usage/${userId}`);
}

/** Fetch activity type breakdown */
export function fetchActivityTypes(userId: string): Promise<ActivityTypeBreakdown[]> {
  return apiFetch(`/v1/reports/activity-type/${userId}`);
}

/** Fetch the most recent rides, newest first */
export function fetchRecentRides(userId: string, limit = 5): Promise<RecentRide[]> {
  return apiFetch(`/v1/reports/recent-rides/${userId}?limit=${limit}`);
}

/** Fetch one ride for the detail page */
export function fetchRide(userId: string, id: number): Promise<RideDetail> {
  return apiFetch(`/v1/reports/ride/${userId}/${id}`);
}

/** Fetch outdoor ride maps, oldest first; all years when `year` is omitted */
export function fetchRidePolylines(userId: string, year?: number): Promise<RidePolyline[]> {
  return apiFetch(`/v1/reports/polylines/${userId}${year ? `?year=${year}` : ""}`);
}

/** Fetch KOM/PR achievement timeline */
export function fetchKomPrTimeline(userId: string): Promise<KomPrTimelineEntry[]> {
  return apiFetch(`/v1/reports/kom-pr-achievements/${userId}`);
}

/** Fetch paginated KOM achievements */
export function fetchKoms(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ data: KomAchievement[]; total: number }> {
  return apiFetch(`/v1/koms/${userId}?limit=${limit}&offset=${offset}`);
}

/** Fetch KOM stats (historic — rank at time of sync) */
export function fetchKomStats(userId: string): Promise<KomStats> {
  return apiFetch(`/v1/koms/${userId}/stats`);
}

/** Fetch current KOM stats (live — refreshed daily from Strava) */
export function fetchCurrentKomStats(userId: string): Promise<CurrentKomStats> {
  return apiFetch(`/v1/koms/${userId}/current/stats`);
}

/** Fetch current ranked segments (paginated) */
export function fetchCurrentKoms(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ data: CurrentKomAchievement[]; total: number }> {
  return apiFetch(`/v1/koms/${userId}/current?limit=${limit}&offset=${offset}`);
}

/** Trigger a background KOM refresh from Strava (returns 202) */
export function triggerKomRefresh(userId: string): Promise<{ success: boolean }> {
  return apiFetch(`/v1/koms/${userId}/current/refresh`, { method: "POST" });
}

/** Poll KOM refresh status */
export function fetchKomRefreshStatus(
  userId: string
): Promise<{ running: boolean; userId?: string; startedAt?: string }> {
  return apiFetch(`/v1/koms/${userId}/current/refresh/status`);
}

/** Fetch infographic stats for a specific year */
export function fetchInfographicStats(
  userId: string,
  year: number
): Promise<InfographicStats> {
  return apiFetch(`/v1/reports/infographic/${userId}/${year}`);
}

/** Fetch available years for infographic */
export function fetchInfographicYears(userId: string): Promise<number[]> {
  return apiFetch(`/v1/reports/infographic/${userId}/years`);
}

/** Check data freshness / trigger background sync */
export function fetchEnsureFresh(userId: string): Promise<EnsureFreshResponse> {
  return apiFetch(`/v1/ensure-fresh/${userId}`);
}

/** Trigger a manual sync */
export function triggerSync(userId: string): Promise<unknown> {
  return apiFetch(`/v1/sync/${userId}`, { method: "POST" });
}

/** Explorer tiles: every visited z14 tile plus max square / cluster */
export function fetchExplorerTiles(userId: string): Promise<ExplorerTiles> {
  return apiFetch(`/v1/tracks/tiles/${userId}`);
}

/** Mean-max power curve, all-time and per year */
export function fetchPowerCurve(userId: string): Promise<PowerCurve> {
  return apiFetch(`/v1/tracks/power-curve/${userId}`);
}

/** Auto-detected climbs ridden at least twice, most-ridden first */
export function fetchClimbs(userId: string): Promise<ClimbSummary[]> {
  return apiFetch(`/v1/tracks/climbs/${userId}`);
}

/** Every effort on one climb */
export function fetchClimb(userId: string, id: number): Promise<ClimbDetail> {
  return apiFetch(`/v1/tracks/climbs/${userId}/${id}`);
}

/** Routes ridden at least three times, most-ridden first */
export function fetchRoutes(userId: string): Promise<RouteSummary[]> {
  return apiFetch(`/v1/tracks/routes/${userId}`);
}

/** Every ride on one route, chronological */
export function fetchRouteRides(userId: string, id: number): Promise<RouteRide[]> {
  return apiFetch(`/v1/tracks/routes/${userId}/${id}`);
}

/** Detail polyline, climbs and power bests for one ride */
export function fetchRideTrack(userId: string, id: number): Promise<RideTrackExtras> {
  return apiFetch(`/v1/tracks/ride/${userId}/${id}`);
}
