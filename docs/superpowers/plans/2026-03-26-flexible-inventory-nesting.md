# Flexible Inventory Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix EXIF photo rotation, enable sets/containers/items to be created and moved freely at any level, and show newest items at the top with auto-scroll.

**Architecture:** Extend existing 3-table schema with two nullable FK columns, add a `/api/tree` endpoint for the move picker, and update `page.tsx` to support a "+" dropdown, standalone items in the browse view, container nesting navigation, and a unified flat-searchable move modal.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, better-sqlite3, React 19, Tailwind CSS 4, Sharp

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/lib/image-utils.ts` | Modify | Add `.rotate()` to Sharp pipeline |
| `src/db/schema.ts` | Modify | `items.setId` (nullable), `items.containerId` nullable, `containers.parentContainerId` (nullable) |
| `src/db/index.ts` | Modify | Inline migration: recreate items table + ALTER containers |
| `src/db/migrate.ts` | Modify | Update fresh-DB CREATE TABLE statements |
| `src/app/api/items/route.ts` | Modify | Support `setId`, nullable `containerId`, sort newest first |
| `src/app/api/containers/route.ts` | Modify | Support `parentContainerId`, cycle detection in PUT |
| `src/app/api/sets/route.ts` | Modify | Add cycle detection to PUT |
| `src/app/api/tree/route.ts` | Create | Flat hierarchy of sets+containers for move picker |
| `src/app/page.tsx` | Modify | UI: "+" dropdown, standalone items, container stack, move modal, auto-scroll |

---

## Task 1: EXIF Orientation Fix

**Files:**
- Modify: `src/lib/image-utils.ts`

- [ ] **Step 1: Add `.rotate()` to `processImage`**

In `src/lib/image-utils.ts`, find the Sharp pipeline in `processImage` (around line 70) and add `.rotate()` as the first chain call:

```typescript
// Before (line ~70):
  const processedBuffer = await sharp(buffer)
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: opts.quality! })
    .toBuffer();

// After:
  const processedBuffer = await sharp(buffer)
    .rotate()
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: opts.quality! })
    .toBuffer();
```

- [ ] **Step 2: Add `.rotate()` to `generateThumbnail`**

Find the `generateThumbnail` function (around line 110) and add `.rotate()` before `.extract()`:

```typescript
// Before:
  return await sharp(buffer)
    .extract({
      left: startX,
      top: startY,
      width: minDimension,
      height: minDimension,
    })

// After:
  return await sharp(buffer)
    .rotate()
    .extract({
      left: startX,
      top: startY,
      width: minDimension,
      height: minDimension,
    })
```

Note: `.rotate()` with no args reads EXIF orientation, auto-corrects, and strips the tag. It must come BEFORE `.extract()` so the crop is applied to the already-corrected image.

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-utils.ts
git commit -m "fix: auto-rotate images based on EXIF orientation"
```

---

## Task 2: Schema + Migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/index.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Update `src/db/schema.ts`**

Replace the full file content:

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  imageData: text("image_data"),
  parentId: integer("parent_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const containers = sqliteTable("containers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  imageData: text("image_data").notNull(),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category"),
  confidence: real("confidence"),
  setId: integer("set_id"),
  parentContainerId: integer("parent_container_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  containerId: integer("container_id"),
  setId: integer("set_id"),
  name: text("name").notNull(),
  description: text("description"),
  imageData: text("image_data").notNull(),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category"),
  confidence: real("confidence"),
  quantity: integer("quantity").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

Changes:
- `containers`: added `parentContainerId: integer("parent_container_id")`
- `items`: removed `.notNull().references(() => containers.id)` from `containerId`, added `setId: integer("set_id")`

- [ ] **Step 2: Update `src/db/index.ts` inline migration**

Replace the entire try/catch block at the bottom of `src/db/index.ts` with:

```typescript
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
  // SQLite can't ALTER a column constraint, so we recreate the table if needed
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
```

- [ ] **Step 3: Update `src/db/migrate.ts`** for fresh-DB setup

Replace the `sqlite.exec` call in `migrate.ts` with:

```typescript
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
    parent_container_id INTEGER,
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
`);
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/db/migrate.ts
git commit -m "feat: extend schema with parentContainerId and nullable containerId/setId on items"
```

---

## Task 3: Items API

**Files:**
- Modify: `src/app/api/items/route.ts`

- [ ] **Step 1: Replace the full file**

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, isNull, desc, and } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const containerId = searchParams.get("containerId");
  const setIdParam = searchParams.get("setId");

  try {
    // Items inside a specific container
    if (containerId) {
      const result = await db.select().from(items)
        .where(eq(items.containerId, parseInt(containerId)))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }

    // Standalone items in a specific set
    if (setIdParam === "null") {
      const result = await db.select().from(items)
        .where(and(isNull(items.containerId), isNull(items.setId)))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }
    if (setIdParam) {
      const result = await db.select().from(items)
        .where(and(isNull(items.containerId), eq(items.setId, parseInt(setIdParam))))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }

    // All items
    const allItems = await db.select().from(items).orderBy(desc(items.createdAt));
    return NextResponse.json(allItems);
  } catch (error) {
    console.error("Failed to fetch items:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { containerId, setId, name, imageData, quantity, description, category } = await request.json();

    if (!name || !imageData) {
      return NextResponse.json({ error: "Name and image data are required" }, { status: 400 });
    }
    if (containerId && setId) {
      return NextResponse.json({ error: "Item cannot have both containerId and setId" }, { status: 400 });
    }

    const processedImage = await processImage(imageData);

    const newItem = await db.insert(items).values({
      containerId: containerId || null,
      setId: setId || null,
      name,
      imageData: processedImage.imageData,
      quantity: quantity || 1,
      description: description || null,
      category: category || null,
    }).returning();

    return NextResponse.json(newItem[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create item:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, imageData, quantity, description, category, confidence, containerId, setId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }
    if (containerId && setId) {
      return NextResponse.json({ error: "Item cannot have both containerId and setId" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;

    // Move semantics: accept explicit null to clear a parent
    if (containerId !== undefined) updateData.containerId = containerId;
    if (setId !== undefined) updateData.setId = setId;

    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
    }

    const updatedItem = await db.update(items).set(updateData).where(eq(items.id, id)).returning();

    if (updatedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(updatedItem[0]);
  } catch (error) {
    console.error("Failed to update item:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const deletedItem = await db.delete(items).where(eq(items.id, parseInt(id))).returning();

    if (deletedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Failed to delete item:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/items/route.ts
git commit -m "feat: items API supports setId, nullable containerId, and standalone items at root"
```

---

## Task 4: Containers API

**Files:**
- Modify: `src/app/api/containers/route.ts`

- [ ] **Step 1: Replace the full file**

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers, items } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

/** Walk up the container tree to detect cycles. Returns true if `ancestorId` is an ancestor of `nodeId`. */
async function isAncestor(nodeId: number, ancestorId: number): Promise<boolean> {
  let current: number | null = nodeId;
  const visited = new Set<number>();
  while (current !== null) {
    if (current === ancestorId) return true;
    if (visited.has(current)) break; // cycle already present
    visited.add(current);
    const row = await db.select({ parentContainerId: containers.parentContainerId })
      .from(containers).where(eq(containers.id, current));
    current = row[0]?.parentContainerId ?? null;
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const setIdParam = searchParams.get("setId");
    const parentContainerIdParam = searchParams.get("parentContainerId");

    // Containers nested inside a specific container
    if (parentContainerIdParam) {
      const result = await db.select().from(containers)
        .where(eq(containers.parentContainerId, parseInt(parentContainerIdParam)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }

    // Containers at root level of a set (or root of app)
    if (setIdParam === "null") {
      const result = await db.select().from(containers)
        .where(and(isNull(containers.setId), isNull(containers.parentContainerId)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }
    if (setIdParam) {
      const result = await db.select().from(containers)
        .where(and(eq(containers.setId, parseInt(setIdParam)), isNull(containers.parentContainerId)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }

    // All containers
    const result = await db.select().from(containers).orderBy(desc(containers.createdAt));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch containers:", error);
    return NextResponse.json({ error: "Failed to fetch containers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, imageData, description, category, setId, parentContainerId } = await request.json();

    if (!name || !imageData) {
      return NextResponse.json({ error: "Name and image data are required" }, { status: 400 });
    }
    if (setId && parentContainerId) {
      return NextResponse.json({ error: "Container cannot have both setId and parentContainerId" }, { status: 400 });
    }

    const processedImage = await processImage(imageData);

    const newContainer = await db.insert(containers).values({
      name,
      imageData: processedImage.imageData,
      description: description || null,
      category: category || null,
      setId: setId || null,
      parentContainerId: parentContainerId || null,
    }).returning();

    return NextResponse.json(newContainer[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create container:", error);
    return NextResponse.json({ error: "Failed to create container" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, imageData, description, category, confidence, setId, parentContainerId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }
    if (setId && parentContainerId) {
      return NextResponse.json({ error: "Container cannot have both setId and parentContainerId" }, { status: 400 });
    }

    // Cycle detection: cannot move a container into its own descendant
    if (parentContainerId) {
      const wouldCycle = await isAncestor(parentContainerId, id);
      if (wouldCycle) {
        return NextResponse.json({ error: "Cannot move a container into its own descendant" }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;
    // Accept explicit null to clear parent
    if (setId !== undefined) updateData.setId = setId;
    if (parentContainerId !== undefined) updateData.parentContainerId = parentContainerId;

    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
    }

    const updatedContainer = await db.update(containers).set(updateData).where(eq(containers.id, id)).returning();

    if (updatedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }

    return NextResponse.json(updatedContainer[0]);
  } catch (error) {
    console.error("Failed to update container:", error);
    return NextResponse.json({ error: "Failed to update container" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }

    const containerId = parseInt(id);

    // Delete all items in this container
    await db.delete(items).where(eq(items.containerId, containerId));

    // Move nested containers to root (avoid orphaning them)
    await db.update(containers)
      .set({ parentContainerId: null })
      .where(eq(containers.parentContainerId, containerId));

    const deletedContainer = await db.delete(containers).where(eq(containers.id, containerId)).returning();

    if (deletedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Container deleted successfully" });
  } catch (error) {
    console.error("Failed to delete container:", error);
    return NextResponse.json({ error: "Failed to delete container" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/containers/route.ts
git commit -m "feat: containers API supports parentContainerId, cycle detection, root-level nesting"
```

---

## Task 5: Sets API — Cycle Detection

**Files:**
- Modify: `src/app/api/sets/route.ts`

- [ ] **Step 1: Add cycle detection helper and update PUT**

At the top of `src/app/api/sets/route.ts`, after the imports, add the helper:

```typescript
/** Returns true if `ancestorId` is an ancestor of `nodeId` in the sets tree. */
async function isAncestor(nodeId: number, ancestorId: number): Promise<boolean> {
  let current: number | null = nodeId;
  const visited = new Set<number>();
  while (current !== null) {
    if (current === ancestorId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    const row = await db.select({ parentId: sets.parentId }).from(sets).where(eq(sets.id, current));
    current = row[0]?.parentId ?? null;
  }
  return false;
}
```

Then in the `PUT` handler, add cycle detection before the update. Find the `updateData` block and add before it:

```typescript
    // Cycle detection: cannot move a set into its own descendant
    if (parentId) {
      const wouldCycle = await isAncestor(parentId, id);
      if (wouldCycle) {
        return NextResponse.json({ error: "Cannot move a set into its own descendant" }, { status: 400 });
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sets/route.ts
git commit -m "feat: add cycle detection to sets PUT"
```

---

## Task 6: Tree API

**Files:**
- Create: `src/app/api/tree/route.ts`

- [ ] **Step 1: Create the file**

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers } from "@/db/schema";

export type TreeNode = {
  id: number;
  type: "set" | "container";
  name: string;
  depth: number;
  parentId: number | null;
  parentType: "set" | "container" | null;
};

function buildTree(
  allSets: Array<{ id: number; name: string; parentId: number | null }>,
  allContainers: Array<{ id: number; name: string; setId: number | null; parentContainerId: number | null }>
): TreeNode[] {
  const result: TreeNode[] = [];

  function addSet(setId: number | null, depth: number) {
    const children = allSets.filter(s => s.parentId === setId);
    for (const s of children) {
      result.push({ id: s.id, type: "set", name: s.name, depth, parentId: setId, parentType: setId ? "set" : null });
      // Containers directly in this set (no parentContainerId)
      const setContainers = allContainers.filter(c => c.setId === s.id && c.parentContainerId === null);
      for (const c of setContainers) {
        result.push({ id: c.id, type: "container", name: c.name, depth: depth + 1, parentId: s.id, parentType: "set" });
        addNestedContainers(c.id, depth + 2);
      }
      addSet(s.id, depth + 1);
    }
  }

  function addNestedContainers(parentContainerId: number, depth: number) {
    const children = allContainers.filter(c => c.parentContainerId === parentContainerId);
    for (const c of children) {
      result.push({ id: c.id, type: "container", name: c.name, depth, parentId: parentContainerId, parentType: "container" });
      addNestedContainers(c.id, depth + 1);
    }
  }

  // Root sets and their containers
  addSet(null, 0);

  // Root containers (no set, no parent container)
  const rootContainers = allContainers.filter(c => c.setId === null && c.parentContainerId === null);
  for (const c of rootContainers) {
    result.push({ id: c.id, type: "container", name: c.name, depth: 0, parentId: null, parentType: null });
    addNestedContainers(c.id, 1);
  }

  return result;
}

export async function GET() {
  try {
    const allSets = await db.select({ id: sets.id, name: sets.name, parentId: sets.parentId }).from(sets);
    const allContainers = await db.select({
      id: containers.id,
      name: containers.name,
      setId: containers.setId,
      parentContainerId: containers.parentContainerId,
    }).from(containers);

    const tree = buildTree(allSets, allContainers);
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Failed to build tree:", error);
    return NextResponse.json({ error: "Failed to build tree" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tree/route.ts
git commit -m "feat: add /api/tree endpoint returning flat hierarchy for move picker"
```

---

## Task 7: UI — Interfaces, State, and Data Fetching

**Files:**
- Modify: `src/app/page.tsx`

This task updates the TypeScript interfaces, adds new state variables, and adds/updates data-fetching functions. No JSX changes yet.

- [ ] **Step 1: Update `Container` interface** (around line 6)

Add `parentContainerId` field:

```typescript
interface Container {
  id: number;
  name: string;
  description?: string;
  imageData: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category?: string;
  confidence?: number;
  setId?: number | null;
  parentContainerId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Update `Item` interface** (around line 20)

Add `setId` field and make `containerId` optional:

```typescript
interface Item {
  id: number;
  containerId?: number | null;
  setId?: number | null;
  name: string;
  description?: string;
  imageData: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category?: string;
  confidence?: number;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 3: Add `TreeNode` import type and new state variables**

After the existing imports at the top, add:

```typescript
import type { TreeNode } from "@/app/api/tree/route";
```

After the existing state declarations (around line 115, after `selectedContainerIds`), add:

```typescript
  // Standalone items shown in browse view
  const [standaloneItems, setStandaloneItems] = useState<Item[]>([]);
  // Container navigation stack (for nested containers)
  const [containerStack, setContainerStack] = useState<Container[]>([]);
  // "+" dropdown open state
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  // Creating a standalone item from browse view
  const [showCreateItem, setShowCreateItem] = useState(false);
  // Move modal: flat tree
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [moveSearchTerm, setMoveSearchTerm] = useState("");
  // New entity id to scroll to after creation
  const [newEntityId, setNewEntityId] = useState<{ type: "set" | "container" | "item"; id: number } | null>(null);
```

- [ ] **Step 4: Update the `moveTarget` type** (around line 110)

Find:
```typescript
  const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
```
Replace with:
```typescript
  const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set" | "item"; id: number } | null>(null);
```

- [ ] **Step 5: Add `fetchStandaloneItems` function**

After `fetchSetItems`, add:

```typescript
  const fetchStandaloneItems = useCallback(async (setId: number | null) => {
    try {
      const param = setId === null ? "null" : String(setId);
      const res = await fetch(`/api/items?setId=${param}`);
      if (!res.ok) throw new Error("Failed to fetch standalone items");
      const data = await res.json();
      setStandaloneItems(data);
    } catch (err) {
      console.error("Failed to fetch standalone items:", err);
    }
  }, []);
```

- [ ] **Step 6: Add `fetchTree` function**

After `fetchStandaloneItems`, add:

```typescript
  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch("/api/tree");
      if (!res.ok) throw new Error("Failed to fetch tree");
      const data = await res.json();
      setTreeNodes(data);
    } catch (err) {
      console.error("Failed to fetch tree:", err);
    }
  }, []);
```

- [ ] **Step 7: Update `fetchContainersForSet` to also fetch standalone items**

The existing `fetchContainersForSet` (around line 155) only fetches containers. Update the `useEffect` that calls it (around line 175) to also call `fetchStandaloneItems`:

Find:
```typescript
  useEffect(() => {
    fetchSets(null);
    fetchContainersForSet(null);
  }, [fetchSets, fetchContainersForSet]);
```
Replace with:
```typescript
  useEffect(() => {
    fetchSets(null);
    fetchContainersForSet(null);
    fetchStandaloneItems(null);
  }, [fetchSets, fetchContainersForSet, fetchStandaloneItems]);
```

- [ ] **Step 8: Update `navigateIntoSet`**

Find the `navigateIntoSet` function (around line 480) and add `fetchStandaloneItems` call + clear container stack:

```typescript
  const navigateIntoSet = async (set: InventorySet) => {
    setBreadcrumbs(prev => [...prev, set]);
    setCurrentSet(set);
    setShowAllItems(false);
    setSearchTerm("");
    setContainerStack([]);
    await Promise.all([
      fetchSets(set.id),
      fetchContainersForSet(set.id),
      fetchStandaloneItems(set.id),
    ]);
  };
```

- [ ] **Step 9: Update `navigateToBreadcrumb`**

Find `navigateToBreadcrumb` (around line 491) and add `fetchStandaloneItems` + clear container stack:

```typescript
  const navigateToBreadcrumb = async (index: number) => {
    setContainerStack([]);
    if (index === -1) {
      setCurrentSet(null);
      setBreadcrumbs([]);
      setShowAllItems(false);
      setSearchTerm("");
      await Promise.all([fetchSets(null), fetchContainersForSet(null), fetchStandaloneItems(null)]);
    } else {
      const target = breadcrumbs[index];
      setCurrentSet(target);
      setBreadcrumbs(prev => prev.slice(0, index + 1));
      setShowAllItems(false);
      setSearchTerm("");
      await Promise.all([fetchSets(target.id), fetchContainersForSet(target.id), fetchStandaloneItems(target.id)]);
    }
  };
```

- [ ] **Step 10: Add `navigateIntoContainer` function**

After `navigateToBreadcrumb`, add:

```typescript
  const navigateIntoContainer = async (container: Container) => {
    setContainerStack(prev => [...prev, container]);
    setSelectedContainer(container);
    await fetchItems(container.id);
    setView("items");
  };

  const navigateContainerBack = async (index: number) => {
    if (index === -1) {
      // Back to browse view
      setContainerStack([]);
      setSelectedContainer(null);
      setItems([]);
      setView("browse");
    } else {
      const target = containerStack[index];
      setContainerStack(prev => prev.slice(0, index + 1));
      setSelectedContainer(target);
      await fetchItems(target.id);
    }
  };
```

- [ ] **Step 11: Add `createStandaloneItem` function**

After `createItem` function (around line 365), add:

```typescript
  const createStandaloneItem = async () => {
    if (!capturedImage || !newItemName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: currentSet?.id || null,
          name: newItemName,
          imageData: capturedImage,
          quantity: newItemQuantity || 1,
          description: newItemDescription || undefined,
          category: newItemCategory || undefined,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create item");
      }
      const created = await res.json();
      setShowCreateItem(false);
      setCapturedImage(null);
      setNewItemName("");
      setNewItemDescription("");
      setNewItemCategory("");
      setNewItemConfidence(null);
      setNewItemQuantity(1);
      await fetchStandaloneItems(currentSet?.id ?? null);
      setNewEntityId({ type: "item", id: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 12: Update `createContainer` to track new entity id**

In `createContainer` (around line 245), after `await fetchContainersForSet(...)`, add:

```typescript
      const created = await res.json(); // already done — move this before reset
```

Actually, restructure to capture the returned id. Replace the `createContainer` function:

```typescript
  const createContainer = async () => {
    if (!capturedImage || !newContainerName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newContainerName,
          imageData: capturedImage,
          description: newContainerDescription || undefined,
          category: newContainerCategory || undefined,
          setId: currentSet?.id || null,
          parentContainerId: selectedContainer?.id || null,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create container");
      }
      const created = await res.json();
      setCapturedImage(null);
      setNewContainerName("");
      setNewContainerDescription("");
      setNewContainerCategory("");
      setNewContainerConfidence(null);
      await fetchContainersForSet(currentSet?.id ?? null);
      setNewEntityId({ type: "container", id: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create container");
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 13: Update `createSet` to track new entity id**

In `createSet` (around line 414), after `await fetchSets(...)`, add:
```typescript
      const created = await res.json(); // move this before reset and capture id
      setNewEntityId({ type: "set", id: created.id });
```

Restructure `createSet` to capture the returned id:

```typescript
  const createSet = async () => {
    if (!newSetName) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: newSetName,
        description: newSetDescription || undefined,
        parentId: currentSet?.id || null,
      };
      if (capturedImage) body.imageData = capturedImage;
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create set");
      const created = await res.json();
      setShowCreateSet(false);
      setNewSetName("");
      setNewSetDescription("");
      setCapturedImage(null);
      await fetchSets(currentSet?.id ?? null);
      setNewEntityId({ type: "set", id: created.id });
    } catch (err) {
      setError("Failed to create set");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 14: Add auto-scroll useEffect**

After the `filteredSets`/`filteredContainers`/`filteredItems` declarations (around line 729), add:

```typescript
  // Scroll to newly created entity and flash it
  useEffect(() => {
    if (!newEntityId) return;
    const el = document.getElementById(`${newEntityId.type}-${newEntityId.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-blue-400", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-blue-400", "ring-offset-2");
        setNewEntityId(null);
      }, 2000);
    }
  }, [newEntityId, containers, standaloneItems, sets]);
```

- [ ] **Step 15: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add new state, fetchStandaloneItems, container stack navigation, auto-scroll setup"
```

---

## Task 8: UI — Browse View & "+" Dropdown

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the header buttons with "+" dropdown**

Find the header div in the browse view (around line 854):

```tsx
            {/* Header with buttons */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">{currentSet ? currentSet.name : "Inventory"}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNewSetName("");
                    setNewSetDescription("");
                    setCapturedImage(null);
                    setShowCreateSet(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                >
                  + Add Set
                </button>
                <button
                  onClick={() => containerInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                >
                  + Add Container
                </button>
              </div>
              <input
                ref={containerInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleContainerImageCapture}
                className="hidden"
              />
            </div>
```

Replace with:

```tsx
            {/* Header with "+" dropdown */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">{currentSet ? currentSet.name : "Inventory"}</h2>
              <div className="relative">
                <button
                  onClick={() => setShowAddDropdown(prev => !prev)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-xl font-bold leading-none"
                >
                  +
                </button>
                {showAddDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[160px]">
                    <button
                      onClick={() => {
                        setShowAddDropdown(false);
                        setNewSetName("");
                        setNewSetDescription("");
                        setCapturedImage(null);
                        setShowCreateSet(true);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm"
                    >
                      <span>📁</span> New Set
                    </button>
                    <button
                      onClick={() => { setShowAddDropdown(false); containerInputRef.current?.click(); }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm border-t"
                    >
                      <span>📦</span> New Container
                    </button>
                    <button
                      onClick={() => { setShowAddDropdown(false); setShowCreateItem(true); }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm border-t"
                    >
                      <span>🏷️</span> New Item
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={containerInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleContainerImageCapture}
                className="hidden"
              />
            </div>
```

Also add a click-outside handler to close the dropdown. Add this `useEffect` after the existing `useEffect` hooks (before the `fetchItems` function):

```typescript
  // Close "+" dropdown when clicking outside
  useEffect(() => {
    if (!showAddDropdown) return;
    const handler = () => setShowAddDropdown(false);
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [showAddDropdown]);
```

- [ ] **Step 2: Add standalone items section to browse view**

Find the `{filteredSets.length === 0 && filteredContainers.length === 0 && ...}` empty state block (around line 1132). Just before it, add a standalone items section. Insert after the containers grid closing `</div>` (after line 1130):

```tsx
                {/* Standalone items at this level */}
                {standaloneItems.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Items</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {standaloneItems
                        .filter(item =>
                          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
                        )
                        .map(item => (
                          <div
                            key={item.id}
                            id={`item-${item.id}`}
                            className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow transition-all duration-500"
                          >
                            <img
                              src={item.thumbnailUrl || item.imageData}
                              alt={item.name}
                              className="w-full h-48 object-cover"
                              loading="lazy"
                            />
                            <div className="p-4">
                              <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                              {item.quantity > 1 && (
                                <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mb-2">
                                  Qty: {item.quantity}
                                </span>
                              )}
                              {item.category && (
                                <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2 ml-1">
                                  {item.category}
                                </span>
                              )}
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => openEditItem(item)}
                                  className="flex-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => openMoveModal("item", item.id)}
                                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                                >
                                  Move
                                </button>
                                <button
                                  onClick={() => confirmDelete("item", item.id)}
                                  className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
```

- [ ] **Step 3: Add `id` attributes to set and container cards for auto-scroll**

In the sets grid, find each set card div (around line 966) and add `id={`set-${set.id}`}`:
```tsx
                        <div
                          key={set.id}
                          id={`set-${set.id}`}
                          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow transition-all duration-500 border-l-4 border-emerald-500"
```

In the containers grid, find each container card div (around line 1047) and add `id={`container-${container.id}`}`:
```tsx
                          className={`bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow transition-all duration-500 relative ${
```
And add `id={`container-${container.id}`}` to the outer div.

- [ ] **Step 4: Update `handleDelete` to also refresh standalone items**

In `handleDelete` (around line 617), in the `deleteTarget.type === "container"` branch, add:
```typescript
        await fetchStandaloneItems(currentSet?.id ?? null);
```
And in the `deleteTarget.type === "item"` branch, add:
```typescript
        await fetchStandaloneItems(currentSet?.id ?? null);
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: browse view with + dropdown, standalone items section, auto-scroll ids"
```

---

## Task 9: UI — Items View with Nested Containers

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update items view header to show container breadcrumbs**

Find the items view header (around line 1165):

```tsx
        {/* Items View */}
        {view === "items" && selectedContainer && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <button
                  onClick={() => {
                    setView("browse");
                    setSelectedContainer(null);
                    setItems([]);
                  }}
                  className="text-blue-600 hover:text-blue-800 mb-2"
                >
                  &larr; Back to {currentSet ? currentSet.name : "All"}
                </button>
                <h2 className="text-2xl font-semibold">Items in {selectedContainer.name}</h2>
              </div>
```

Replace with:

```tsx
        {/* Items View */}
        {view === "items" && selectedContainer && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                {/* Container breadcrumb trail */}
                <div className="flex items-center gap-1 text-sm mb-2 flex-wrap">
                  <button
                    onClick={() => navigateContainerBack(-1)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {currentSet ? currentSet.name : "Home"}
                  </button>
                  {containerStack.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <span className="text-gray-400">/</span>
                      {i === containerStack.length - 1 ? (
                        <span className="text-gray-700 font-medium">{c.name}</span>
                      ) : (
                        <button onClick={() => navigateContainerBack(i)} className="text-blue-600 hover:text-blue-800">{c.name}</button>
                      )}
                    </span>
                  ))}
                </div>
                <h2 className="text-2xl font-semibold">{selectedContainer.name}</h2>
              </div>
```

- [ ] **Step 2: Add nested containers section to items view**

After the `filteredItems` grid in the items view (after the `</div>` that closes the items grid, around line 1312), and BEFORE the closing `</div>` of the items view, fetch and show nested containers. First, add a `nestedContainers` state and fetch them.

Add a new state (in Task 7 state block):
```typescript
  const [nestedContainers, setNestedContainers] = useState<Container[]>([]);
```

Add a `fetchNestedContainers` function (near `fetchItems`):
```typescript
  const fetchNestedContainers = useCallback(async (containerId: number) => {
    try {
      const res = await fetch(`/api/containers?parentContainerId=${containerId}`);
      if (!res.ok) throw new Error("Failed to fetch nested containers");
      const data = await res.json();
      setNestedContainers(data);
    } catch (err) {
      console.error("Failed to fetch nested containers:", err);
    }
  }, []);
```

Update `fetchItems` to also call `fetchNestedContainers`:
```typescript
  const fetchItems = async (containerId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items?containerId=${containerId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch items");
      }
      const data = await res.json();
      setItems(data);
      await fetchNestedContainers(containerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
      console.error("Failed to fetch items:", err);
    } finally {
      setLoading(false);
    }
  };
```

Then in the JSX, before `{filteredItems.length === 0 ? ...}` (around line 1257), add a nested containers section:

```tsx
            {/* Nested containers */}
            {nestedContainers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-3">Containers inside {selectedContainer.name}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {nestedContainers.map(c => (
                    <div key={c.id} id={`container-${c.id}`} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow border-l-4 border-blue-400">
                      <img
                        src={c.thumbnailUrl || c.imageData}
                        alt={c.name}
                        className="w-full h-48 object-cover cursor-pointer"
                        loading="lazy"
                        onClick={() => navigateIntoContainer(c)}
                      />
                      <div className="p-4">
                        <h3 className="font-semibold text-lg mb-1">{c.name}</h3>
                        <div className="flex gap-2">
                          <button onClick={() => navigateIntoContainer(c)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm">Open</button>
                          <button onClick={() => openMoveModal("container", c.id)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm">Move</button>
                          <button onClick={() => confirmDelete("container", c.id)} className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
```

- [ ] **Step 3: Add "Move" button to items in the items view**

In the items grid (around line 1294), in the button group for each item, add a Move button after Edit:

```tsx
                        <button
                          onClick={() => openMoveModal("item", item.id)}
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                        >
                          Move
                        </button>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: items view shows nested containers with navigation stack"
```

---

## Task 10: UI — Universal Move Modal

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `openMoveModal` to fetch tree**

Find `openMoveModal` (around line 546):

```typescript
  const openMoveModal = async (type: "container" | "set", id: number) => {
    setMoveTarget({ type, id });
    await fetchAllSets();
    setShowMoveModal(true);
  };
```

Replace with:

```typescript
  const openMoveModal = async (type: "container" | "set" | "item", id: number) => {
    setMoveTarget({ type, id });
    setMoveSearchTerm("");
    await fetchTree();
    setShowMoveModal(true);
  };
```

- [ ] **Step 2: Update `openBulkMoveModal` to fetch tree**

Find `openBulkMoveModal` (around line 552):

```typescript
  const openBulkMoveModal = async () => {
    await fetchAllSets();
    setIsBulkMove(true);
    setMoveTarget(null);
    setShowMoveModal(true);
  };
```

Replace with:

```typescript
  const openBulkMoveModal = async () => {
    setMoveSearchTerm("");
    await fetchTree();
    setIsBulkMove(true);
    setMoveTarget(null);
    setShowMoveModal(true);
  };
```

- [ ] **Step 3: Replace `moveToSet` with `moveToDestination`**

Find the `moveToSet` function (around line 516) and replace it and the `moveToSet` references with:

```typescript
  const moveToDestination = async (dest: { id: number; type: "set" | "container" } | null) => {
    if (!moveTarget) return;
    setLoading(true);
    setError(null);
    try {
      if (moveTarget.type === "container") {
        const body: Record<string, unknown> = { id: moveTarget.id };
        if (dest === null) {
          body.setId = null; body.parentContainerId = null;
        } else if (dest.type === "set") {
          body.setId = dest.id; body.parentContainerId = null;
        } else {
          body.parentContainerId = dest.id; body.setId = null;
        }
        await fetch("/api/containers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (moveTarget.type === "set") {
        const parentId = dest?.type === "set" ? dest.id : null;
        await fetch("/api/sets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: moveTarget.id, parentId }) });
      } else if (moveTarget.type === "item") {
        const body: Record<string, unknown> = { id: moveTarget.id };
        if (dest === null) {
          body.containerId = null; body.setId = null;
        } else if (dest.type === "container") {
          body.containerId = dest.id; body.setId = null;
        } else {
          body.setId = dest.id; body.containerId = null;
        }
        await fetch("/api/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowMoveModal(false);
      setMoveTarget(null);
      await Promise.all([
        fetchSets(currentSet?.id ?? null),
        fetchContainersForSet(currentSet?.id ?? null),
        fetchStandaloneItems(currentSet?.id ?? null),
      ]);
      if (selectedContainer) await fetchItems(selectedContainer.id);
    } catch (err) {
      setError("Failed to move");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 4: Update `bulkMoveToSet` to use destination type**

Find `bulkMoveToSet` (around line 559). Update its signature and body to use `moveToDestination` semantics for sets only (bulk move remains container-to-set):

```typescript
  const bulkMoveToDestination = async (dest: { id: number; type: "set" | "container" } | null) => {
    setLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedContainerIds);
      const results = await Promise.allSettled(
        ids.map(id => {
          const body: Record<string, unknown> = { id };
          if (dest === null) { body.setId = null; body.parentContainerId = null; }
          else if (dest.type === "set") { body.setId = dest.id; body.parentContainerId = null; }
          else { body.parentContainerId = dest.id; body.setId = null; }
          return fetch("/api/containers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        })
      );
      const failedIndices = results
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && !(r as PromiseFulfilledResult<Response>).value.ok))
        .map(({ i }) => i);
      if (failedIndices.length > 0) {
        setError(`${failedIndices.length} container(s) could not be moved.`);
      }
      setSelectedContainerIds(new Set(failedIndices.map(i => ids[i])));
      fetchContainersForSet(currentSet?.id ?? null);
      fetchSets(currentSet?.id ?? null);
    } finally {
      setShowMoveModal(false);
      setIsBulkMove(false);
      setLoading(false);
    }
  };
```

- [ ] **Step 5: Replace the Move-To Modal JSX**

Find the `{/* Move-To Modal */}` block (around line 1694) and replace it:

```tsx
        {/* Move-To Modal */}
        {showMoveModal && (moveTarget || isBulkMove) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] flex flex-col">
              <h3 className="text-xl font-semibold mb-3">
                {isBulkMove ? `Move ${selectedContainerIds.size} containers to…` : "Move to…"}
              </h3>
              <input
                type="text"
                placeholder="Search destinations..."
                value={moveSearchTerm}
                onChange={e => setMoveSearchTerm(e.target.value)}
                className="border px-3 py-2 rounded mb-3 w-full text-sm"
              />
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {/* Root option */}
                <button
                  onClick={() => isBulkMove ? bulkMoveToDestination(null) : moveToDestination(null)}
                  className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 font-medium flex items-center gap-2 text-sm"
                >
                  🏠 Root (top level)
                </button>
                {treeNodes
                  .filter(node => {
                    // Sets can only go into sets
                    if (moveTarget?.type === "set" && node.type === "container") return false;
                    // Can't move to self
                    if (moveTarget && node.type === moveTarget.type && node.id === moveTarget.id) return false;
                    // Search filter
                    if (moveSearchTerm && !node.name.toLowerCase().includes(moveSearchTerm.toLowerCase())) return false;
                    return true;
                  })
                  .map(node => (
                    <button
                      key={`${node.type}-${node.id}`}
                      onClick={() => isBulkMove ? bulkMoveToDestination({ id: node.id, type: node.type }) : moveToDestination({ id: node.id, type: node.type })}
                      className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 flex items-center gap-2 text-sm"
                      style={{ paddingLeft: `${1 + node.depth * 1.25}rem` }}
                    >
                      <span>{node.type === "set" ? "📁" : "📦"}</span>
                      <span>{node.name}</span>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => { setShowMoveModal(false); setMoveTarget(null); setIsBulkMove(false); }}
                className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Update the bulk action bar label**

Find the bulk action bar (around line 1144) and update the button label from "Move to Set" to "Move to…":
```tsx
              <button
                onClick={openBulkMoveModal}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Move to…
              </button>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: universal move modal with flat searchable tree, supports sets/containers/items"
```

---

## Task 11: UI — Standalone Item Creation Modal

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add standalone item creation modal to JSX**

After the `{/* Create Set Modal */}` block (after line 1692), add:

```tsx
        {/* Create Standalone Item Modal */}
        {showCreateItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">
                New Item{currentSet ? ` in ${currentSet.name}` : " (standalone)"}
              </h3>
              {!capturedImage ? (
                <div className="text-center py-6">
                  <button
                    onClick={() => itemInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
                  >
                    📷 Take Photo
                  </button>
                  <input
                    ref={itemInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleItemImageCapture}
                    className="hidden"
                  />
                </div>
              ) : (
                <>
                  <img src={capturedImage} alt="Captured" className="w-full h-48 object-cover rounded mb-4" />
                  <button
                    onClick={() => identifyImage("item")}
                    disabled={identifying}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded mb-4 disabled:opacity-50"
                  >
                    {identifying ? "Identifying..." : "✨ Identify with AI"}
                  </button>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input
                        type="text"
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        className="border px-3 py-2 rounded w-full"
                        placeholder="Item name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={newItemDescription}
                        onChange={e => setNewItemDescription(e.target.value)}
                        className="border px-3 py-2 rounded w-full"
                        rows={2}
                        placeholder="Optional description"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Category</label>
                      <input
                        type="text"
                        value={newItemCategory}
                        onChange={e => setNewItemCategory(e.target.value)}
                        className="border px-3 py-2 rounded w-full"
                        placeholder="Optional category"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemQuantity || ""}
                        onChange={e => setNewItemQuantity(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        className="border px-3 py-2 rounded w-32"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={createStandaloneItem}
                        disabled={loading || !newItemName}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                      >
                        Save Item
                      </button>
                      <button
                        onClick={() => { setShowCreateItem(false); resetForm(); }}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: standalone item creation modal from browse/root view"
```

---

## Self-Review Checklist

After all tasks are complete:

- [ ] All 5 spec sections covered: EXIF fix ✓, schema ✓, create from root ✓, move anywhere ✓, newest first ✓
- [ ] `TreeNode` type import in `page.tsx` — verify `src/app/api/tree/route.ts` exports it
- [ ] `bulkMoveToSet` references — search `page.tsx` for `bulkMoveToSet` and replace with `bulkMoveToDestination`
- [ ] `moveToSet` references — search `page.tsx` for `moveToSet` and replace with `moveToDestination`
- [ ] `fetchAllSets` calls in `openMoveModal`/`openBulkMoveModal` replaced with `fetchTree` ✓
- [ ] Items deleted from browse view (standalone items) also refresh `standaloneItems` state ✓
- [ ] `nestedContainers` state and `fetchNestedContainers` added in Task 9 step 2 (listed as separate steps in Task 7 for clarity — ensure they are added)
