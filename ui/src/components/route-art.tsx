import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { RidePolyline } from "@/lib/api";
import { decodePolyline, toSvgPath } from "@/lib/polyline";
import { formatNumber, parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Route art — every outdoor ride as a small shape, each drawn at its own
 * scale, laid out in a grid. No basemap: the point is the shapes.
 *
 * `linked` makes each shape open the ride detail page (off for ambient
 * displays like /plash).
 */

const CELL = 64;

interface RouteArtProps {
  rides: RidePolyline[];
  sort?: "date" | "distance";
  linked?: boolean;
  className?: string;
}

export function RouteArt({ rides, sort = "date", linked = true, className }: RouteArtProps) {
  const shapes = useMemo(() => {
    const sorted =
      sort === "distance" ? [...rides].sort((a, b) => b.distance - a.distance) : rides;
    return sorted.map((ride) => ({
      ride,
      d: toSvgPath(decodePolyline(ride.polyline), CELL, 4),
    }));
  }, [rides, sort]);

  return (
    <div
      className={cn(
        "grid gap-1 grid-cols-[repeat(auto-fill,minmax(44px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(56px,1fr))]",
        className
      )}
    >
      {shapes.map(({ ride, d }) => {
        const label = `${ride.name ?? "Ride"} · ${parseLocalDate(ride.startDateLocal).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${formatNumber(ride.distance, 1)} mi`;
        const svg = (
          <svg viewBox={`0 0 ${CELL} ${CELL}`} className="w-full aspect-square" role="img" aria-label={label}>
            <title>{label}</title>
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
        return linked ? (
          <Link
            key={ride.id}
            to="/ride/$id"
            params={{ id: String(ride.id) }}
            className="rounded-md text-strava-light/80 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            {svg}
          </Link>
        ) : (
          <div key={ride.id} className="text-strava-light/80">{svg}</div>
        );
      })}
    </div>
  );
}
