CREATE TABLE `normalize_state` (
	`key` text PRIMARY KEY NOT NULL,
	`watermark` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_src_activities_updated_at` ON `src_activities` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_updated_at` ON `src_segment_efforts` (`updated_at`);