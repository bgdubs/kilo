PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_containers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_data` text NOT NULL,
	`image_url` text,
	`thumbnail_url` text,
	`category` text,
	`confidence` real,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_containers`("id", "name", "description", "image_data", "image_url", "thumbnail_url", "category", "confidence", "created_at", "updated_at") SELECT "id", "name", "description", "image_data", "image_url", "thumbnail_url", "category", "confidence", "created_at", "updated_at" FROM `containers`;--> statement-breakpoint
DROP TABLE `containers`;--> statement-breakpoint
ALTER TABLE `__new_containers` RENAME TO `containers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`container_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_data` text NOT NULL,
	`image_url` text,
	`thumbnail_url` text,
	`category` text,
	`confidence` real,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`container_id`) REFERENCES `containers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "container_id", "name", "description", "image_data", "image_url", "thumbnail_url", "category", "confidence", "quantity", "created_at", "updated_at") SELECT "id", "container_id", "name", "description", "image_data", "image_url", "thumbnail_url", "category", "confidence", "quantity", "created_at", "updated_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;