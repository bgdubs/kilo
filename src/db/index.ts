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
  sqlite.exec(`CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  )`);
  const cols = sqlite.pragma('table_info(containers)') as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'set_id')) {
    sqlite.exec(`ALTER TABLE containers ADD COLUMN set_id INTEGER`);
  }
} catch (e) {
  // Table/column already exists
}
