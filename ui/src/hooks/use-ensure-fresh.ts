import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchEnsureFresh } from "@/lib/api";

/**
 * Maximum number of polls while waiting for a sync to complete.
 * At 3 s intervals this gives ~5 minutes before we stop asking.
 */
const MAX_POLLS = 100;

/** Milliseconds between polls while a sync is in progress */
const POLL_INTERVAL_MS = 3_000;

/**
 * Hook that checks data freshness once on mount, then polls
 * only while a sync is actively in progress.
 *
 * HOW IT WORKS:
 * 1. On mount, makes a single call to ensure-fresh.
 * 2. If the API says data is stale and a sync is running, we
 *    poll every 3 seconds until sync completes (up to MAX_POLLS).
 * 3. When fresh again, we invalidate all React Query caches
 *    so dashboard components re-fetch with the latest data.
 * 4. Once fresh (or polling exhausted), polling stops completely.
 *
 * RETURNS:
 *   { isSyncing, lastSyncAt } — use these to show a sync banner.
 */
export function useEnsureFresh(userId: string) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const wasSyncingRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    async function check() {
      if (!mounted) return;

      try {
        const result = await fetchEnsureFresh(userId);

        if (!mounted) return;

        setLastSyncAt(result.lastSyncAt ?? null);

        // Sync failed on the backend — stop polling, nothing we can do
        if (result.syncFailed) {
          setIsSyncing(false);
          wasSyncingRef.current = false;
          return;
        }

        if (result.fresh) {
          if (wasSyncingRef.current) {
            wasSyncingRef.current = false;
            setIsSyncing(false);
            queryClient.invalidateQueries();
          }
          return;
        }

        // Data is stale and a sync is running — poll unless exhausted
        wasSyncingRef.current = true;
        setIsSyncing(true);
        pollCountRef.current++;

        if (pollCountRef.current >= MAX_POLLS) {
          setIsSyncing(false);
          return;
        }

        if (mounted) {
          timer = setTimeout(check, POLL_INTERVAL_MS);
        }
      } catch {
        // Network error — stop polling
        setIsSyncing(false);
      }
    }

    // Single initial check on mount
    pollCountRef.current = 0;
    check();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [userId, queryClient]);

  return { isSyncing, lastSyncAt };
}
