import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchYearOverYear,
  fetchYearlyStats,
  fetchKoms,
} from "@/lib/api";
import { formatNumber, formatDuration, formatTime, cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";

/**
 * ASCII/Pixels Dashboard — terminal-style display of cycling data.
 *
 * This is a retro-themed alternative view that uses monospace fonts,
 * ASCII-style progress bars, and terminal aesthetics. Features:
 *
 *   - Dark/light theme toggle
 *   - ASCII progress bars for year comparison
 *   - Text-based yearly stats
 *   - Monospace KOM table
 *   - CRT-style scanline effects (subtle)
 *
 * Mobile: progress bars drop to their own line under the label, and the
 * tables lose their least important column rather than scrolling sideways.
 */

const USER_ID = "brandon";
const PAGE_SIZE = 15;

export function PixelsPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div
      className={cn(
        "font-mono text-sm transition-colors duration-300 animate-fade-in",
        theme === "dark"
          ? "text-green-400"
          : "text-slate-800 bg-slate-100 -mx-3 px-3 py-4 sm:mx-0 sm:px-6 sm:rounded-xl"
      )}
    >
      {/* Theme toggle */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium border transition-colors",
            theme === "dark"
              ? "border-green-800 text-green-400 hover:bg-green-900/30"
              : "border-slate-300 text-slate-600 hover:bg-slate-100"
          )}
        >
          {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          {theme === "dark" ? "LIGHT" : "DARK"}
        </button>
      </div>

      {/* Scanline overlay (dark mode only) */}
      {theme === "dark" && (
        <div className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,0,0.03)_2px,rgba(0,255,0,0.03)_4px)]" />
      )}

      <div className="space-y-6">
        <AsciiHeader />
        <AsciiProgressBars theme={theme} />
        <AsciiYearlyStats theme={theme} />
        <AsciiKomTable theme={theme} />
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────

const HEADER_WIDTH = 38;

/** Pad a line to the inside width of the header box */
const boxLine = (text: string) => `║  ${text.padEnd(HEADER_WIDTH - 2).slice(0, HEADER_WIDTH - 2)}║`;

function AsciiHeader() {
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <pre className="text-[11px] sm:text-xs leading-tight overflow-x-auto">
{[
  `╔${"═".repeat(HEADER_WIDTH)}╗`,
  boxLine("CADENCE // CYCLING DASHBOARD"),
  boxLine("================================"),
  boxLine(date),
  `╚${"═".repeat(HEADER_WIDTH)}╝`,
].join("\n")}
    </pre>
  );
}

// ── Progress Bars ──────────────────────────────────────

function AsciiProgressBars({ theme }: { theme: "dark" | "light" }) {
  const { data } = useQuery({
    queryKey: ["year-over-year", USER_ID],
    queryFn: () => fetchYearOverYear(USER_ID),
  });

  if (!data || data.length < 2) return null;

  const current = data[0]!;
  const lastYear = data[1]!;

  const metrics = [
    { label: "MILES", curr: current.distance, prev: lastYear.distance, fmt: (n: number) => formatNumber(n, 0) },
    { label: "RIDES", curr: current.rides, prev: lastYear.rides, fmt: (n: number) => String(n) },
    { label: "CLIMB", curr: current.elevation, prev: lastYear.elevation, fmt: (n: number) => `${formatNumber(n, 0)}ft` },
    { label: "CALS ", curr: current.calories, prev: lastYear.calories, fmt: (n: number) => formatNumber(n, 0) },
    { label: "TIME ", curr: current.movingTime, prev: lastYear.movingTime, fmt: (n: number) => formatDuration(n) },
  ];

  const barWidth = 30;

  return (
    <div className={cn(
      "p-4 rounded-lg border",
      theme === "dark" ? "border-green-800 bg-black/30" : "border-slate-300 bg-white"
    )}>
      <div className="text-xs mb-2 opacity-60">
        ── {current.year} vs {lastYear.year} (through {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}) ──
      </div>
      <div className="space-y-3 sm:space-y-2">
        {metrics.map(({ label, curr, prev, fmt }) => {
          const pct = prev > 0 ? Math.min((curr / prev) * 100, 150) : 0;
          const filled = Math.round((pct / 150) * barWidth);
          const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

          return (
            <div key={label} className="flex flex-wrap items-baseline gap-x-2 whitespace-pre">
              <span className="opacity-60">{label}</span>
              <span className="order-last basis-full text-xs sm:text-sm sm:order-none sm:basis-auto">
                [{bar}]<span className="opacity-60"> {Math.round(pct)}%</span>
              </span>
              <span className="ml-auto sm:ml-0">
                {fmt(curr)}<span className="opacity-40"> / {fmt(prev)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Yearly Stats ───────────────────────────────────────

function AsciiYearlyStats({ theme }: { theme: "dark" | "light" }) {
  const { data } = useQuery({
    queryKey: ["yearly-stats", USER_ID],
    queryFn: () => fetchYearlyStats(USER_ID),
  });

  if (!data?.length) return null;

  return (
    <div className={cn(
      "p-4 rounded-lg border",
      theme === "dark" ? "border-green-800 bg-black/30" : "border-slate-300 bg-white"
    )}>
      <div className="text-xs mb-2 opacity-60">── OVER THE YEARS ──</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="opacity-60 border-b border-dashed border-current">
              <th className="text-left pr-3 sm:pr-4 pb-1">YEAR</th>
              <th className="text-right pr-3 sm:pr-4 pb-1">MILES</th>
              <th className="text-right pr-3 sm:pr-4 pb-1">RIDES</th>
              <th className="text-right pr-3 sm:pr-4 pb-1">CLIMB</th>
              <th className="text-right pr-4 pb-1 hidden sm:table-cell">CALS</th>
              <th className="text-right pb-1">TIME</th>
            </tr>
          </thead>
          <tbody>
            {data.map((year) => (
              <tr key={year.year}>
                <td className="pr-3 sm:pr-4 pt-1">{year.year}</td>
                <td className="text-right pr-3 sm:pr-4 tabular-nums">{formatNumber(year.totalDistance, 0)}</td>
                <td className="text-right pr-3 sm:pr-4 tabular-nums">{year.totalRides}</td>
                <td className="text-right pr-3 sm:pr-4 tabular-nums">{formatNumber(year.totalElevation, 0)}</td>
                <td className="text-right pr-4 tabular-nums hidden sm:table-cell">{formatNumber(year.totalCalories, 0)}</td>
                <td className="text-right tabular-nums">{formatDuration(year.totalMovingTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KOM Table ──────────────────────────────────────────

function AsciiKomTable({ theme }: { theme: "dark" | "light" }) {
  const [page, setPage] = useState(0);

  const { data } = useQuery({
    queryKey: ["koms", USER_ID, page],
    queryFn: () => fetchKoms(USER_ID, PAGE_SIZE, page * PAGE_SIZE),
  });

  if (!data?.data.length) return null;

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  const rankSymbol = (rank: number): string => {
    if (rank === 1) return "♔";
    if (rank === 2) return "♕";
    if (rank === 3) return "♖";
    return `${rank}`;
  };

  return (
    <div className={cn(
      "p-4 rounded-lg border",
      theme === "dark" ? "border-green-800 bg-black/30" : "border-slate-300 bg-white"
    )}>
      <div className="text-xs mb-2 opacity-60">── KOM ACHIEVEMENTS ({data.total} total) ──</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="opacity-60 border-b border-dashed border-current">
              <th className="text-center pr-2 pb-1">RK</th>
              <th className="text-left pr-3 sm:pr-4 pb-1">SEGMENT</th>
              <th className="text-right pr-0 sm:pr-4 pb-1">TIME</th>
              <th className="text-right pb-1 hidden sm:table-cell">DATE</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((kom) => (
              <tr key={kom.id}>
                <td className="text-center pr-2 pt-1">{rankSymbol(kom.komRank)}</td>
                {/* w-full + max-w-0 lets truncate work inside an auto-layout table */}
                <td className="pr-3 sm:pr-4 w-full max-w-0">
                  <div className="truncate">{kom.segmentName}</div>
                </td>
                <td className="text-right pr-0 sm:pr-4 tabular-nums">{formatTime(kom.elapsedTime)}</td>
                <td className="text-right tabular-nums opacity-60 hidden sm:table-cell">
                  {new Date(kom.startDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-1 border-t border-dashed border-current/30 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="py-2 pr-2 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20"
          >
            [&lt; PREV]
          </button>
          <span className="opacity-40">PAGE {page + 1}/{totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="py-2 pl-2 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20"
          >
            [NEXT &gt;]
          </button>
        </div>
      )}
    </div>
  );
}
