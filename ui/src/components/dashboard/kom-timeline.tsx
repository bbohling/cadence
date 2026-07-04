import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchKoms, type KomAchievement } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

/**
 * KOM Timeline — paginated table of KOM achievements.
 *
 * Shows segment name, activity name, time, rank, and date.
 * Rank is displayed with medal colors (gold/silver/bronze).
 */

const USER_ID = "brandon";
const PAGE_SIZE = 15;

export function KomTimeline() {
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["koms", USER_ID, page],
    queryFn: () => fetchKoms(USER_ID, PAGE_SIZE, page * PAGE_SIZE),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>KOM Achievements</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-96 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !data?.data.length) {
    return (
      <Card>
        <CardHeader><CardTitle>KOM Achievements</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No KOMs found.</p>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-gold" />
          KOM Achievements
          <span className="text-slate-500 font-normal text-xs normal-case tracking-normal">
            ({data.total} total)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Table */}
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Segment
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                  Activity
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="text-right px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((kom) => (
                <KomRow key={kom.id} kom={kom} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                page === 0
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            <span className="text-xs text-slate-500 tabular-nums">
              Page {page + 1} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                page >= totalPages - 1
                  ? "text-slate-600 cursor-not-allowed"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KomRow({ kom }: { kom: KomAchievement }) {
  const rankColors: Record<number, string> = {
    1: "text-gold",
    2: "text-silver",
    3: "text-bronze",
  };

  const formattedDate = new Date(kom.startDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
      <td className="px-5 py-2.5">
        <div className="font-medium text-white truncate max-w-[200px] sm:max-w-none">
          {kom.segmentName}
        </div>
        {kom.segmentCity && (
          <div className="text-xs text-slate-500 mt-0.5">
            {kom.segmentCity}{kom.segmentState ? `, ${kom.segmentState}` : ""}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-400 truncate max-w-[180px] hidden sm:table-cell">
        {kom.activityName ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">
        {formatTime(kom.elapsedTime)}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
            rankColors[kom.komRank] ?? "text-slate-400",
            kom.komRank <= 3 ? "bg-slate-800" : ""
          )}
        >
          {kom.komRank}
        </span>
      </td>
      <td className="px-5 py-2.5 text-right text-slate-500 text-xs tabular-nums hidden md:table-cell">
        {formattedDate}
      </td>
    </tr>
  );
}
