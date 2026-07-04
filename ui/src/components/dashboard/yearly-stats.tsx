import { useQuery } from "@tanstack/react-query";
import { fetchYearlyStats, type YearlyStats } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDuration, cn } from "@/lib/utils";

/**
 * Yearly Stats — horizontal bar charts showing historical trends.
 *
 * Displays 5 metrics across all years:
 *   Miles, Rides, Climbing, Calories, Moving Time
 *
 * Each metric shows bars proportional to the best year, with
 * the best year highlighted. Clean, information-dense layout.
 */

const USER_ID = "brandon";

interface MetricConfig {
  key: keyof YearlyStats;
  label: string;
  format: (n: number) => string;
  suffix?: string;
}

const METRICS: MetricConfig[] = [
  { key: "totalDistance", label: "Miles", format: (n) => formatNumber(n, 0) },
  { key: "totalRides", label: "Rides", format: (n) => String(n) },
  { key: "totalElevation", label: "Climbing", format: (n) => `${formatNumber(n, 0)} ft` },
  { key: "totalCalories", label: "Calories", format: (n) => formatNumber(n, 0) },
  { key: "totalMovingTime", label: "Time", format: (n) => formatDuration(n) },
];

export function YearlyStatsChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["yearly-stats", USER_ID],
    queryFn: () => fetchYearlyStats(USER_ID),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Over the Years</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Over the Years</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No yearly data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Over the Years</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {METRICS.map((metric) => (
            <MetricChart key={metric.key} metric={metric} data={data} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricChart({
  metric,
  data,
}: {
  metric: MetricConfig;
  data: YearlyStats[];
}) {
  const values = data.map((d) => d[metric.key] as number);
  const maxValue = Math.max(...values, 1);
  const bestYear = data.reduce((best, current) =>
    (current[metric.key] as number) > (best[metric.key] as number) ? current : best
  );

  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {metric.label}
      </h4>
      <div className="space-y-1.5">
        {data.map((yearData) => {
          const value = yearData[metric.key] as number;
          const width = (value / maxValue) * 100;
          const isBest = yearData.year === bestYear.year;

          return (
            <div key={yearData.year} className="flex items-center gap-2 group">
              <span className="text-xs text-slate-500 w-10 text-right tabular-nums shrink-0">
                {yearData.year}
              </span>
              <div className="flex-1 h-5 bg-slate-800/50 rounded overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded transition-all duration-300",
                    isBest
                      ? "bg-gradient-to-r from-brand-600 to-brand-400"
                      : "bg-slate-700 group-hover:bg-slate-600"
                  )}
                  style={{ width: `${Math.max(width, 1)}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-xs tabular-nums w-20 text-right shrink-0",
                  isBest ? "text-brand-400 font-semibold" : "text-slate-500"
                )}
              >
                {metric.format(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
