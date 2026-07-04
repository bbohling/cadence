import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { fetchActivityTypes, type ActivityTypeBreakdown } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

/**
 * Activity Type Breakdown — pie chart showing the mix of activity types.
 *
 * Ride, VirtualRide, Run, etc. with counts and percentages.
 */

const USER_ID = "brandon";

/** Color palette for activity types */
const COLORS = [
  "#22c55e", // brand (Ride)
  "#3b82f6", // blue (VirtualRide)
  "#a855f7", // purple (Run)
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#6366f1", // indigo
];

export function ActivityTypeChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity-types", USER_ID],
    queryFn: () => fetchActivityTypes(USER_ID),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Activity Types</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Activity Types</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No activity data available.</p>
        </CardContent>
      </Card>
    );
  }

  const totalActivities = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader><CardTitle>Activity Types</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Pie chart */}
          <div className="w-40 h-40 shrink-0">
              <PieChart width={160} height={160}>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius="90%"
                  innerRadius="50%"
                  dataKey="count"
                  nameKey="type"
                  stroke="none"
                >
                  {data.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as ActivityTypeBreakdown;
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                        <div className="font-medium text-white">{item.type}</div>
                        <div className="text-slate-400">
                          {item.count} activities · {formatNumber(item.totalDistance, 0)} mi
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-1.5">
            {data.map((item, idx) => {
              const pct = Math.round((item.count / totalActivities) * 100);
              return (
                <div key={item.type} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="text-slate-300 flex-1">{item.type}</span>
                  <span className="text-slate-500 tabular-nums">{item.count}</span>
                  <span className="text-slate-600 tabular-nums w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
