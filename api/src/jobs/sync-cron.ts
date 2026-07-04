import { CronJob } from "cron";
import { syncUser } from "../services/sync";
import { runNormalization } from "../services/normalize";
import { config } from "../utils/config";
import { log } from "../utils/logger";

/**
 * Cron job that syncs Strava data hourly.
 *
 * Runs at minute 5 of every hour (Pacific Time).
 * After syncing, runs normalization to update the normalized tables.
 *
 * Usage:
 *   bun src/jobs/sync-cron.ts          — start the cron scheduler
 *   bun src/jobs/sync-cron.ts --once   — run once immediately and exit
 *
 * IMPORTANT: This is a separate process from the API server.
 * In production, run it via PM2 alongside the API.
 */

async function runSync(): Promise<void> {
  const userId = config.defaultUserId;
  log.info("Cron sync starting", { userId });

  try {
    const syncResult = await syncUser(userId);
    log.info("Cron sync complete, running normalization", { ...syncResult });

    const normResult = runNormalization();
    log.info("Cron normalization complete", { ...normResult });
  } catch (error) {
    log.error("Cron sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Check if --once flag is present (for manual/endpoint-triggered runs)
const isOneShot = process.argv.includes("--once");

if (isOneShot) {
  log.info("Running one-time sync...");
  runSync().then(() => {
    log.info("One-time sync finished.");
    process.exit(0);
  });
} else {
  // Schedule: minute 5 of every hour, Pacific Time
  const job = new CronJob(
    "0 5 * * * *",
    runSync,
    null,
    true,
    "America/Los_Angeles"
  );

  log.info("Sync cron job started", {
    schedule: "5 minutes past every hour (Pacific)",
    nextRun: job.nextDate().toISO(),
  });
}
