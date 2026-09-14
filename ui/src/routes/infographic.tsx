import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronLeft, ChevronRight, Download, Bike } from "lucide-react";
import { fetchInfographicStats, fetchInfographicYears } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityCalendar } from "@/components/ui/activity-calendar";
import { formatNumber } from "@/lib/utils";

/**
 * Year-in-Review Infographic page.
 *
 * Generates a VeloViewer-style visual summary for a selected year.
 * Shows totals, maxima, active day calendar, Everest comparison,
 * and an elevation profile chart.
 *
 * Desktop keeps the three-column poster layout. Mobile stacks it: totals in
 * a row, the calendar full width (cells scale to fit), per-ride stats in two
 * columns.
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
    <div className="flex flex-col items-center gap-4 sm:gap-6 animate-fade-in">
      {/* ── Year Selector ──────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={() => setSelectedYear((y) => y + 1)}
          disabled={!canGoPrev}
          className="p-3 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
          className="p-3 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
      <div className="hidden sm:flex justify-end mb-2">
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
        className="bg-[#1a1a2e] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/30 transition-all"
      >
        {/* ── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between px-5 sm:px-8 pt-5 sm:pt-8 pb-2 sm:pb-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-xl sm:text-2xl font-bold text-white uppercase">
              {data.athleteName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-wide uppercase truncate">
                {data.athleteName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">Year in Review — {data.year}</p>
            </div>
          </div>
          <Bike className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 text-slate-500" />
        </div>

        {/* ── Stats Grid ─────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
          {/* Left column — totals (a single row on mobile) */}
          <div className="md:col-span-3 px-5 md:px-6 py-4 grid grid-cols-3 md:grid-cols-1 gap-3 md:gap-6 content-start">
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
          <div className="md:col-span-6 px-5 md:px-3 py-4 overflow-hidden border-y border-slate-800/60 md:border-0">
            <div className="text-center mb-3 md:mb-2">
              <div className="flex items-baseline justify-center gap-8 md:gap-6">
                <div>
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-medium">Active Days</div>
                  <div className="text-3xl sm:text-4xl font-black text-white">{data.activeDays}</div>
                </div>
                <div>
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-medium">Max Streak</div>
                  <div className="text-3xl sm:text-4xl font-black text-white">{data.maxStreak}</div>
                </div>
              </div>
            </div>
            <ActivityCalendar year={data.year} activeDates={data.activeDates} className="max-w-md md:max-w-none mx-auto" />
          </div>

          {/* Right column — per-ride stats (two columns on mobile) */}
          <div className="md:col-span-3 px-5 md:pl-4 md:pr-8 py-4 grid grid-cols-2 md:grid-cols-1 gap-x-5 gap-y-3 content-start">
            <MiniStat label="Max Ride Distance" value={formatNumber(Math.round(data.maxRideDistance))} unit="mi" />
            <MiniStat label="Max Ride Elevation" value={formatNumber(Math.round(data.maxRideElevation))} unit="ft" />
            <MiniStat label="Max Ride Time" value={String(maxRideHours)} unit="hrs" />
            <MiniStat label="Avg Ride Speed" value={String(data.avgSpeed)} unit="mph" />
            <MiniStat label="Total Rides" value={String(data.totalRides)} unit="" />
            <MiniStat label="New KOMs" value={String(data.newKoms)} unit="" />
          </div>
        </div>

        {/* ── Everest Comparison ──────────────────── */}
        <div className="px-5 sm:px-8 py-4 sm:py-6">
          <EverestComparison multiplier={data.everestMultiplier} totalElevation={data.totalElevation} />
        </div>

        {/* ── Elevation Profile ──────────────────── */}
        <div className="px-5 sm:px-8 pb-5 sm:pb-6">
          <ElevationProfile rides={data.rides} />
        </div>

        {/* ── Footer ─────────────────────────────── */}
        <div className="px-5 sm:px-8 py-3 bg-[#12121f] flex items-center justify-between">
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
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] sm:text-xs leading-tight text-slate-500 uppercase tracking-wider font-medium">{label}</span>
        {dotted && (
          <span className="hidden md:block flex-1 border-b border-dotted border-slate-700" />
        )}
      </div>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-xl sm:text-3xl lg:text-4xl font-black text-white tabular-nums">{value}</span>
        <span className="text-xs sm:text-sm font-semibold text-strava">{unit}</span>
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
      <div className="relative shrink-0 flex items-start">
        <span className="text-xl font-black text-white">{value}</span>
        {/* Unit hangs past the edge on md+ so values right-align; inline on mobile where there's no room */}
        {unit && (
          <span className="mt-[3px] ml-px md:absolute md:top-0 md:left-full text-[10px] font-semibold text-strava">{unit}</span>
        )}
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

  // After the hook, so hook order stays stable when a year has no rides
  if (rides.length === 0) return null;

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
              formatter={(value, name) => {
                if (name === "elevation")
                  return [`${formatNumber(Number(value ?? 0))} ft`, "Elevation"];
                return [value ?? 0, name];
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
