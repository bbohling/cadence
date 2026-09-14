import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * ActivityCalendar — GitHub-style year heatmap of ride days.
 *
 * Monday-start weeks as columns. Cells are square and size from the
 * container's width, so the same component fits a phone or a 5K desktop.
 */

/** "YYYY-MM-DD" in local time (toISOString would shift east-of-UTC dates) */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function ActivityCalendar({
  year,
  activeDates,
  large = false,
  className,
}: {
  year: number;
  activeDates: string[];
  /** Bigger labels and gaps, for wall/desktop displays */
  large?: boolean;
  className?: string;
}) {
  const activeSet = useMemo(() => new Set(activeDates), [activeDates]);

  // Monday-start weeks covering the year; each week notes which month
  // begins in it so labels line up with their columns.
  const weeks = useMemo(() => {
    const result: Array<{
      monthStart: number | null;
      days: Array<{ date: string; inYear: boolean; active: boolean }>;
    }> = [];

    const current = new Date(year, 0, 1);
    const dayOfWeek = current.getDay();
    current.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    while (current.getFullYear() <= year) {
      const days: typeof result[number]["days"] = [];
      let monthStart: number | null = null;
      for (let d = 0; d < 7; d++) {
        const inYear = current.getFullYear() === year;
        if (inYear && current.getDate() === 1) monthStart = current.getMonth();
        const date = localDateKey(current);
        days.push({ date, inYear, active: activeSet.has(date) });
        current.setDate(current.getDate() + 1);
      }
      result.push({ monthStart, days });
    }

    return result;
  }, [year, activeSet]);

  const gap = large ? "gap-[3px]" : "gap-px";

  // The day-label column is one more flex-1 column, so it is exactly as wide
  // as a week — its square cells then line up row-for-row with the grid.
  return (
    <div className={cn("w-full", className)}>
      {/* Month labels — aligned to the week each month starts in */}
      <div className={cn("flex", gap, large ? "mb-1.5" : "mb-1")}>
        <div className="flex-1 min-w-0" />
        {weeks.map((week, wi) => (
          <div key={wi} className={cn("flex-1 min-w-0 relative", large ? "h-3.5" : "h-2")}>
            {week.monthStart !== null && (
              <span className={cn("absolute left-0 bottom-0 leading-none text-slate-600 font-medium", large ? "text-xs" : "text-[8px]")}>
                {MONTH_LABELS[week.monthStart]}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className={cn("flex", gap)}>
        {/* Day-of-week labels */}
        <div className={cn("flex-1 min-w-0 flex flex-col", gap)}>
          {["M", "", "W", "", "F", "", "S"].map((d, i) => (
            <div key={i} className="aspect-square flex items-center justify-center">
              <span className={cn("text-slate-600 leading-none", large ? "text-[10px]" : "text-[6px]")}>{d}</span>
            </div>
          ))}
        </div>
        {/* Week columns — cells size from available width */}
        {weeks.map((week, wi) => (
          <div key={wi} className={cn("flex-1 min-w-0 flex flex-col", gap)}>
            {week.days.map((day) => (
              <div
                key={day.date}
                className={cn(
                  "aspect-square",
                  large ? "rounded-[3px]" : "rounded-[1px]",
                  !day.inYear ? "bg-transparent" : day.active ? "bg-strava" : "bg-slate-800/70"
                )}
                title={day.inYear ? day.date : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
