CREATE TABLE `containers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`image_data` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`container_id` integer NOT NULL,
	`name` text NOT NULL,
	`image_data` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`container_id`) REFERENCES `containers`(`id`) ON UPDATE no action ON DELETE no action
);