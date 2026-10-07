import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Crown, ExternalLink, Monitor, Mountain, Trophy, Zap } from "lucide-react";
import { fetchRide, fetchRideTrack, type RideTrackExtras } from "@/lib/api";
import { decodePolyline } from "@/lib/polyline";
import { RideMap } from "@/components/map/ride-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration, formatDurationShort, formatNumber, formatTime, parseLocalDate } from "@/lib/utils";
import { climbLabel } from "@/components/efforts/climbs-panel";

/**
 * Ride detail — map (outdoor rides) plus the stats Cadence stores.
 * Reached from Recent Rides and from route-art shapes.
 *
 * When the ride has been through track processing, the map uses the
 * higher-resolution detail polyline, and climbs + power bests are shown
 * against every other effort.
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

  const { data: track } = useQuery({
    queryKey: ["ride-track", USER_ID, rideId],
    queryFn: () => fetchRideTrack(USER_ID, rideId),
    enabled: Number.isSafeInteger(rideId) && rideId > 0,
  });

  const encoded = track?.detailPolyline ?? ride?.polyline ?? null;
  const lines = useMemo(() => (encoded ? [decodePolyline(encoded)] : []), [encoded]);

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

      {track && (track.climbs.length > 0 || track.powerBests.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {track.climbs.length > 0 && <RideClimbs climbs={track.climbs} />}
          {track.powerBests.length > 0 && <RidePower bests={track.powerBests} />}
        </div>
      )}
    </div>
  );
}

function RideClimbs({ climbs }: { climbs: RideTrackExtras["climbs"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-brand-400" /> Climbs
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-3">
        <ul className="divide-y divide-slate-800/60">
          {climbs.map((c) => (
            <li key={`${c.climbId}-${c.elapsedS}`}>
              <Link
                to="/efforts"
                search={{ tab: "climbs", climb: c.climbId }}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className={c.name ? "truncate text-white" : "truncate text-slate-300"}>
                    {climbLabel({ id: c.climbId, name: c.name })}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {formatNumber(c.length, 1)} mi · {formatNumber(c.avgGrade, 1)}%
                    {c.avgWatts ? ` · ${c.avgWatts} W` : ""}
                  </div>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <div className="text-sm font-semibold text-slate-200">{formatTime(c.elapsedS)}</div>
                  <div className="text-xs text-slate-500">
                    {c.rank === 1 ? <span className="text-gold">fastest</span> : `#${c.rank}`} of {c.efforts}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RidePower({ bests }: { bests: RideTrackExtras["powerBests"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" /> Power bests
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {bests.map((b) => {
            const pct = b.allTimeBest ? Math.min(100, (b.watts / b.allTimeBest) * 100) : 0;
            return (
              <li key={b.durationS} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-3 text-sm tabular-nums">
                <span className="text-slate-500 text-xs">{formatDurationShort(b.durationS)}</span>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={pct >= 100 ? "h-full bg-gold" : "h-full bg-strava/80"}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-right">
                  <span className="text-slate-200 font-medium">{b.watts}</span>
                  <span className="text-slate-500 text-xs"> / {b.allTimeBest}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-slate-600 mt-2">this ride / all-time best, watts</p>
      </CardContent>
    </Card>
  );
}

function fmt(n: number | null, decimals = 0): string | null {
  return n === null || n === 0 ? null : formatNumber(n, decimals);
}
