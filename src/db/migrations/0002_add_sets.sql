-- Create sets table
CREATE TABLE IF NOT EXISTS `sets` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT,
  `image_data` TEXT,
  `parent_id` INTEGER,
  `created_at` INTEGER,
  `updated_at` INTEGER
);

-- Add set_id to containers
ALTER TABLE `containers` ADD COLUMN `set_id` INTEGER;
