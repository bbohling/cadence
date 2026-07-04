CREATE TABLE `activities` (
	`id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text,
	`type` text,
	`sport_type` text,
	`distance` real,
	`moving_time` integer,
	`elapsed_time` integer,
	`total_elevation_gain` real,
	`elev_high` real,
	`elev_low` real,
	`start_date` text,
	`start_date_local` text,
	`timezone` text,
	`average_speed` real,
	`max_speed` real,
	`average_cadence` real,
	`average_watts` real,
	`max_watts` real,
	`weighted_average_watts` real,
	`kilojoules` real,
	`device_watts` integer,
	`average_heartrate` real,
	`max_heartrate` real,
	`has_heartrate` integer,
	`suffer_score` integer,
	`achievement_count` integer,
	`pr_count` integer,
	`calories` real,
	`average_temp` real,
	`trainer` integer,
	`commute` integer,
	`gear_id` text,
	`kom_count` integer DEFAULT 0,
	`best_kom_rank` integer,
	`best_pr_rank` integer,
	`map_summary_polyline` text,
	`normalized_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activities_athlete` ON `activities` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_activities_start_date` ON `activities` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_activities_type` ON `activities` (`type`);--> statement-breakpoint
CREATE INDEX `idx_activities_kom_count` ON `activities` (`kom_count`);--> statement-breakpoint
CREATE INDEX `idx_activities_gear` ON `activities` (`gear_id`);--> statement-breakpoint
CREATE INDEX `idx_activities_athlete_date` ON `activities` (`athlete_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `idx_activities_athlete_type` ON `activities` (`athlete_id`,`type`);--> statement-breakpoint
CREATE TABLE `bulk_sync_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`athlete_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`phase` text DEFAULT 'summary_fetch' NOT NULL,
	`total_activities` integer DEFAULT 0,
	`processed_activities` integer DEFAULT 0,
	`processed_summaries` integer DEFAULT 0,
	`requests_used_today` integer DEFAULT 0,
	`current_page` integer DEFAULT 1,
	`processed_activity_ids` text DEFAULT '[]',
	`start_date` text,
	`last_reset_date` text,
	`completed_at` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bulk_sync_states_user_id_unique` ON `bulk_sync_states` (`user_id`);--> statement-breakpoint
CREATE TABLE `bulk_sync_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` integer NOT NULL,
	`summary_data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bulk_summaries_user` ON `bulk_sync_summaries` (`user_id`);--> statement-breakpoint
CREATE TABLE `gears` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text,
	`primary_gear` integer,
	`distance` real,
	`brand_name` text,
	`model_name` text,
	`frame_type` integer,
	`description` text,
	`resource_state` integer,
	`normalized_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gears_athlete` ON `gears` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`endpoint` text,
	`overall_usage_15min` integer,
	`overall_usage_daily` integer,
	`read_usage_15min` integer,
	`read_usage_daily` integer,
	`max_utilization_pct` real,
	`delay_applied_ms` integer,
	`was_rate_limited` integer,
	`retry_after_ms` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_timestamp` ON `rate_limit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_rate_limits_daily` ON `rate_limit_logs` (`overall_usage_daily`);--> statement-breakpoint
CREATE TABLE `segment_efforts` (
	`id` integer PRIMARY KEY NOT NULL,
	`activity_id` integer NOT NULL,
	`segment_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text,
	`elapsed_time` integer,
	`moving_time` integer,
	`start_date` text,
	`start_date_local` text,
	`distance` real,
	`average_cadence` real,
	`average_watts` real,
	`average_heartrate` real,
	`max_heartrate` real,
	`device_watts` integer,
	`pr_rank` integer,
	`kom_rank` integer,
	`achievements_json` text,
	`segment_name` text,
	`segment_distance` real,
	`segment_average_grade` real,
	`segment_maximum_grade` real,
	`segment_elevation_high` real,
	`segment_elevation_low` real,
	`segment_climb_category` integer,
	`segment_city` text,
	`segment_state` text,
	`normalized_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_efforts_activity` ON `segment_efforts` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_efforts_segment` ON `segment_efforts` (`segment_id`);--> statement-breakpoint
CREATE INDEX `idx_efforts_athlete` ON `segment_efforts` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_efforts_kom_rank` ON `segment_efforts` (`kom_rank`);--> statement-breakpoint
CREATE INDEX `idx_efforts_pr_rank` ON `segment_efforts` (`pr_rank`);--> statement-breakpoint
CREATE INDEX `idx_efforts_start_date` ON `segment_efforts` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_efforts_athlete_kom` ON `segment_efforts` (`athlete_id`,`kom_rank`);--> statement-breakpoint
CREATE TABLE `src_activities` (
	`id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`raw_json` text NOT NULL,
	`name` text,
	`type` text,
	`sport_type` text,
	`distance` real,
	`moving_time` integer,
	`elapsed_time` integer,
	`total_elevation_gain` real,
	`elev_high` real,
	`elev_low` real,
	`start_date` text,
	`start_date_local` text,
	`timezone` text,
	`average_speed` real,
	`max_speed` real,
	`average_cadence` real,
	`average_watts` real,
	`max_watts` real,
	`weighted_average_watts` real,
	`kilojoules` real,
	`device_watts` integer,
	`average_heartrate` real,
	`max_heartrate` real,
	`has_heartrate` integer,
	`suffer_score` integer,
	`achievement_count` integer,
	`pr_count` integer,
	`calories` real,
	`average_temp` real,
	`trainer` integer,
	`commute` integer,
	`gear_id` text,
	`segment_efforts_json` text,
	`map_summary_polyline` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_src_activities_athlete` ON `src_activities` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_src_activities_start_date` ON `src_activities` (`start_date`);--> statement-breakpoint
CREATE INDEX `idx_src_activities_type` ON `src_activities` (`type`);--> statement-breakpoint
CREATE TABLE `src_gears` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`raw_json` text NOT NULL,
	`name` text,
	`primary_gear` integer,
	`distance` real,
	`brand_name` text,
	`model_name` text,
	`frame_type` integer,
	`description` text,
	`resource_state` integer,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_src_gears_athlete` ON `src_gears` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `src_segment_efforts` (
	`id` integer PRIMARY KEY NOT NULL,
	`activity_id` integer NOT NULL,
	`segment_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`raw_json` text NOT NULL,
	`name` text,
	`elapsed_time` integer,
	`moving_time` integer,
	`start_date` text,
	`start_date_local` text,
	`distance` real,
	`average_cadence` real,
	`average_watts` real,
	`average_heartrate` real,
	`max_heartrate` real,
	`device_watts` integer,
	`pr_rank` integer,
	`kom_rank` integer,
	`segment_json` text,
	`achievements_json` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_src_efforts_activity` ON `src_segment_efforts` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_segment` ON `src_segment_efforts` (`segment_id`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_athlete` ON `src_segment_efforts` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_kom_rank` ON `src_segment_efforts` (`kom_rank`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_pr_rank` ON `src_segment_efforts` (`pr_rank`);--> statement-breakpoint
CREATE INDEX `idx_src_efforts_start_date` ON `src_segment_efforts` (`start_date`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`success` integer NOT NULL,
	`activities_added` integer DEFAULT 0,
	`activities_updated` integer DEFAULT 0,
	`koms_added` integer DEFAULT 0,
	`error` text,
	`duration_ms` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_logs_user` ON `sync_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_logs_timestamp` ON `sync_logs` (`timestamp`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`athlete_id` integer,
	`access_token` text,
	`refresh_token` text,
	`expires_at` integer,
	`last_sync_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_athlete_id_unique` ON `users` (`athlete_id`);