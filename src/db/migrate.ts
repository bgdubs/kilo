import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "inventory.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

// Create tables directly from schema (fresh DB)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT NOT NULL,
    image_url TEXT,
    thumbnail_url TEXT,
    category TEXT,
    confidence REAL,
    set_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    container_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT NOT NULL,
    image_url TEXT,
    thumbnail_url TEXT,
    category TEXT,
    confidence REAL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (container_id) REFERENCES containers(id) ON UPDATE NO ACTION ON DELETE NO ACTION
  );
`);

console.log("Database initialized at", dbPath);
sqlite.close();
