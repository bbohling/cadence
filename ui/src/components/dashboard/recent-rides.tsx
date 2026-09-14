import { useQuery } from "@tanstack/react-query";
import { fetchRecentRides, type RecentRide } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDuration, formatRideDay, parseLocalDate } from "@/lib/utils";
import { Bike, Crown, ExternalLink, Monitor, Trophy } from "lucide-react";

/**
 * Recent Rides — the last few rides, newest first.
 *
 * Each row links out to the activity on Strava. On mobile the stats
 * drop below the ride name; on wider screens they sit in columns.
 */

const USER_ID = "brandon";
const RIDE_COUNT = 5;

export function RecentRides() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recent-rides", USER_ID, RIDE_COUNT],
    queryFn: () => fetchRecentRides(USER_ID, RIDE_COUNT),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Recent Rides</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: RIDE_COUNT }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Recent Rides</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No rides yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bike className="w-4 h-4 text-brand-400" />
          Recent Rides
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-3">
        <ul className="divide-y divide-slate-800/60">
          {data.map((ride) => (
            <li key={ride.id}>
              <RideRow ride={ride} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RideRow({ ride }: { ride: RecentRide }) {
  const date = parseLocalDate(ride.startDateLocal);
  const isVirtual = ride.type === "VirtualRide" || ride.trainer;
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <a
      href={`https://www.strava.com/activities/${ride.id}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 py-3 rounded-lg hover:bg-slate-800/40 active:bg-slate-800/60 transition-colors"
    >
      {/* Name + date */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white truncate">{ride.name ?? "Untitled ride"}</span>
          <ExternalLink className="w-3 h-3 shrink-0 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-slate-500">
          <span>{formatRideDay(date)} · {time}</span>
          {isVirtual && (
            <Badge className="text-blue-300 bg-blue-500/10">
              <Monitor className="w-3 h-3" /> Indoor
            </Badge>
          )}
          {ride.komCount > 0 && (
            <Badge className="text-gold bg-yellow-500/10">
              <Crown className="w-3 h-3" /> {ride.komCount}
            </Badge>
          )}
          {ride.prCount > 0 && (
            <Badge className="text-strava-light bg-strava/10">
              <Trophy className="w-3 h-3" /> {ride.prCount} PR{ride.prCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-6 sm:w-72 shrink-0">
        <Stat value={formatNumber(ride.distance, 1)} unit="mi" />
        <Stat value={formatNumber(ride.elevation, 0)} unit="ft" />
        <Stat value={formatDuration(ride.movingTime)} />
      </div>
    </a>
  );
}

function Stat({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="sm:text-right tabular-nums">
      <span className="text-sm sm:text-base font-semibold text-slate-200">{value}</span>
      {unit && <span className="ml-1 text-xs text-slate-500">{unit}</span>}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 leading-4 rounded font-medium ${className}`}>
      {children}
    </span>
  );
}
