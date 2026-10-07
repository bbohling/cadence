import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fetchPowerCurve, type PowerCurve } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDurationShort } from "@/lib/utils";

/**
 * Power curve — best average power held for 5 s … 60 min.
 *
 * All-time is the dashed reference line; each selected year draws over it.
 * The x axis is categorical: the durations are already roughly log-spaced,
 * which is how power curves are read.
 */

const USER_ID = "brandon";
const YEAR_COLORS = ["#fc4c02", "#38bdf8", "#a78bfa", "#4ade80", "#fbbf24", "#f472b6"];
const HEADLINE_DURATIONS = [5, 60, 300, 1200] as const;

export function PowerCurvePanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["power-curve", USER_ID],
    queryFn: () => fetchPowerCurve(USER_ID),
  });

  if (isLoading) return <Skeleton className="h-[420px] w-full" />;
  if (error || !data || data.allTime.length === 0) {
    return <p className="text-slate-500 text-sm py-10 text-center">No power data yet.</p>;
  }
  return <PowerCurveView data={data} />;
}

function PowerCurveView({ data }: { data: PowerCurve }) {
  const years = data.years.map((y) => y.year);
  const [selected, setSelected] = useState<number[]>(() => years.slice(0, 2));

  const rows = useMemo(
    () =>
      data.durations
        .filter((d) => data.allTime.some((p) => p.durationS === d))
        .map((d) => {
          const row: Record<string, number | string> = {
            label: formatDurationShort(d),
            allTime: data.allTime.find((p) => p.durationS === d)!.watts,
          };
          for (const y of data.years) {
            const p = y.points.find((pt) => pt.durationS === d);
            if (p) row[`y${y.year}`] = p.watts;
          }
          return row;
        }),
    [data]
  );

  const colorFor = (year: number) => YEAR_COLORS[years.indexOf(year) % YEAR_COLORS.length]!;
  const toggle = (year: number) =>
    setSelected((s) => (s.includes(year) ? s.filter((y) => y !== year) : [...s, year]));

  const best = (points: PowerCurve["allTime"], d: number) => points.find((p) => p.durationS === d)?.watts;
  const latest = data.years[0];
  const ftp = (points: PowerCurve["allTime"] | undefined) => {
    const w = points && best(points, 1200);
    return w ? Math.round(w * 0.95) : null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Headline numbers: this year vs all-time */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        {HEADLINE_DURATIONS.map((d) => (
          <StatTile
            key={d}
            label={`${formatDurationShort(d)} best`}
            value={latest && best(latest.points, d)}
            reference={best(data.allTime, d)}
            year={latest?.year}
          />
        ))}
        <StatTile
          label="FTP est. (95% of 20m)"
          value={ftp(latest?.points)}
          reference={ftp(data.allTime)}
          year={latest?.year}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Power curve <span className="normal-case font-normal text-slate-500">· watts</span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1 mb-3">
            {years.map((y) => {
              const on = selected.includes(y);
              return (
                <button
                  key={y}
                  onClick={() => toggle(y)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium tabular-nums border transition-colors",
                    on ? "text-white border-transparent" : "text-slate-400 border-slate-700 hover:text-white"
                  )}
                  style={on ? { backgroundColor: `${colorFor(y)}33`, borderColor: colorFor(y) } : undefined}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <div className="h-72 sm:h-80 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} width={44} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <div className="font-medium text-white mb-1">{label}</div>
                        {payload.map((p) => (
                          <div key={String(p.dataKey)} className="flex justify-between gap-4 tabular-nums">
                            <span style={{ color: p.color }}>
                              {p.dataKey === "allTime" ? "All-time" : String(p.dataKey).slice(1)}
                            </span>
                            <span className="text-slate-200">{p.value} W</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line
                  dataKey="allTime"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                {selected.map((y) => (
                  <Line
                    key={y}
                    dataKey={`y${y}`}
                    stroke={colorFor(y)}
                    strokeWidth={2}
                    dot={{ r: 2.5, strokeWidth: 0, fill: colorFor(y) }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  reference,
  year,
  className,
}: {
  label: string;
  value: number | null | undefined;
  reference: number | null | undefined;
  year: number | undefined;
  className?: string;
}) {
  const pct = value && reference ? Math.round((value / reference) * 100) : null;
  return (
    <Card className={cn("px-3 py-3", className)}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="tabular-nums mt-0.5">
        <span className="text-xl font-semibold text-white">{value ?? "—"}</span>
        {value != null && <span className="ml-1 text-xs text-slate-500">W</span>}
      </div>
      <div className="text-[11px] text-slate-500 tabular-nums">
        {year} · {pct != null ? `${pct}% of all-time ${reference} W` : `all-time ${reference ?? "—"} W`}
      </div>
    </Card>
  );
}
