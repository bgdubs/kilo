# Sets Feature Design

**Date:** 2026-03-14
**Status:** Approved

## Overview

Add hierarchical "sets" to group containers. Sets are meta-containers with optional images, nestable 2-3 levels deep (e.g., building > room > spot). Containers belong to one set at a time or remain unassigned at the top level.

## Data Model

### New `sets` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL | Custom label |
| `description` | TEXT | Optional |
| `image_data` | TEXT | Optional (unlike containers) |
| `parent_id` | INTEGER | Nullable FK -> sets.id. NULL = root set |
| `created_at` | INTEGER (timestamp) | |
| `updated_at` | INTEGER (timestamp) | |

### Modified `containers` table

Add `set_id` INTEGER, nullable FK -> sets.id. NULL = unassigned (top-level).

### Items table

No changes.

## Deletion Behavior

- Deleting a set **unassigns** its containers (set_id -> NULL) and **promotes** child sets to root (parent_id -> NULL).
- No cascading data loss. Contents are preserved and moved to top level.

## API

### New `/api/sets` route

| Method | Behavior |
|--------|----------|
| GET | All sets. Optional `?parentId=<n>` filter. `?parentId=null` for root only |
| POST | Create: `{ name, description?, imageData?, parentId? }` |
| PUT | Update: `{ id, name?, description?, imageData?, parentId? }`. Changing parentId moves the set |
| DELETE ?id=N | Unassign containers, promote child sets to root, delete set |

### New `/api/sets/items` route

| Method | Behavior |
|--------|----------|
| GET ?setId=N | All items across all containers in this set and child sets recursively |

### Modified `/api/containers`

- GET: Add optional `?setId=<n>` filter. `?setId=null` for unassigned only.
- POST: Accept optional `setId` in body.
- PUT: Accept optional `setId` in body (move container between sets).

### Export routes

Updated to group by set hierarchy.

## UI Navigation

Directory-style drill-down replacing the current flat container list.

### View hierarchy

```
Top Level (root)
+-- Set: "First Floor"        <- click to drill in
|   +-- Set: "Bedroom"        <- nested set
|   |   +-- Container: Box A
|   |   +-- Container: Box B
|   +-- Container: Box C
+-- Set: "Basement"
+-- Container: Unsorted Box   <- unassigned
```

### Views

| View | Content |
|------|---------|
| Root (new default) | Root sets + unassigned containers, most-recent-first |
| Inside a set | Child sets + containers in set, most-recent-first. Breadcrumb trail. Toggle for flattened items view |
| Inside a container | Items (unchanged) |
| Edit set | Name, description, image (optional), parent set picker |

### Key UI elements

- **Breadcrumb bar**: `Home > First Floor > Bedroom` -- clickable for back-navigation
- **Visual distinction**: Sets distinguished from containers (folder-style badge/card treatment)
- **"Move to..." action**: Dropdown/modal on containers and sets to pick destination (or unassign to root)
- **Set creation**: Same "+" flow, image optional. No image = folder-style placeholder
- **Flattened items toggle**: Inside a set, toggle to see all items across all containers (including nested child sets)

## Migration

Incremental ALTER TABLE + CREATE TABLE, matching existing migration pattern in src/db/migrations/.

## Architecture

- Self-referencing `parent_id` on sets table for nesting
- SQLite recursive CTEs or 2-3 chained queries for flattened item retrieval (practical at 2-3 depth)
- Same patterns as existing containers CRUD (processImage reuse, Drizzle ORM, force-dynamic routes)
