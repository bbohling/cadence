import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell } from "recharts";
import { fetchYearOverYear } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDuration } from "@/lib/utils";

/**
 * Year Progress Rings — donut charts comparing this year vs. last year.
 *
 * Shows 5 metrics as radial progress indicators:
 *   Miles, Rides, Climbing, Calories, Moving Time
 *
 * Each ring shows the current year's progress as a percentage of
 * what was achieved by the same date last year.
 */

const USER_ID = "brandon";

/** Ring color when progress < 100% */
const PROGRESS_COLOR = "#22c55e"; // brand-500
/** Ring color for the "remaining" portion */
const TRACK_COLOR = "#1e293b"; // surface-100
/** Ring color when progress exceeds last year */
const OVERFLOW_COLOR = "#4ade80"; // brand-400

interface RingMetric {
  label: string;
  currentValue: number;
  lastYearValue: number;
  format: (n: number) => string;
}

export function YearProgressRings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["year-over-year", USER_ID],
    queryFn: () => fetchYearOverYear(USER_ID),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Year Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle>Year Progress</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">Unable to load progress data.</p>
        </CardContent>
      </Card>
    );
  }

  // data[0] = current year, data[1] = last year
  const current = data[0]!;
  const lastYear = data[1]!;

  const metrics: RingMetric[] = [
    {
      label: "Miles",
      currentValue: current.distance,
      lastYearValue: lastYear.distance,
      format: (n) => formatNumber(n, 0),
    },
    {
      label: "Rides",
      currentValue: current.rides,
      lastYearValue: lastYear.rides,
      format: (n) => String(n),
    },
    {
      label: "Climbing",
      currentValue: current.elevation,
      lastYearValue: lastYear.elevation,
      format: (n) => `${formatNumber(n, 0)} ft`,
    },
    {
      label: "Calories",
      currentValue: current.calories,
      lastYearValue: lastYear.calories,
      format: (n) => formatNumber(n, 0),
    },
    {
      label: "Time",
      currentValue: current.movingTime,
      lastYearValue: lastYear.movingTime,
      format: (n) => formatDuration(n),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {current.year} vs {lastYear.year}
          <span className="text-slate-500 font-normal ml-2 text-xs normal-case tracking-normal">
            through {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {metrics.map((metric) => (
            <ProgressRing key={metric.label} metric={metric} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRing({ metric }: { metric: RingMetric }) {
  const { label, currentValue, lastYearValue, format } = metric;

  // Avoid division by zero
  const pct = lastYearValue > 0 ? (currentValue / lastYearValue) * 100 : 0;
  const displayPct = Math.min(pct, 100); // Cap at 100 for the ring visual
  const isOverflow = pct > 100;

  const ringData = [
    { value: displayPct },
    { value: 100 - displayPct },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-28 sm:w-32 sm:h-32">
        <PieChart width={128} height={128}>
            <Pie
              data={ringData}
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={isOverflow ? OVERFLOW_COLOR : PROGRESS_COLOR} />
              <Cell fill={TRACK_COLOR} />
            </Pie>
        </PieChart>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg sm:text-xl font-bold text-white">
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      <div className="text-center">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </div>
        <div className="text-sm font-semibold text-white">
          {format(currentValue)}
        </div>
        <div className="text-xs text-slate-500">
          of {format(lastYearValue)}
        </div>
      </div>
    </div>
  );
}
