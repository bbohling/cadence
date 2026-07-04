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

export interface EnsureFreshResponse {
  fresh: boolean;
  syncing?: boolean;
  syncFailed?: boolean;
  error?: string;
  lastSyncAt?: string;
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
