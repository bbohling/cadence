CREATE TABLE `activity_tracks` (
	`activity_id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text,
	`gps_points` integer DEFAULT 0 NOT NULL,
	`distance_m` real,
	`tiles_z14` text,
	`detail_polyline` text,
	`route_cluster_id` integer,
	`processed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_tracks_athlete` ON `activity_tracks` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_tracks_route` ON `activity_tracks` (`route_cluster_id`);--> statement-breakpoint
CREATE TABLE `climb_efforts` (
	`activity_id` integer NOT NULL,
	`start_offset_s` integer NOT NULL,
	`climb_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`elapsed_s` integer NOT NULL,
	`avg_watts` integer,
	`avg_hr` integer,
	PRIMARY KEY(`activity_id`, `start_offset_s`)
);
--> statement-breakpoint
CREATE INDEX `idx_climb_efforts_climb` ON `climb_efforts` (`climb_id`);--> statement-breakpoint
CREATE TABLE `climbs` (
	`id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text,
	`start_lat` real NOT NULL,
	`start_lng` real NOT NULL,
	`end_lat` real NOT NULL,
	`end_lng` real NOT NULL,
	`length_m` real NOT NULL,
	`gain_m` real NOT NULL,
	`avg_grade` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_climbs_athlete` ON `climbs` (`athlete_id`);--> statement-breakpoint
CREATE TABLE `power_bests` (
	`activity_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`watts` integer NOT NULL,
	`start_date` text NOT NULL,
	PRIMARY KEY(`activity_id`, `duration_s`)
);
--> statement-breakpoint
CREATE INDEX `idx_power_bests_athlete_duration` ON `power_bests` (`athlete_id`,`duration_s`);--> statement-breakpoint
CREATE TABLE `route_clusters` (
	`id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text,
	`rep_activity_id` integer NOT NULL,
	`tiles_z16` text NOT NULL,
	`distance_m` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_route_clusters_athlete_distance` ON `route_clusters` (`athlete_id`,`distance_m`);