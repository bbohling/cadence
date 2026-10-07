import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRidePolylines } from "@/lib/api";
import { decodePolyline, splitJumps, type LngLat } from "@/lib/polyline";
import { RideMap } from "@/components/map/ride-map";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber, parseLocalDate } from "@/lib/utils";

/**
 * Personal heatmap — every outdoor ride on one map.
 *
 * Loads all years in a single request (~1 MB, cached 15 min by the API) and
 * filters by year client-side, so switching years is instant.
 */

const USER_ID = "brandon";

export function MapPage() {
  const [year, setYear] = useState<number | "all">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["polylines", USER_ID, "all"],
    queryFn: () => fetchRidePolylines(USER_ID),
    staleTime: 15 * 60_000,
  });

  // Decode once; filtering by year reuses the decoded lines
  const decoded = useMemo(
    () =>
      (data ?? []).map((r) => ({
        year: parseLocalDate(r.startDateLocal).getFullYear(),
        distance: r.distance,
        line: decodePolyline(r.polyline),
      })),
    [data]
  );

  const years = useMemo(
    () => [...new Set(decoded.map((r) => r.year))].sort((a, b) => b - a),
    [decoded]
  );

  const visible = useMemo(
    () => (year === "all" ? decoded : decoded.filter((r) => r.year === year)),
    [decoded, year]
  );
  const lines = useMemo<LngLat[][]>(() => visible.flatMap((r) => splitJumps(r.line)), [visible]);
  const miles = visible.reduce((sum, r) => sum + r.distance, 0);

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (error) {
    return <p className="text-center py-20 text-slate-500">Unable to load ride maps.</p>;
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
          {(["all", ...years] as const).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium tabular-nums transition-colors",
                year === y
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
            >
              {y === "all" ? "All" : y}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-400 tabular-nums">
          {formatNumber(visible.length)} rides · {formatNumber(miles)} mi
        </p>
      </div>

      <div className="h-[calc(100vh-14rem)] sm:h-[calc(100vh-11rem)] min-h-80 rounded-xl overflow-hidden border border-slate-800">
        <RideMap lines={lines} variant="heat" />
      </div>
    </div>
  );
}
