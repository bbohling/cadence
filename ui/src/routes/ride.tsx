import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Crown, ExternalLink, Monitor, Trophy } from "lucide-react";
import { fetchRide } from "@/lib/api";
import { decodePolyline } from "@/lib/polyline";
import { RideMap } from "@/components/map/ride-map";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration, formatNumber, parseLocalDate } from "@/lib/utils";

/**
 * Ride detail — map (outdoor rides) plus the stats Cadence stores.
 * Reached from Recent Rides and from route-art shapes.
 */

const USER_ID = "brandon";

export function RidePage() {
  const { id } = useParams({ from: "/ride/$id" });
  const rideId = Number(id);

  const { data: ride, isLoading, error } = useQuery({
    queryKey: ["ride", USER_ID, rideId],
    queryFn: () => fetchRide(USER_ID, rideId),
    enabled: Number.isSafeInteger(rideId) && rideId > 0,
  });

  const lines = useMemo(
    () => (ride?.polyline ? [decodePolyline(ride.polyline)] : []),
    [ride?.polyline]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[50vh] w-full" />
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Ride not found.</p>
        <Link to="/" className="text-brand-400 text-sm">Back to dashboard</Link>
      </div>
    );
  }

  const date = parseLocalDate(ride.startDateLocal);
  const isVirtual = ride.type === "VirtualRide" || ride.trainer;

  const stats: Array<[string, string | null, string?]> = [
    ["Distance", formatNumber(ride.distance, 1), "mi"],
    ["Moving time", formatDuration(ride.movingTime)],
    ["Elevation", formatNumber(ride.elevation), "ft"],
    ["Avg speed", fmt(ride.avgSpeed, 1), "mph"],
    ["Max speed", fmt(ride.maxSpeed, 1), "mph"],
    ["Avg power", fmt(ride.avgWatts), "W"],
    ["Weighted power", fmt(ride.weightedAvgWatts), "W"],
    ["Max power", fmt(ride.maxWatts), "W"],
    ["Avg HR", fmt(ride.avgHeartrate), "bpm"],
    ["Max HR", fmt(ride.maxHeartrate), "bpm"],
    ["Cadence", fmt(ride.avgCadence), "rpm"],
    ["Temp", fmt(ride.avgTemp), "°F"],
    ["Calories", fmt(ride.calories)],
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-1">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{ride.name ?? "Untitled ride"}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-400">
            <span>
              {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              {" · "}
              {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
            {isVirtual && <span className="inline-flex items-center gap-1 text-blue-300"><Monitor className="w-3.5 h-3.5" /> Indoor</span>}
            {ride.komCount > 0 && <span className="inline-flex items-center gap-1 text-gold"><Crown className="w-3.5 h-3.5" /> {ride.komCount}</span>}
            {ride.prCount > 0 && <span className="inline-flex items-center gap-1 text-strava-light"><Trophy className="w-3.5 h-3.5" /> {ride.prCount} PR{ride.prCount === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <a
          href={`https://www.strava.com/activities/${ride.id}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-strava-light hover:bg-slate-800/60"
        >
          Strava <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {lines.length > 0 && (
        <div className="h-[45vh] sm:h-[55vh] min-h-72 rounded-xl overflow-hidden border border-slate-800">
          <RideMap lines={lines} variant="single" />
        </div>
      )}

      <Card>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-4 pt-5">
          {stats
            .filter(([, value]) => value !== null)
            .map(([label, value, unit]) => (
              <div key={label}>
                <div className="text-xs text-slate-500">{label}</div>
                <div className="tabular-nums">
                  <span className="text-lg font-semibold text-slate-100">{value}</span>
                  {unit && <span className="ml-1 text-xs text-slate-500">{unit}</span>}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function fmt(n: number | null, decimals = 0): string | null {
  return n === null || n === 0 ? null : formatNumber(n, decimals);
}
