ALTER TABLE `containers` RENAME COLUMN `image_url` TO `image_data`;
--> statement-breakpoint
ALTER TABLE `items` RENAME COLUMN `image_url` TO `image_data`;