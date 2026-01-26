import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const containers = sqliteTable("containers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  imageData: text("image_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  containerId: integer("container_id").notNull().references(() => containers.id),
  name: text("name").notNull(),
  imageData: text("image_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});