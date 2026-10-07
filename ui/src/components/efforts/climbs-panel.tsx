import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Mountain, Trophy } from "lucide-react";
import { fetchClimb, fetchClimbs, type ClimbSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber, formatTime } from "@/lib/utils";

/**
 * Climbs — hills auto-detected from elevation, matched across every ride.
 *
 * Independent of Strava segments: any sustained climb counts, and every
 * effort on it lines up over the years. Names are borrowed from a matching
 * Strava segment when one exists.
 */

const USER_ID = "brandon";

export function climbLabel(c: { id: number; name: string | null }): string {
  return c.name ?? `Climb #${c.id}`;
}

export function ClimbsPanel({ initialClimbId }: { initialClimbId?: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["climbs", USER_ID],
    queryFn: () => fetchClimbs(USER_ID),
  });
  const [selectedId, setSelectedId] = useState<number | null>(initialClimbId ?? null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Default to the most-ridden climb (a climb ridden once still opens via
  // initialClimbId, though it isn't in the list)
  useEffect(() => {
    if (selectedId === null && data?.length) setSelectedId(data[0]!.id);
  }, [data, selectedId]);

  if (isLoading) return <Skeleton className="h-[480px] w-full" />;
  if (error || !data?.length) {
    return <p className="text-slate-500 text-sm py-10 text-center">No climbs detected yet.</p>;
  }

  const select = (id: number) => {
    setSelectedId(id);
    // On narrow screens the detail sits above the list; bring it into view
    if (window.matchMedia("(max-width: 1023px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-start">
      <div ref={detailRef} className="lg:order-2 lg:sticky lg:top-20 scroll-mt-20">
        {selectedId !== null && <ClimbDetailCard climbId={selectedId} />}
      </div>

      <Card className="lg:order-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mountain className="w-4 h-4 text-brand-400" />
            {data.length} climbs ridden more than once
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-3">
          <ul className="divide-y divide-slate-800/60 max-h-[70vh] overflow-y-auto">
            {data.map((c) => (
              <li key={c.id}>
                <ClimbRow climb={c} active={c.id === selectedId} onSelect={() => select(c.id)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ClimbRow({ climb, active, onSelect }: { climb: ClimbSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
        active ? "bg-slate-800/80" : "hover:bg-slate-800/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-medium", climb.name ? "text-white" : "text-slate-300")}>
          {climbLabel(climb)}
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          {formatNumber(climb.length, 1)} mi · {formatNumber(climb.avgGrade, 1)}% · {formatNumber(climb.gain)} ft
        </div>
      </div>
      <div className="text-right tabular-nums shrink-0">
        <div className="text-sm font-semibold text-slate-200">{formatTime(climb.bestElapsedS)}</div>
        <div className="text-xs text-slate-500">{climb.efforts}×</div>
      </div>
    </button>
  );
}

function ClimbDetailCard({ climbId }: { climbId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["climb", USER_ID, climbId],
    queryFn: () => fetchClimb(USER_ID, climbId),
  });

  if (isLoading || !data) return <Skeleton className="h-[480px] w-full" />;

  const { climb, efforts } = data;
  const points = efforts.map((e) => ({ ...e, x: Date.parse(e.startDate), y: e.elapsedS }));
  const top = [...efforts].sort((a, b) => a.rank - b.rank).slice(0, 10);
  const latest = efforts[efforts.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">{climbLabel(climb)}</CardTitle>
        <p className="text-xs text-slate-500 tabular-nums mt-1">
          {formatNumber(climb.length, 2)} mi · {formatNumber(climb.avgGrade, 1)}% avg · {formatNumber(climb.gain)} ft gain ·{" "}
          {efforts.length} effort{efforts.length === 1 ? "" : "s"}
          {latest && <> · latest #{latest.rank} ({formatTime(latest.elapsedS)})</>}
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-56 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
              <YAxis
                dataKey="y"
                type="number"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                width={48}
                domain={["dataMin - 15", "dataMax + 15"]}
                tickFormatter={(v: number) => formatTime(Math.round(v))}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload as (typeof points)[number] | undefined;
                  if (!p) return null;
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                      <div className="font-medium text-white">{formatTime(p.elapsedS)} · #{p.rank}</div>
                      <div className="text-slate-400">
                        {new Date(p.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {p.avgWatts ? ` · ${p.avgWatts} W` : ""}
                        {p.avgHr ? ` · ${p.avgHr} bpm` : ""}
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter data={points} fill="#fc4c02" fillOpacity={0.7} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-600 text-right -mt-1 mb-3">lower is faster</p>

        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-slate-500 text-left">
              <th className="font-normal pb-1 w-8">#</th>
              <th className="font-normal pb-1">Date</th>
              <th className="font-normal pb-1 text-right">Time</th>
              <th className="font-normal pb-1 text-right hidden sm:table-cell">Power</th>
              <th className="font-normal pb-1 text-right hidden sm:table-cell">HR</th>
            </tr>
          </thead>
          <tbody>
            {top.map((e) => (
              <tr key={`${e.activityId}-${e.startDate}`} className="border-t border-slate-800/60">
                <td className="py-1.5 text-slate-500">
                  {e.rank === 1 ? <Trophy className="w-3.5 h-3.5 text-gold" /> : e.rank}
                </td>
                <td className="py-1.5">
                  <Link to="/ride/$id" params={{ id: String(e.activityId) }} className="text-slate-200 hover:text-white">
                    {new Date(e.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </Link>
                </td>
                <td className="py-1.5 text-right text-white font-medium">{formatTime(e.elapsedS)}</td>
                <td className="py-1.5 text-right text-slate-400 hidden sm:table-cell">{e.avgWatts ? `${e.avgWatts} W` : "—"}</td>
                <td className="py-1.5 text-right text-slate-400 hidden sm:table-cell">{e.avgHr ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
