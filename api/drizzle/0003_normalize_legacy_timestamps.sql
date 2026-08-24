-- Migration number: 0003 	 convert legacy Unix-ms timestamps to ISO 8601
--
-- src_activities is the only table left holding timestamps in the pre-D1
-- format: bare Unix-millisecond strings like '1768766433749', written by
-- the original SQLite import rather than by `now()` (which emits
-- '2026-01-18T20:00:33.749Z'). 1,678 created_at / 1,507 updated_at /
-- 1,508 fetched_at values out of 1,869 rows. Every other timestamp column
-- in the database is already ISO.
--
-- Why it matters: updated_at is what the incremental normalization
-- watermark compares against, as a STRING. Today the mixed format is
-- harmless only by accident — Unix-ms values start with '1' and ISO ones
-- with '2', so the legacy rows sort below every ISO value and stay under
-- the watermark, which is correct because they were all normalized long
-- ago. That accident expires: Unix-ms crosses into '2...' on
-- 2033-05-18. Relying on it is the same class of bug that already bit the
-- lifestream database (mixed INTEGER/TEXT datetimes silently breaking
-- date-filtered queries).
--
-- The conversion preserves the actual instant, so every rewritten value
-- lands in Jan/Feb 2026 — verified to be below the current watermark, so
-- this does NOT trigger a re-normalization pass.
--
-- Applied to production 2026-08-24 with:
--   wrangler d1 execute cadence --remote --file=drizzle/0003_normalize_legacy_timestamps.sql

UPDATE src_activities
SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at / 1000.0, 'unixepoch')
WHERE created_at NOT LIKE '%-%';

UPDATE src_activities
SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at / 1000.0, 'unixepoch')
WHERE updated_at NOT LIKE '%-%';

UPDATE src_activities
SET fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', fetched_at / 1000.0, 'unixepoch')
WHERE fetched_at NOT LIKE '%-%';
