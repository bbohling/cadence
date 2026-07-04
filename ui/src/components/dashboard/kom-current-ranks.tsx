import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentKomStats,
  triggerKomRefresh,
  fetchKomRefreshStatus,
} from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Crown, RefreshCw } from "lucide-react";

/**
 * KOM Current Rankings — shows segments where the athlete currently
 * holds the KOM (1st place), refreshed daily from the Strava API.
 *
 * NOTE: The Strava API only provides current data for 1st place (KOMs).
 * For broader rankings (2nd, 3rd, top 5, top 10), see the Historic
 * Rankings card which uses the rank recorded at sync time.
 *
 * The refresh runs in the background (~10s) and the UI polls for
 * completion, then auto-updates.
 */

const USER_ID = "brandon";
const POLL_INTERVAL_MS = 3000;

export function KomCurrentRanks() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["kom-current-stats", USER_ID],
    queryFn: () => fetchCurrentKomStats(USER_ID),
  });

  // Poll refresh status while a refresh is in progress
  const { data: refreshStatus } = useQuery({
    queryKey: ["kom-refresh-status", USER_ID],
    queryFn: () => fetchKomRefreshStatus(USER_ID),
    refetchInterval: isRefreshing ? POLL_INTERVAL_MS : false,
    enabled: isRefreshing,
  });

  // When polling detects refresh is done, update stats
  useEffect(() => {
    if (isRefreshing && refreshStatus && !refreshStatus.running) {
      setIsRefreshing(false);
      queryClient.invalidateQueries({ queryKey: ["kom-current-stats"] });
    }
  }, [isRefreshing, refreshStatus, queryClient]);

  const refreshMutation = useMutation({
    mutationFn: () => triggerKomRefresh(USER_ID),
    onSuccess: () => {
      setIsRefreshing(true);
    },
  });

  const handleRefresh = () => {
    if (!isRefreshing && !refreshMutation.isPending) {
      refreshMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Current KOMs</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const komCount = data?.byRank?.["1"] ?? 0;
  const hasData = data && data.total > 0;

  const lastCheckedDate = data?.lastChecked
    ? new Date(data.lastChecked).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-yellow-400" />
          Current KOMs
          <span className="text-slate-500 font-normal text-xs normal-case tracking-normal">
            (live from Strava)
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || refreshMutation.isPending}
            className="ml-auto p-1.5 rounded-md hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-white disabled:opacity-50"
            title={isRefreshing ? "Refresh in progress..." : "Refresh KOMs from Strava"}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Refreshing banner */}
        {isRefreshing && (
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-blue-300">
              Refreshing from Strava...
            </p>
          </div>
        )}

        {hasData ? (
          <div className="space-y-3">
            {/* Big KOM count */}
            <div className="flex items-center justify-center py-2">
              <span className="text-6xl font-bold text-yellow-400 tabular-nums">
                {komCount}
              </span>
            </div>

            {/* Last checked */}
            {lastCheckedDate && (
              <p className="text-xs text-slate-500">
                Last updated: {lastCheckedDate}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center space-y-3 py-2">
            <p className="text-slate-500 text-sm">
              {isRefreshing
                ? "Fetching current KOMs from Strava..."
                : "No current KOM data yet."}
            </p>
            {!isRefreshing && (
              <button
                onClick={handleRefresh}
                disabled={refreshMutation.isPending}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                )}
              >
                <RefreshCw className="w-4 h-4" />
                Fetch Current KOMs
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
