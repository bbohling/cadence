import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ComposedChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fetchRouteRides, fetchRoutes, type RouteSummary } from "@/lib/api";
import { decodePolyline, toSvgPath } from "@/lib/polyline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDuration, formatNumber } from "@/lib/utils";

/**
 * Routes — rides grouped by shape (z16 tile overlap), so the same loop can
 * be compared across years: is the Tuesday Shop Ride getting faster?
 */

const USER_ID = "brandon";
const SHAPE = 48;

export function RoutesPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["routes", USER_ID],
    queryFn: () => fetchRoutes(USER_ID),
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId === null && data?.length) setSelectedId(data[0]!.id);
  }, [data, selectedId]);

  if (isLoading) return <Skeleton className="h-[480px] w-full" />;
  if (error || !data?.length) {
    return <p className="text-slate-500 text-sm py-10 text-center">No repeated routes yet.</p>;
  }

  const selected = data.find((r) => r.id === selectedId);
  const select = (id: number) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-start">
      <div ref={detailRef} className="lg:order-2 lg:sticky lg:top-20 scroll-mt-20">
        {selected && <RouteDetailCard route={selected} />}
      </div>

      <Card className="lg:order-1">
        <CardHeader>
          <CardTitle>{data.length} routes ridden 3+ times</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-3">
          <ul className="divide-y divide-slate-800/60 max-h-[70vh] overflow-y-auto">
            {data.map((r) => (
              <li key={r.id}>
                <RouteRow route={r} active={r.id === selectedId} onSelect={() => select(r.id)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function RouteShape({ polyline, size = SHAPE }: { polyline: string | null; size?: number }) {
  const d = useMemo(() => (polyline ? toSvgPath(decodePolyline(polyline), size, 3) : ""), [polyline, size]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="shrink-0 text-strava-light/80" style={{ width: size, height: size }} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RouteRow({ route, active, onSelect }: { route: RouteSummary; active: boolean; onSelect: () => void }) {
  const years = `${route.firstDate.slice(0, 4)}–${route.lastDate.slice(0, 4)}`;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg transition-colors",
        active ? "bg-slate-800/80" : "hover:bg-slate-800/40"
      )}
    >
      <RouteShape polyline={route.polyline} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-white">{route.name ?? `Route #${route.id}`}</div>
        <div className="text-xs text-slate-500 tabular-nums">
          {formatNumber(route.distance, 1)} mi · {years}
        </div>
      </div>
      <div className="text-right tabular-nums shrink-0">
        <div className="text-sm font-semibold text-slate-200">{route.rides}×</div>
      </div>
    </button>
  );
}

function RouteDetailCard({ route }: { route: RouteSummary }) {
  const { data, isLoading } = useQuery({
    queryKey: ["route-rides", USER_ID, route.id],
    queryFn: () => fetchRouteRides(USER_ID, route.id),
  });

  const points = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.avgSpeed)
        .map((r) => ({ ...r, x: Date.parse(r.startDate), speed: r.avgSpeed!, watts: r.avgWatts ?? undefined })),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <RouteShape polyline={route.polyline} size={56} />
          <div className="min-w-0">
            <CardTitle className="truncate">{route.name ?? `Route #${route.id}`}</CardTitle>
            <p className="text-xs text-slate-500 tabular-nums mt-1">
              {formatNumber(route.distance, 1)} mi · {route.rides} rides
              {route.bestSpeed ? ` · best ${formatNumber(route.bestSpeed, 1)} mph` : ""}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <div className="h-56 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1e293b" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v: number) => String(new Date(v).getFullYear())}
                  />
                  <YAxis yAxisId="speed" stroke="#fc4c02" fontSize={12} tickLine={false} width={40} unit="" domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v: number) => v.toFixed(0)} />
                  <YAxis yAxisId="watts" orientation="right" stroke="#38bdf8" fontSize={12} tickLine={false} width={40} domain={["dataMin - 20", "dataMax + 20"]} tickFormatter={(v: number) => v.toFixed(0)} />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      const p = active && (payload?.[0]?.payload as (typeof points)[number] | undefined);
                      if (!p) return null;
                      return (
                        <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                          <div className="font-medium text-white">{p.name ?? "Ride"}</div>
                          <div className="text-slate-400">
                            {new Date(p.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                          <div className="text-slate-300 tabular-nums">
                            {formatNumber(p.speed, 1)} mph{p.watts ? ` · ${Math.round(p.watts)} W` : ""}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter yAxisId="speed" dataKey="speed" fill="#fc4c02" isAnimationActive={false} />
                  <Scatter yAxisId="watts" dataKey="watts" fill="#38bdf8" fillOpacity={0.6} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[11px] -mt-1 mb-3">
              <span className="text-strava-light">● avg speed (mph)</span>
              <span className="text-sky-400">● avg power (W)</span>
            </div>

            <ul className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto text-sm">
              {[...data].reverse().map((r) => (
                <li key={r.activityId}>
                  <Link
                    to="/ride/$id"
                    params={{ id: String(r.activityId) }}
                    className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-slate-800/40"
                  >
                    <span className="flex-1 min-w-0 truncate text-slate-200">{r.name ?? "Ride"}</span>
                    <span className="text-xs text-slate-500 tabular-nums w-24 text-right">
                      {new Date(r.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="tabular-nums text-slate-300 w-16 text-right">
                      {r.avgSpeed ? `${formatNumber(r.avgSpeed, 1)} mph` : "—"}
                    </span>
                    <span className="tabular-nums text-slate-500 w-14 text-right hidden sm:inline">
                      {r.movingTime ? formatDuration(r.movingTime) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
