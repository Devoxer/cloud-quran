CREATE TABLE `audio_positions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`surah` integer NOT NULL,
	`verse` integer NOT NULL,
	`reciter_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`surah` integer NOT NULL,
	`verse` integer NOT NULL,
	`label` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_user_surah_verse_idx` ON `bookmarks` (`user_id`,`surah`,`verse`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme` text NOT NULL,
	`font_size` integer NOT NULL,
	`reciter_id` text NOT NULL,
	`reading_mode` text NOT NULL,
	`translation_id` text,
	`speed_rate` real NOT NULL,
	`transliteration` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_positions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`surah` integer NOT NULL,
	`verse` integer NOT NULL,
	`page` integer NOT NULL,
	`mode` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `write_budget` (
	`user_id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`writes` integer NOT NULL
);
