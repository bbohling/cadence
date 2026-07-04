import { Hono } from "hono";
import { syncUser } from "../services/sync";
import { startBulkSync, getBulkSyncStatus, resetBulkSync } from "../services/bulk-sync";
import { runNormalization } from "../services/normalize";
import { log } from "../utils/logger";

/**
 * Sync routes.
 *
 * Endpoints for triggering data synchronization from Strava
 * and running normalization jobs.
 */
const sync = new Hono();

// POST /sync/:userId — trigger an incremental sync
sync.post("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const getAll = c.req.query("getAll") === "true";

  try {
    const result = await syncUser(userId);

    // After syncing, run normalization to update the normalized tables
    const normResult = runNormalization();

    return c.json({
      sync: result,
      normalization: normResult,
    });
  } catch (error) {
    log.error("Sync endpoint error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      500
    );
  }
});

// POST /sync/bulk/:userId/start — start a bulk sync
sync.post("/bulk/:userId/start", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => ({}));
  const force = (body as Record<string, unknown>).force === true;

  const result = await startBulkSync(userId, force);
  return c.json(result);
});

// GET /sync/bulk/:userId/status — get bulk sync status
sync.get("/bulk/:userId/status", (c) => {
  const userId = c.req.param("userId");
  const status = getBulkSyncStatus(userId);
  if (!status) {
    return c.json({ status: "none", message: "No bulk sync found." });
  }
  return c.json(status);
});

// DELETE /sync/bulk/:userId/reset — reset bulk sync state
sync.delete("/bulk/:userId/reset", (c) => {
  const userId = c.req.param("userId");
  resetBulkSync(userId);
  return c.json({ message: "Bulk sync reset." });
});

// POST /sync/normalize — trigger normalization manually
sync.post("/normalize", (c) => {
  const force = c.req.query("force") === "true";
  const result = runNormalization(force);
  return c.json(result);
});

export { sync };
