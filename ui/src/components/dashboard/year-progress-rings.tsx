import { useQuery } from "@tanstack/react-query";
import { fetchYearOverYear } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatNumber, formatDuration } from "@/lib/utils";

/**
 * Year Progress Rings — donut charts comparing this year vs. last year.
 *
 * Shows 5 metrics as radial progress indicators:
 *   Miles, Rides, Climbing, Calories, Moving Time
 *
 * Each ring shows the current year's progress as a percentage of
 * what was achieved by the same date last year.
 *
 * Mobile: three rings per row (3 + 2, centered). sm+: one row of five.
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
          <div className="flex flex-wrap justify-center gap-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="basis-1/3 sm:basis-1/5 flex justify-center">
                <Skeleton className="h-32 sm:h-40 w-20 sm:w-28" />
              </div>
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
        <div className="flex flex-wrap justify-center gap-y-5">
          {metrics.map((metric) => (
            <ProgressRingStat key={metric.label} metric={metric} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRingStat({ metric }: { metric: RingMetric }) {
  const { label, currentValue, lastYearValue, format } = metric;

  // Avoid division by zero
  const pct = lastYearValue > 0 ? (currentValue / lastYearValue) * 100 : 0;
  const isOverflow = pct > 100;

  return (
    <div className="basis-1/3 sm:basis-1/5 flex flex-col items-center gap-1 px-1">
      <ProgressRing
        percent={pct}
        strokeWidth={11}
        color={isOverflow ? OVERFLOW_COLOR : PROGRESS_COLOR}
        trackColor={TRACK_COLOR}
        className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32"
      >
        <span className="text-base sm:text-xl font-bold text-white tabular-nums">
          {Math.round(pct)}%
        </span>
      </ProgressRing>

      <div className="text-center min-w-0">
        <div className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </div>
        <div className="text-sm font-semibold text-white tabular-nums">
          {format(currentValue)}
        </div>
        <div className="text-[11px] sm:text-xs text-slate-500 tabular-nums">
          of {format(lastYearValue)}
        </div>
      </div>
    </div>
  );
}
