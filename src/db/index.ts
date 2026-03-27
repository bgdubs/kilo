import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "inventory.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Run incremental migrations
try {
  // Ensure sets table exists
  sqlite.exec(`CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  )`);

  // Ensure containers.set_id exists
  const containerCols = sqlite.pragma('table_info(containers)') as Array<{ name: string }>;
  if (!containerCols.some(c => c.name === 'set_id')) {
    sqlite.exec(`ALTER TABLE containers ADD COLUMN set_id INTEGER`);
  }

  // Add containers.parent_container_id if missing
  if (!containerCols.some(c => c.name === 'parent_container_id')) {
    sqlite.exec(`ALTER TABLE containers ADD COLUMN parent_container_id INTEGER`);
  }

  // Make items.container_id nullable and add items.set_id
  // SQLite cannot ALTER a column constraint, so recreate the table if needed
  const itemCols = sqlite.pragma('table_info(items)') as Array<{ name: string; notnull: number }>;
  const containerIdCol = itemCols.find(c => c.name === 'container_id');
  if (containerIdCol && containerIdCol.notnull === 1) {
    // Recreate with nullable container_id and new set_id column
    sqlite.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        container_id INTEGER,
        set_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        image_data TEXT NOT NULL,
        image_url TEXT,
        thumbnail_url TEXT,
        category TEXT,
        confidence REAL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER
      );
      INSERT INTO items_new (id, container_id, set_id, name, description, image_data, image_url, thumbnail_url, category, confidence, quantity, created_at, updated_at)
        SELECT id, container_id, NULL, name, description, image_data, image_url, thumbnail_url, category, confidence, quantity, created_at, updated_at FROM items;
      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;
      PRAGMA foreign_keys = ON;
    `);
  } else if (!itemCols.some(c => c.name === 'set_id')) {
    sqlite.exec(`ALTER TABLE items ADD COLUMN set_id INTEGER`);
  }
} catch (e) {
  console.error('Migration error:', e);
}
