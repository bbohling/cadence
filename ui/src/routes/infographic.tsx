import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronLeft, ChevronRight, Download, Bike } from "lucide-react";
import { fetchInfographicStats, fetchInfographicYears } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

/**
 * Year-in-Review Infographic page.
 *
 * Generates a VeloViewer-style visual summary for a selected year.
 * Shows totals, maxima, active day calendar, Everest comparison,
 * and an elevation profile chart.
 */

const USER_ID = "brandon";

export function InfographicPage() {
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["infographic-years", USER_ID],
    queryFn: () => fetchInfographicYears(USER_ID),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["infographic", USER_ID, selectedYear],
    queryFn: () => fetchInfographicStats(USER_ID, selectedYear),
  });

  const canGoPrev = years && years.includes(selectedYear + 1);
  const canGoNext = years && years.includes(selectedYear - 1);

  if (yearsLoading || isLoading) {
    return (
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[700px] w-full max-w-4xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Unable to load infographic data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in">
      {/* ── Year Selector ──────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSelectedYear((y) => y + 1)}
          disabled={!canGoPrev}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="bg-slate-800 text-white text-2xl font-bold px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none text-center cursor-pointer"
        >
          {years?.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          onClick={() => setSelectedYear((y) => y - 1)}
          disabled={!canGoNext}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ── Infographic Card ──────────────────────── */}
      <InfographicCard data={data} />
    </div>
  );
}

// ── The actual infographic visual ─────────────────────────

function InfographicCard({ data }: { data: import("@/lib/api").InfographicStats }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const totalHours = Math.round((data.totalMovingTime / 3600) * 10) / 10;
  const maxRideHours = Math.round((data.maxRideTime / 3600) * 10) / 10;

  return (
    <div className="w-full max-w-4xl">
      {/* Download hint */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            // Simple screenshot hint — user can use browser screenshot
            if (cardRef.current) {
              const el = cardRef.current;
              el.classList.add("ring-2", "ring-brand-500");
              setTimeout(() => el.classList.remove("ring-2", "ring-brand-500"), 2000);
            }
          }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          title="Highlight for screenshot"
        >
          <Download className="w-3.5 h-3.5" />
          Screenshot
        </button>
      </div>

      <div
        ref={cardRef}
        className="bg-[#1a1a2e] rounded-2xl overflow-hidden shadow-2xl shadow-black/30 transition-all"
      >
        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold text-white uppercase">
              {data.athleteName.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide uppercase">
                {data.athleteName}
              </h1>
              <p className="text-sm text-slate-400 font-medium">Year in Review — {data.year}</p>
            </div>
          </div>
          <Bike className="w-10 h-10 text-slate-500" />
        </div>

        {/* ── Stats Grid ─────────────────────────── */}
        <div className="grid grid-cols-12 gap-0">
          {/* Left column — totals */}
          <div className="col-span-3 px-6 py-4 space-y-6">
            <StatBlock
              label="Total Distance"
              value={formatNumber(Math.round(data.totalDistance))}
              unit="mi"
              dotted
            />
            <StatBlock
              label="Total Hours"
              value={String(totalHours)}
              unit="hrs"
              dotted
            />
            <StatBlock
              label="Total Elevation"
              value={formatNumber(Math.round(data.totalElevation))}
              unit="ft"
              dotted
            />
          </div>

          {/* Center column — activity calendar (wider to fit 53 weeks) */}
          <div className="col-span-6 px-3 py-4 overflow-hidden">
            <div className="text-center mb-2">
              <div className="flex items-baseline justify-center gap-6">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Active Days</div>
                  <div className="text-4xl font-black text-white">{data.activeDays}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Max Streak</div>
                  <div className="text-4xl font-black text-white">{data.maxStreak}</div>
                </div>
              </div>
            </div>
            <ActivityCalendar year={data.year} activeDates={data.activeDates} />
          </div>

          {/* Right column — per-ride stats */}
          <div className="col-span-3 pl-4 pr-8 py-4 space-y-3">
            <MiniStat label="Max Ride Distance" value={formatNumber(Math.round(data.maxRideDistance))} unit="mi" />
            <MiniStat label="Max Ride Elevation" value={formatNumber(Math.round(data.maxRideElevation))} unit="ft" />
            <MiniStat label="Max Ride Time" value={String(maxRideHours)} unit="hrs" />
            <MiniStat label="Avg Ride Speed" value={String(data.avgSpeed)} unit="mph" />
            <MiniStat label="Total Rides" value={String(data.totalRides)} unit="" />
            <MiniStat label="New KOMs" value={String(data.newKoms)} unit="" />
          </div>
        </div>

        {/* ── Everest Comparison ──────────────────── */}
        <div className="px-8 py-6">
          <EverestComparison multiplier={data.everestMultiplier} totalElevation={data.totalElevation} />
        </div>

        {/* ── Elevation Profile ──────────────────── */}
        <div className="px-8 pb-6">
          <ElevationProfile rides={data.rides} />
        </div>

        {/* ── Footer ─────────────────────────────── */}
        <div className="px-8 py-3 bg-[#12121f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Elevation</span>
          </div>
          <div className="text-xs text-slate-600">
            Data from Strava
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat display components ───────────────────────────────

function StatBlock({
  label,
  value,
  unit,
  dotted,
}: {
  label: string;
  value: string;
  unit: string;
  dotted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</span>
        {dotted && (
          <span className="flex-1 border-b border-dotted border-slate-700" />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl sm:text-4xl font-black text-white">{value}</span>
        <span className="text-sm font-semibold text-strava">{unit}</span>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
      <span className="text-[10px] leading-tight text-slate-400 uppercase tracking-wider font-medium">{label}</span>
      <div className="relative shrink-0">
        <span className="text-xl font-black text-white">{value}</span>
        {unit && (
          <span className="absolute top-[3px] left-full ml-px text-[10px] font-semibold text-strava">{unit}</span>
        )}
      </div>
    </div>
  );
}

// ── Activity Calendar (heatmap) ───────────────────────────

function ActivityCalendar({
  year,
  activeDates,
}: {
  year: number;
  activeDates: string[];
}) {
  const activeSet = useMemo(() => new Set(activeDates), [activeDates]);

  // Build weeks for the year — each week is an array of 7 days
  const weeks = useMemo(() => {
    const result: Array<Array<{ date: string; inMonth: boolean; active: boolean } | null>> = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    // Start from the first Monday of or before Jan 1
    const firstDay = new Date(startDate);
    const dayOfWeek = firstDay.getDay();
    // Adjust to Monday (day 1). Sunday is 0, so we go back accordingly.
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    firstDay.setDate(firstDay.getDate() - mondayOffset);

    let current = new Date(firstDay);
    while (current <= endDate || current.getDay() !== 1) {
      const week: typeof result[number] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = current.toISOString().slice(0, 10);
        const inYear = current.getFullYear() === year;
        week.push({
          date: dateStr,
          inMonth: inYear,
          active: activeSet.has(dateStr),
        });
        current.setDate(current.getDate() + 1);
      }
      result.push(week);
      if (current > endDate && current.getDay() === 1) break;
    }

    return result;
  }, [year, activeSet]);

  // Show month labels
  const monthLabels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <div className="flex flex-col items-center w-full">
      {/* Month labels */}
      <div className="flex w-full justify-between px-1 mb-1">
        {monthLabels.map((m, i) => (
          <span key={i} className="text-[7px] text-slate-600 font-medium">{m}</span>
        ))}
      </div>
      {/* Day labels + grid — use w-full and justify-center to contain within column */}
      <div className="flex gap-px justify-center w-full">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-px mr-0.5 shrink-0">
          {["M", "", "W", "", "F", "", "S"].map((d, i) => (
            <div key={i} className="w-[7px] h-[7px] flex items-center justify-center">
              <span className="text-[5px] text-slate-700 leading-none">{d}</span>
            </div>
          ))}
        </div>
        {/* Week columns */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-px">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-[7px] h-[7px] rounded-[1px] ${
                  !day || !day.inMonth
                    ? "bg-transparent"
                    : day.active
                    ? "bg-strava"
                    : "bg-slate-800"
                }`}
                title={day?.date}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Everest Comparison ────────────────────────────────────

function EverestComparison({
  multiplier,
  totalElevation,
}: {
  multiplier: number;
  totalElevation: number;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Mountains + text as one centered unit */}
      <svg viewBox="0 0 300 100" className="w-56 h-20 text-slate-600">
        <polygon points="40,100 80,20 120,100" fill="currentColor" opacity="0.6" />
        <polygon points="90,100 140,10 190,100" fill="currentColor" opacity="0.8" />
        <polygon points="160,100 200,25 240,100" fill="currentColor" opacity="0.5" />
        {/* Snow caps */}
        <polygon points="130,25 140,10 150,25" fill="#e2e8f0" opacity="0.6" />
        <polygon points="72,32 80,20 88,32" fill="#e2e8f0" opacity="0.5" />
        <polygon points="192,37 200,25 208,37" fill="#e2e8f0" opacity="0.5" />
      </svg>
      <div className="text-center mt-1">
        <div className="text-4xl font-black text-white">
          {multiplier}
          <span className="text-lg text-slate-400">x</span>
        </div>
        <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Up Everest</div>
        <div className="text-xs text-slate-600 mt-0.5">
          {formatNumber(Math.round(totalElevation))} ft total
        </div>
      </div>
    </div>
  );
}

// ── Elevation Profile Chart ───────────────────────────────

function ElevationProfile({
  rides,
}: {
  rides: Array<{ date: string; distance: number; elevation: number }>;
}) {
  if (rides.length === 0) return null;

  // Build cumulative distance on X axis, elevation per ride on Y
  const chartData = useMemo(() => {
    let cumDistance = 0;
    return rides.map((r) => {
      cumDistance += r.distance;
      return {
        cumDistance: Math.round(cumDistance * 10) / 10,
        elevation: r.elevation,
        date: r.date,
        distance: r.distance,
      };
    });
  }, [rides]);

  return (
    <div>
      <div className="text-xs text-slate-600 uppercase tracking-wider font-medium mb-2 flex items-center justify-between">
        <span>Elevation Profile</span>
        <span>Distance</span>
      </div>
      <div style={{ width: "100%", height: 96 }}>
        <ResponsiveContainer width="100%" height={96}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fc4c02" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#fc4c02" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <XAxis dataKey="cumDistance" hide />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(v) => `${v} mi cumulative`}
              formatter={(value: number, name: string) => {
                if (name === "elevation") return [`${formatNumber(value)} ft`, "Elevation"];
                return [value, name];
              }}
            />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="#fc4c02"
              strokeWidth={1.5}
              fill="url(#elevGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
