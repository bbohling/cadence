CREATE TABLE `segment_current_ranks` (
	`segment_id` integer PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`effort_id` integer,
	`segment_name` text,
	`current_rank` integer,
	`previous_rank` integer,
	`elapsed_time` integer,
	`distance` real,
	`average_grade` real,
	`city` text,
	`state` text,
	`checked_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_current_ranks_athlete` ON `segment_current_ranks` (`athlete_id`);--> statement-breakpoint
CREATE INDEX `idx_current_ranks_rank` ON `segment_current_ranks` (`current_rank`);--> statement-breakpoint
CREATE INDEX `idx_current_ranks_athlete_rank` ON `segment_current_ranks` (`athlete_id`,`current_rank`);