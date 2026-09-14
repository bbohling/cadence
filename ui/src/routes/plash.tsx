import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Crown } from "lucide-react";
import {
  fetchCurrentKomStats,
  fetchInfographicStats,
  fetchRecentRides,
  type InfographicStats,
} from "@/lib/api";
import { useEnsureFresh } from "@/hooks/use-ensure-fresh";
import { ActivityCalendar } from "@/components/ui/activity-calendar";
import { formatNumber, formatRideDay, parseLocalDate } from "@/lib/utils";

/**
 * Plash page — yearly highlights as a desktop wallpaper.
 *
 * Hidden route (/plash): not in the nav, no app chrome. Built for Plash
 * (https://sindresorhus.com/plash), which renders a URL full-screen behind
 * the desktop icons, so:
 *
 *   - Fills the viewport exactly, no scrolling; type scales with the screen
 *   - Non-interactive — no tooltips or hover states, nothing to click
 *   - Refetches on its own every 30 minutes and ticks the clock every minute,
 *     so it stays current without Plash's reload setting
 *   - No chart animation, to keep an always-on page cheap
 *
 * Query params:
 *   ?year=2025  — show a past year (compared against the year before, in full)
 */

const USER_ID = "brandon";
const REFRESH_MS = 30 * 60 * 1000;

const THIS_YEAR_COLOR = "#fc4c02"; // strava
const LAST_YEAR_COLOR = "#64748b"; // slate-500 — recessive reference line
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PlashPage() {
  useEnsureFresh(USER_ID);
  const now = useNow(60_000);

  const currentYear = now.getFullYear();
  const year = useMemo(() => {
    const param = Number(new URLSearchParams(window.location.search).get("year"));
    return param >= 2000 && param <= currentYear ? param : currentYear;
  }, [currentYear]);
  const isCurrentYear = year === currentYear;

  const live = {
    refetchInterval: REFRESH_MS,
    // Plash's window is never "focused"; keep polling regardless
    refetchIntervalInBackground: true,
  };

  const stats = useQuery({
    queryKey: ["infographic", USER_ID, year],
    queryFn: () => fetchInfographicStats(USER_ID, year),
    ...(isCurrentYear ? live : { staleTime: Infinity }),
  });

  // The previous year is finished — fetch once
  const previous = useQuery({
    queryKey: ["infographic", USER_ID, year - 1],
    queryFn: () => fetchInfographicStats(USER_ID, year - 1),
    staleTime: Infinity,
  });

  const koms = useQuery({
    queryKey: ["kom-current-stats", USER_ID],
    queryFn: () => fetchCurrentKomStats(USER_ID),
    ...live,
  });

  const lastRide = useQuery({
    queryKey: ["recent-rides", USER_ID, 1],
    queryFn: () => fetchRecentRides(USER_ID, 1),
    ...live,
  });

  if (!stats.data) {
    return (
      <Screen>
        <div className="m-auto text-slate-600 text-[1.6vmin]">
          {stats.error ? "Couldn't reach Cadence — retrying." : "Loading…"}
        </div>
      </Screen>
    );
  }

  return (
    <Highlights
      data={stats.data}
      previous={previous.data}
      isCurrentYear={isCurrentYear}
      now={now}
      currentKoms={koms.data?.byRank["1"] ?? null}
      lastRide={lastRide.data?.[0]}
      updatedAt={stats.dataUpdatedAt}
    />
  );
}

// ── Layout ─────────────────────────────────────────────────

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04060c] text-slate-100 flex flex-col px-[5vmin] py-[4.5vmin] gap-[3.5vmin] select-none cursor-default">
      {children}
    </div>
  );
}

function Highlights({
  data,
  previous,
  isCurrentYear,
  now,
  currentKoms,
  lastRide,
  updatedAt,
}: {
  data: InfographicStats;
  previous: InfographicStats | undefined;
  isCurrentYear: boolean;
  now: Date;
  currentKoms: number | null;
  lastRide: import("@/lib/api").RecentRide | undefined;
  updatedAt: number;
}) {
  // Compare against last year through the same calendar day ("MM-DD"),
  // or the whole year when looking back at a finished one.
  const cutoff = isCurrentYear ? toMonthDay(now) : "12-31";

  const prevToDate = useMemo(() => {
    if (!previous) return null;
    const upTo = previous.rides.filter((r) => r.date.slice(5) <= cutoff);
    return {
      distance: sum(upTo.map((r) => r.distance)),
      elevation: sum(upTo.map((r) => r.elevation)),
      rides: upTo.length,
    };
  }, [previous, cutoff]);

  const daysInYear = isLeap(data.year) ? 366 : 365;
  const dayOfYear = isCurrentYear ? dayOfYearOf(now) : daysInYear;
  const projectedMiles = isCurrentYear && dayOfYear > 0
    ? (data.totalDistance / dayOfYear) * daysInYear
    : null;

  const throughLabel = isCurrentYear
    ? `Through ${now.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "Full year";

  return (
    <Screen>
      {/* ── Header ─────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div className="flex items-baseline gap-[2vmin]">
          <h1 className="text-[7vmin] leading-none font-black tracking-tight tabular-nums">{data.year}</h1>
          <span className="text-[1.8vmin] uppercase tracking-[0.2em] text-slate-500 font-semibold">
            {throughLabel}
          </span>
        </div>
        <div className="text-right text-[1.3vmin] text-slate-600 leading-relaxed">
          <div className="uppercase tracking-[0.25em] font-semibold text-slate-500">Cadence</div>
          <div className="tabular-nums">
            Updated {new Date(updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </header>

      {/* ── Hero numbers ───────────────────────────── */}
      <section className="grid grid-cols-4 gap-[3vmin]">
        <Hero
          label="Miles"
          value={formatNumber(data.totalDistance, 0)}
          delta={pctChange(data.totalDistance, prevToDate?.distance)}
          year={data.year - 1}
          note={projectedMiles ? `On pace for ${formatNumber(roundTo(projectedMiles, 50), 0)}` : null}
        />
        <Hero
          label="Climbing"
          value={formatNumber(data.totalElevation, 0)}
          unit="ft"
          delta={pctChange(data.totalElevation, prevToDate?.elevation)}
          year={data.year - 1}
          note={`${data.everestMultiplier}× Everest`}
        />
        <Hero
          label="Rides"
          value={String(data.totalRides)}
          delta={pctChange(data.totalRides, prevToDate?.rides)}
          year={data.year - 1}
          note={`${data.activeDays} days on the bike`}
        />
        <Hero
          label="Saddle Time"
          value={formatNumber(data.totalMovingTime / 3600, 0)}
          unit="hrs"
          note={`${formatNumber(data.totalMovingTime / 3600 / (dayOfYear / 7), 1)} hrs per week`}
        />
      </section>

      {/* ── Cumulative miles vs last year ──────────── */}
      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-[1vmin]">
          <SectionLabel>Cumulative miles</SectionLabel>
          <div className="flex items-center gap-[2.5vmin] text-[1.3vmin] text-slate-400">
            <LegendKey color={THIS_YEAR_COLOR} label={String(data.year)} />
            {previous && <LegendKey color={LAST_YEAR_COLOR} label={String(previous.year)} dashed />}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <CumulativeChart data={data} previous={previous} throughDay={dayOfYear} />
        </div>
      </section>

      {/* ── Calendar + records ─────────────────────── */}
      <section className="grid grid-cols-[3fr_2fr] gap-[5vmin] items-end">
        <div>
          <div className="flex items-baseline justify-between mb-[1.2vmin]">
            <SectionLabel>Ride days</SectionLabel>
            <span className="text-[1.3vmin] text-slate-500 tabular-nums">
              {data.activeDays} of {dayOfYear} days · {Math.round((data.activeDays / Math.max(dayOfYear, 1)) * 100)}%
            </span>
          </div>
          <ActivityCalendar year={data.year} activeDates={data.activeDates} large />
        </div>

        <div className="grid grid-cols-2 gap-x-[3vmin] gap-y-[2.2vmin]">
          <Record label="Longest ride" value={formatNumber(data.maxRideDistance, 1)} unit="mi" />
          <Record label="Biggest climb" value={formatNumber(data.maxRideElevation, 0)} unit="ft" />
          <Record label="Longest streak" value={String(data.maxStreak)} unit={data.maxStreak === 1 ? "day" : "days"} />
          <Record
            label="Current KOMs"
            value={currentKoms === null ? "—" : String(currentKoms)}
            icon={<Crown className="w-[1.6vmin] h-[1.6vmin] text-gold" />}
          />
          {lastRide && isCurrentYear && (
            <div className="col-span-2 border-t border-slate-800/80 pt-[1.8vmin]">
              <SectionLabel>Last ride</SectionLabel>
              <div className="mt-[0.6vmin] flex items-baseline gap-[1.5vmin] text-[1.7vmin] min-w-0">
                <span className="text-slate-200 font-semibold truncate">{lastRide.name ?? "Ride"}</span>
                <span className="text-slate-500 shrink-0">{formatRideDay(parseLocalDate(lastRide.startDateLocal), now)}</span>
                <span className="ml-auto shrink-0 text-slate-400 tabular-nums">
                  {formatNumber(lastRide.distance, 1)} mi · {formatNumber(lastRide.elevation, 0)} ft
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </Screen>
  );
}

// ── Pieces ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[1.3vmin] uppercase tracking-[0.2em] text-slate-500 font-semibold">{children}</h2>
  );
}

function Hero({
  label,
  value,
  unit,
  delta,
  year,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Percent change vs last year to date; null/undefined hides the line */
  delta?: number | null;
  year?: number;
  note?: string | null;
}) {
  const up = (delta ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="min-w-0 border-l-2 border-slate-800 pl-[2vmin]">
      <div className="text-[1.4vmin] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-[0.6vmin] flex items-baseline gap-[0.8vmin] whitespace-nowrap">
        <span className="text-[min(8vmin,4.4vw)] leading-none font-black tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-[2.4vmin] font-bold text-slate-500">{unit}</span>}
      </div>
      <div className="mt-[1vmin] space-y-[0.3vmin] text-[1.6vmin] text-slate-400 tabular-nums">
        {delta != null && Number.isFinite(delta) && (
          <div className="flex items-center gap-[0.5vmin]">
            <Arrow className={`w-[1.9vmin] h-[1.9vmin] ${up ? "text-brand-400" : "text-slate-500"}`} />
            <span>
              {Math.abs(Math.round(delta))}% {up ? "ahead of" : "behind"} {year}
            </span>
          </div>
        )}
        {note && <div className="text-slate-500">{note}</div>}
      </div>
    </div>
  );
}

function Record({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-[0.4vmin] flex items-baseline gap-[0.6vmin]">
        {icon && <span className="self-center">{icon}</span>}
        <span className="text-[3.6vmin] leading-none font-extrabold tabular-nums text-slate-100">{value}</span>
        {unit && <span className="text-[1.6vmin] font-semibold text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-[0.8vmin]">
      <svg width="24" height="4" className="w-[2.6vmin] h-[0.4vmin]" viewBox="0 0 24 4" preserveAspectRatio="none">
        <line x1="0" y1="2" x2="24" y2="2" stroke={color} strokeWidth="4" strokeDasharray={dashed ? "5 4" : undefined} />
      </svg>
      {label}
    </span>
  );
}

// ── Chart ──────────────────────────────────────────────────

function CumulativeChart({
  data,
  previous,
  throughDay,
}: {
  data: InfographicStats;
  previous: InfographicStats | undefined;
  /** Last day-of-year (1-based) to draw for the selected year */
  throughDay: number;
}) {
  // One point per calendar day of the selected year, keyed by "MM-DD" so
  // last year lines up by date rather than by day index.
  const { points, monthTicks } = useMemo(() => {
    const byDay = (rides: InfographicStats["rides"]) => {
      const m = new Map<string, number>();
      for (const r of rides) {
        const key = r.date.slice(5);
        m.set(key, (m.get(key) ?? 0) + r.distance);
      }
      return m;
    };
    const current = byDay(data.rides);
    const prior = previous ? byDay(previous.rides) : null;

    const points: Array<{ day: number; current: number | null; previous: number | null }> = [];
    const monthTicks: number[] = [];
    let cur = 0;
    let prev = 0;
    const d = new Date(data.year, 0, 1);
    for (let day = 1; d.getFullYear() === data.year; day++, d.setDate(d.getDate() + 1)) {
      const key = toMonthDay(d);
      if (d.getDate() === 1) monthTicks.push(day);
      cur += current.get(key) ?? 0;
      prev += prior?.get(key) ?? 0;
      points.push({
        day,
        current: day <= throughDay ? Math.round(cur) : null,
        previous: prior ? Math.round(prev) : null,
      });
    }
    return { points, monthTicks };
  }, [data, previous, throughDay]);

  const today = points[Math.min(throughDay, points.length) - 1];
  const axisTick = { fill: "#475569", fontSize: "max(11px, 1.2vmin)" };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 28, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#1e293b" strokeOpacity={0.6} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[1, points.length]}
          ticks={monthTicks}
          tickFormatter={(day: number) => MONTHS[monthTicks.indexOf(day)] ?? ""}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: "#1e293b" }}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatNumber(v, 0)}
        />
        {previous && (
          <Line
            dataKey="previous"
            stroke={LAST_YEAR_COLOR}
            strokeWidth={2}
            strokeDasharray="6 5"
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          dataKey="current"
          stroke={THIS_YEAR_COLOR}
          strokeWidth={3}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        {today && throughDay < points.length && (
          <ReferenceLine x={today.day} stroke="#334155" strokeDasharray="2 4" />
        )}
        {/* Direct labels at "today". Each sits on the side away from the other
            line, so the two never collide whichever year is ahead. */}
        {today?.previous != null && throughDay < points.length && (
          <ReferenceDot
            x={today.day}
            y={today.previous}
            r={4}
            fill={LAST_YEAR_COLOR}
            stroke="#04060c"
            strokeWidth={2}
            label={pointLabel(
              `${previous?.year}: ${formatNumber(today.previous, 0)}`,
              (today.current ?? 0) > today.previous ? "below" : "above",
              "#94a3b8",
              400
            )}
          />
        )}
        {today?.current != null && (
          <ReferenceDot
            x={today.day}
            y={today.current}
            r={5}
            fill={THIS_YEAR_COLOR}
            stroke="#04060c"
            strokeWidth={2}
            label={pointLabel(
              `${data.year}: ${formatNumber(today.current, 0)}`,
              today.previous == null || today.current >= today.previous ? "above" : "below",
              "#e2e8f0",
              600
            )}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Recharts label renderer: text just left of a point, above or below it */
function pointLabel(text: string, side: "above" | "below", fill: string, fontWeight: number) {
  return function PointLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
    const x = viewBox?.x ?? 0;
    const y = viewBox?.y ?? 0;
    return (
      <text
        x={x - 10}
        y={side === "above" ? y - 12 : y + 22}
        textAnchor="end"
        fill={fill}
        fontWeight={fontWeight}
        style={{ fontSize: "max(12px, 1.4vmin)" }}
        className="tabular-nums"
      >
        {text}
      </text>
    );
  };
}

// ── Helpers ────────────────────────────────────────────────

/** Re-render on an interval so date labels roll over on a wall display */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function toMonthDay(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfYearOf(d: Date): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86_400_000) + 1;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function pctChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
