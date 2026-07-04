import { runNormalization } from "../services/normalize";
import { log } from "../utils/logger";

/**
 * Standalone normalization script.
 *
 * Reads from src_* tables and writes to normalized tables.
 * Safe to run at any time — it's idempotent and only processes
 * rows that need updating.
 *
 * Usage:
 *   bun src/jobs/normalize.ts           — incremental normalization
 *   bun src/jobs/normalize.ts --force   — re-normalize everything
 */

const force = process.argv.includes("--force");

log.info("Starting normalization job", { force });

const result = runNormalization(force);

log.info("Normalization job complete", { ...result });
process.exit(0);
