-- Migration to add new fields to containers table
ALTER TABLE `containers` ADD COLUMN `description` text;
ALTER TABLE `containers` ADD COLUMN `image_url` text;
ALTER TABLE `containers` ADD COLUMN `thumbnail_url` text;
ALTER TABLE `containers` ADD COLUMN `category` text;
ALTER TABLE `containers` ADD COLUMN `confidence` real;
ALTER TABLE `containers` ADD COLUMN `updated_at` integer;

-- Migration to add new fields to items table
ALTER TABLE `items` ADD COLUMN `description` text;
ALTER TABLE `items` ADD COLUMN `image_url` text;
ALTER TABLE `items` ADD COLUMN `thumbnail_url` text;
ALTER TABLE `items` ADD COLUMN `category` text;
ALTER TABLE `items` ADD COLUMN `confidence` real;
ALTER TABLE `items` ADD COLUMN `updated_at` integer;
ALTER TABLE `items` ADD COLUMN `quantity` integer DEFAULT 1 NOT NULL;
