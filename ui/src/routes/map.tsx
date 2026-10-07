import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchExplorerTiles, fetchRidePolylines } from "@/lib/api";
import { decodePolyline, splitJumps, type LngLat } from "@/lib/polyline";
import { RideMap, type TileOverlay } from "@/components/map/ride-map";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber, parseLocalDate } from "@/lib/utils";

/**
 * Personal heatmap — every outdoor ride on one map.
 *
 * Loads all years in a single request (~1 MB, cached 15 min by the API) and
 * filters by year client-side, so switching years is instant.
 *
 * "Tiles" overlays VeloViewer-style explorer tiles (z14 squares, ~1 mile)
 * from track data: every square ever ridden through, the largest fully
 * ridden square, and squares that are new this year.
 */

const USER_ID = "brandon";

export function MapPage() {
  const [year, setYear] = useState<number | "all">("all");
  const [showTiles, setShowTiles] = useState(false);

  const { data: tileData } = useQuery({
    queryKey: ["explorer-tiles", USER_ID],
    queryFn: () => fetchExplorerTiles(USER_ID),
    enabled: showTiles,
    staleTime: 15 * 60_000,
  });
  const tiles = useMemo<TileOverlay | null>(
    () =>
      showTiles && tileData
        ? {
            visited: tileData.visited,
            year: tileData.year,
            maxSquare: tileData.maxSquareOrigin
              ? { origin: tileData.maxSquareOrigin, size: tileData.maxSquare }
              : null,
          }
        : null,
    [showTiles, tileData]
  );

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
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-400 tabular-nums">
            {formatNumber(visible.length)} rides · {formatNumber(miles)} mi
          </p>
          <button
            onClick={() => setShowTiles((v) => !v)}
            aria-pressed={showTiles}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              showTiles
                ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                : "border-slate-700 text-slate-400 hover:text-white"
            )}
          >
            Tiles
          </button>
        </div>
      </div>

      {showTiles && tileData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <TileStat label="Tiles explored" value={formatNumber(tileData.tiles)} />
          <TileStat label="Max square" value={`${tileData.maxSquare}×${tileData.maxSquare}`} accent="text-gold" />
          <TileStat label="Max cluster" value={formatNumber(tileData.maxCluster)} />
          <TileStat label={`New in ${tileData.year}`} value={formatNumber(tileData.newThisYear)} accent="text-brand-400" />
        </div>
      )}

      <div className="h-[calc(100vh-14rem)] sm:h-[calc(100vh-11rem)] min-h-80 rounded-xl overflow-hidden border border-slate-800">
        <RideMap lines={lines} variant="heat" tiles={tiles} />
      </div>
    </div>
  );
}

function TileStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums text-white", accent)}>{value}</div>
    </div>
  );
}
