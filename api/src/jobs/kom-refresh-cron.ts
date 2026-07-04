import { CronJob } from "cron";
import { refreshCurrentKoms } from "../services/kom-refresh";
import { config } from "../utils/config";
import { log } from "../utils/logger";

/**
 * Daily cron job to refresh current KOM rankings.
 *
 * Runs once per day at 4:00 AM Pacific Time to re-fetch leaderboard
 * positions from Strava. This is separate from the hourly activity
 * sync — it focuses on updating the current standings for segments
 * where the athlete has historically been ranked.
 *
 * Usage:
 *   bun src/jobs/kom-refresh-cron.ts          — start the daily scheduler
 *   bun src/jobs/kom-refresh-cron.ts --once   — run once immediately and exit
 *
 * IMPORTANT: This is a separate process from the API server.
 * In production, run it via PM2 alongside the API and sync cron.
 */

async function runKomRefresh(): Promise<void> {
  const userId = config.defaultUserId;
  log.info("KOM refresh cron starting", { userId });

  try {
    const result = await refreshCurrentKoms(userId);
    log.info("KOM refresh cron complete", { ...result });
  } catch (error) {
    log.error("KOM refresh cron failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const isOneShot = process.argv.includes("--once");

if (isOneShot) {
  log.info("Running one-time KOM refresh...");
  runKomRefresh().then(() => {
    log.info("One-time KOM refresh finished.");
    process.exit(0);
  });
} else {
  // Schedule: 4:00 AM Pacific Time, daily
  const job = new CronJob(
    "0 0 4 * * *",
    runKomRefresh,
    null,
    true,
    "America/Los_Angeles"
  );

  log.info("KOM refresh cron job started", {
    schedule: "Daily at 4:00 AM Pacific",
    nextRun: job.nextDate().toISO(),
  });
}
