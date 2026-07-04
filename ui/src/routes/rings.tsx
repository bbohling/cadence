import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { fetchYearOverYear } from "@/lib/api";
import { useEnsureFresh } from "@/hooks/use-ensure-fresh";
import { formatNumber, formatDuration } from "@/lib/utils";
import { Activity } from "lucide-react";

/**
 * Rings page — compact, fixed-position progress rings.
 *
 * Designed to be used as an always-visible overlay, showing year
 * progress at a glance. Sits in the bottom-left corner with a
 * transparent background.
 *
 * This page has its own minimal layout (no nav bar).
 */

const USER_ID = "brandon";

const PROGRESS_COLOR = "#22c55e";
const TRACK_COLOR = "rgba(30, 41, 59, 0.5)";

interface CompactMetric {
  label: string;
  value: number;
  target: number;
  format: (n: number) => string;
}

export function RingsPage() {
  const { isSyncing } = useEnsureFresh(USER_ID);

  const { data } = useQuery({
    queryKey: ["year-over-year", USER_ID],
    queryFn: () => fetchYearOverYear(USER_ID),
  });

  if (!data || data.length < 2) {
    return (
      <div className="fixed bottom-4 left-4">
        <div className="text-slate-500 text-xs">Loading...</div>
      </div>
    );
  }

  const current = data[0]!;
  const lastYear = data[1]!;

  const metrics: CompactMetric[] = [
    { label: "Mi", value: current.distance, target: lastYear.distance, format: (n) => formatNumber(n, 0) },
    { label: "Ri", value: current.rides, target: lastYear.rides, format: (n) => String(n) },
    { label: "Ft", value: current.elevation, target: lastYear.elevation, format: (n) => formatNumber(n, 0) },
    { label: "Cal", value: current.calories, target: lastYear.calories, format: (n) => formatNumber(n, 0) },
    { label: "Hr", value: current.movingTime, target: lastYear.movingTime, format: (n) => formatDuration(n) },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Sync banner */}
      {isSyncing && (
        <div className="mb-2 bg-strava/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
          <Activity className="w-3 h-3 animate-spin" />
          Syncing…
        </div>
      )}

      <div className="flex items-end gap-2">
        {metrics.map((metric) => (
          <CompactRing key={metric.label} metric={metric} />
        ))}
      </div>
    </div>
  );
}

function CompactRing({ metric }: { metric: CompactMetric }) {
  const { label, value, target, format } = metric;
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;

  const ringData = [
    { value: pct },
    { value: 100 - pct },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-14 h-14">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={ringData}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="95%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={PROGRESS_COLOR} />
              <Cell fill={TRACK_COLOR} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white tabular-nums">
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      <div className="text-center mt-0.5">
        <div className="text-[9px] text-slate-500 uppercase">{label}</div>
        <div className="text-[10px] text-slate-300 font-medium tabular-nums">
          {format(value)}
        </div>
      </div>
    </div>
  );
}
