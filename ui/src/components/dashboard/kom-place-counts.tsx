import { useQuery } from "@tanstack/react-query";
import { fetchKomStats } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Medal } from "lucide-react";

/**
 * KOM Historic Rankings — horizontal bars showing KOM distribution by rank.
 *
 * Shows unique segments where the user held 1st, 2nd, 3rd place at the
 * time each activity was synced from Strava. These are frozen at sync time
 * and may not reflect current leaderboard standings.
 *
 * Counts are per unique segment (best rank across all efforts on that segment).
 */

const USER_ID = "brandon";

/** Bar colors for podium ranks */
const RANK_STYLES: Record<string, { color: string; label: string }> = {
  "1": { color: "bg-gradient-to-r from-yellow-600 to-yellow-400", label: "KOMs" },
  "2": { color: "bg-gradient-to-r from-slate-500 to-slate-300", label: "2nd place" },
  "3": { color: "bg-gradient-to-r from-amber-700 to-amber-500", label: "3rd place" },
};

export function KomPlaceCounts() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["kom-stats", USER_ID],
    queryFn: () => fetchKomStats(USER_ID),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>KOM Rankings</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !data || data.total === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>KOM Rankings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No KOM data available.</p>
        </CardContent>
      </Card>
    );
  }

  const podiumRanks = ["1", "2", "3"]
    .filter((r) => data.byRank[r] != null)
    .map((r) => [r, data.byRank[r]!] as const);
  const maxCount = Math.max(...podiumRanks.map(([, count]) => count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Medal className="w-4 h-4 text-gold shrink-0" />
          KOM Historic Rankings
          <span className="hidden sm:inline text-slate-500 font-normal text-xs normal-case tracking-normal">
            (at time of sync)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Podium bars: 1st, 2nd, 3rd */}
          {podiumRanks.map(([rank, count]) => {
            const style = RANK_STYLES[rank]!;
            const width = (count / maxCount) * 100;

            return (
              <div key={rank} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-400 w-20 text-right tabular-nums">
                  {style.label}
                </span>
                <div className="flex-1 h-6 bg-slate-800/50 rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded transition-all duration-300",
                      style.color
                    )}
                    style={{ width: `${Math.max(width, 2)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-white w-10 text-right tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}

          {/* Cumulative stats */}
          <div className="border-t border-slate-700/50 pt-2 mt-3 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400 w-20 text-right">Top 5s</span>
              <span className="text-sm font-semibold text-white tabular-nums">{data.top5}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400 w-20 text-right">Top 10s</span>
              <span className="text-sm font-semibold text-white tabular-nums">{data.top10}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
