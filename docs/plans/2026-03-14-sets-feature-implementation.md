# Sets Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hierarchical "sets" that group containers, with nestable sets, optional images, breadcrumb navigation, move-to actions, and a flattened items toggle.

**Architecture:** Self-referencing `parent_id` on a new `sets` table. Containers get a nullable `set_id` FK. The UI becomes a directory-style drill-down: root shows sets + unassigned containers, clicking a set shows its children. All sorted most-recent-first.

**Tech Stack:** Next.js App Router, SQLite via better-sqlite3 + Drizzle ORM, Tailwind CSS, all in a single `page.tsx` (monolith pattern — match existing style).

**Design doc:** `docs/plans/2026-03-14-sets-feature-design.md`

---

### Task 1: Database Schema — Add `sets` table and `set_id` to containers

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`
- Create: `src/db/migrations/0002_add_sets.sql`

**Step 1: Add sets table and set_id column to Drizzle schema**

In `src/db/schema.ts`, add before the `containers` table definition:

```typescript
export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  imageData: text("image_data"),
  parentId: integer("parent_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

In the `containers` table, add after `confidence`:

```typescript
  setId: integer("set_id"),
```

Note: We skip FK declarations in Drizzle since the existing codebase doesn't use ON DELETE CASCADE (manual cascade in route handlers). The `parentId` self-reference and `setId` reference are enforced at the application layer.

**Step 2: Add migration SQL file**

Create `src/db/migrations/0002_add_sets.sql`:

```sql
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
```

**Step 3: Update migrate.ts initialization script**

Add the `sets` CREATE TABLE block to the `sqlite.exec()` template string (after the items table). Add `set_id INTEGER` to the containers CREATE TABLE definition. This handles fresh DBs.

In `src/db/migrate.ts`, add inside the `sqlite.exec()` backtick string, after the items CREATE TABLE:

```sql
  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_data TEXT,
    parent_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );
```

And add `set_id INTEGER,` to the containers CREATE TABLE (after `confidence REAL,`).

**Step 4: Run the migration against the Docker volume DB**

The app uses `DB_PATH=/data/inventory.db` in Docker. For local dev, it uses `./inventory.db`. The migration SQL needs to run against the existing DB. The simplest path: the API routes will call `db` from `src/db/index.ts` which connects but doesn't auto-migrate. We need to run the ALTER TABLE manually on first load.

Add to `src/db/index.ts`, after the `drizzle()` call:

```typescript
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
  // Add set_id to containers if missing
  const cols = sqlite.pragma('table_info(containers)') as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'set_id')) {
    sqlite.exec(`ALTER TABLE containers ADD COLUMN set_id INTEGER`);
  }
} catch (e) {
  // Table/column already exists — safe to ignore
}
```

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/db/migrate.ts src/db/migrations/0002_add_sets.sql
git commit -m "feat: add sets table and set_id column to containers"
```

---

### Task 2: API — Create `/api/sets` CRUD route

**Files:**
- Create: `src/app/api/sets/route.ts`

**Step 1: Create the sets CRUD route**

Create `src/app/api/sets/route.ts`. This mirrors the existing containers route pattern exactly:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    let result;
    if (parentId === "null") {
      result = await db.select().from(sets).where(isNull(sets.parentId)).orderBy(desc(sets.createdAt));
    } else if (parentId) {
      result = await db.select().from(sets).where(eq(sets.parentId, parseInt(parentId))).orderBy(desc(sets.createdAt));
    } else {
      result = await db.select().from(sets).orderBy(desc(sets.createdAt));
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch sets:", error);
    return NextResponse.json({
      error: "Failed to fetch sets",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, description, imageData, parentId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const values: Record<string, unknown> = {
      name,
      description: description || null,
      parentId: parentId || null,
    };

    if (imageData) {
      const processed = await processImage(imageData);
      values.imageData = processed.imageData;
    }

    const newSet = await db.insert(sets).values(values).returning();
    return NextResponse.json(newSet[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create set:", error);
    return NextResponse.json({
      error: "Failed to create set",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, description, imageData, parentId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Set ID is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (parentId !== undefined) updateData.parentId = parentId;

    if (imageData) {
      const processed = await processImage(imageData);
      updateData.imageData = processed.imageData;
    }

    const updated = await db.update(sets).set(updateData).where(eq(sets.id, id)).returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error("Failed to update set:", error);
    return NextResponse.json({
      error: "Failed to update set",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Set ID is required" }, { status: 400 });
    }

    const setId = parseInt(id);

    // Unassign all containers in this set (set_id -> NULL)
    await db.update(containers).set({ setId: null }).where(eq(containers.setId, setId));

    // Promote child sets to root (parent_id -> NULL)
    await db.update(sets).set({ parentId: null }).where(eq(sets.parentId, setId));

    // Delete the set
    const deleted = await db.delete(sets).where(eq(sets.id, setId)).returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Set deleted successfully" });
  } catch (error) {
    console.error("Failed to delete set:", error);
    return NextResponse.json({ error: "Failed to delete set" }, { status: 500 });
  }
}
```

**Step 2: Verify route loads**

Run: `npx next build` (or `npm run build`) — should compile without errors. The new route should appear as `f /api/sets` in the build output.

**Step 3: Commit**

```bash
git add src/app/api/sets/route.ts
git commit -m "feat: add /api/sets CRUD route"
```

---

### Task 3: API — Create `/api/sets/items` flattened items route

**Files:**
- Create: `src/app/api/sets/items/route.ts`

**Step 1: Create the flattened items route**

This uses a recursive approach: given a setId, collect all container IDs in that set and its child sets (up to 3 levels), then fetch all items for those containers.

Create `src/app/api/sets/items/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers, items } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const setId = searchParams.get("setId");

    if (!setId) {
      return NextResponse.json({ error: "setId is required" }, { status: 400 });
    }

    const rootId = parseInt(setId);

    // Collect all set IDs recursively (max 3 levels deep)
    const allSetIds: number[] = [rootId];

    // Level 1: direct children
    const level1 = await db.select({ id: sets.id }).from(sets).where(eq(sets.parentId, rootId));
    const level1Ids = level1.map(s => s.id);
    allSetIds.push(...level1Ids);

    // Level 2: grandchildren
    if (level1Ids.length > 0) {
      const level2 = await db.select({ id: sets.id }).from(sets).where(inArray(sets.parentId, level1Ids));
      const level2Ids = level2.map(s => s.id);
      allSetIds.push(...level2Ids);

      // Level 3: great-grandchildren (safety net)
      if (level2Ids.length > 0) {
        const level3 = await db.select({ id: sets.id }).from(sets).where(inArray(sets.parentId, level2Ids));
        allSetIds.push(...level3.map(s => s.id));
      }
    }

    // Get all containers in any of these sets
    const setContainers = await db.select({ id: containers.id })
      .from(containers)
      .where(inArray(containers.setId, allSetIds));

    const containerIds = setContainers.map(c => c.id);

    if (containerIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get all items in those containers
    const allItems = await db.select().from(items).where(inArray(items.containerId, containerIds));

    return NextResponse.json(allItems);
  } catch (error) {
    console.error("Failed to fetch set items:", error);
    return NextResponse.json({
      error: "Failed to fetch set items",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/sets/items/route.ts
git commit -m "feat: add /api/sets/items route for flattened items view"
```

---

### Task 4: API — Modify `/api/containers` to support `setId`

**Files:**
- Modify: `src/app/api/containers/route.ts`

**Step 1: Update GET to support setId filter**

In the GET handler, replace the current simple query with setId-aware filtering:

```typescript
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const setIdParam = searchParams.get("setId");

    let result;
    if (setIdParam === "null") {
      result = await db.select().from(containers).where(isNull(containers.setId)).orderBy(desc(containers.createdAt));
    } else if (setIdParam) {
      result = await db.select().from(containers).where(eq(containers.setId, parseInt(setIdParam))).orderBy(desc(containers.createdAt));
    } else {
      result = await db.select().from(containers).orderBy(desc(containers.createdAt));
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch containers:", error);
    return NextResponse.json({
      error: "Failed to fetch containers",
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
```

Add `isNull` to the imports: `import { eq, desc, isNull } from "drizzle-orm";`

**Step 2: Update POST to accept setId**

In the POST handler, destructure `setId` from the body and include it in the insert:

```typescript
const { name, imageData, description, category, setId } = await request.json();
// ... existing validation ...
const newContainer = await db.insert(containers).values({
  name,
  imageData: processedImage.imageData,
  description: description || null,
  category: category || null,
  setId: setId || null,
}).returning();
```

**Step 3: Update PUT to accept setId**

In the PUT handler, destructure `setId` and add it to the update logic:

```typescript
const { id, name, imageData, description, category, confidence, setId } = await request.json();
// ... existing logic ...
if (setId !== undefined) updateData.setId = setId;
```

**Step 4: Commit**

```bash
git add src/app/api/containers/route.ts
git commit -m "feat: add setId filter and field to containers API"
```

---

### Task 5: UI — Add Set interface, state, and fetch functions

**Files:**
- Modify: `src/app/page.tsx`

This is the largest task. We modify the monolithic page.tsx to add sets support. We'll do it in sub-steps.

**Step 1: Add Set interface and update View type**

At the top of page.tsx, after the Item interface (line ~31), add:

```typescript
interface Set {
  id: number;
  name: string;
  description?: string;
  imageData?: string;
  parentId?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Update the View type:

```typescript
type View = "browse" | "items" | "edit-container" | "edit-item" | "edit-set";
```

`"browse"` replaces `"containers"` — it now shows sets + containers at whatever level you're viewing.

**Step 2: Add state variables**

After the existing state declarations (~line 67), add:

```typescript
const [sets, setSets] = useState<Set[]>([]);
const [currentSet, setCurrentSet] = useState<Set | null>(null); // which set we're "inside"
const [breadcrumbs, setBreadcrumbs] = useState<Set[]>([]); // ancestry chain for breadcrumb nav
const [showAllItems, setShowAllItems] = useState(false); // flattened items toggle
const [allSetItems, setAllSetItems] = useState<Item[]>([]); // items from flattened view
const [selectedSet, setSelectedSet] = useState<Set | null>(null); // set being edited
const [newSetName, setNewSetName] = useState("");
const [newSetDescription, setNewSetDescription] = useState("");
const [showCreateSet, setShowCreateSet] = useState(false);
const [showMoveModal, setShowMoveModal] = useState(false);
const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
const [allSets, setAllSets] = useState<Set[]>([]); // all sets for move-to picker

const setInputRef = useRef<HTMLInputElement>(null);
```

**Step 3: Add fetch functions**

After `fetchContainers` (line ~90), add:

```typescript
const fetchSets = useCallback(async (parentId?: number | null) => {
  try {
    const param = parentId === null || parentId === undefined ? "null" : String(parentId);
    const res = await fetch(`/api/sets?parentId=${param}`);
    if (!res.ok) throw new Error("Failed to fetch sets");
    const data = await res.json();
    setSets(data);
  } catch (err) {
    console.error("Failed to fetch sets:", err);
  }
}, []);

const fetchAllSets = useCallback(async () => {
  try {
    const res = await fetch("/api/sets");
    if (!res.ok) throw new Error("Failed to fetch all sets");
    const data = await res.json();
    setAllSets(data);
  } catch (err) {
    console.error("Failed to fetch all sets:", err);
  }
}, []);

const fetchContainersForSet = useCallback(async (setId: number | null) => {
  try {
    const param = setId === null ? "null" : String(setId);
    const res = await fetch(`/api/containers?setId=${param}`);
    if (!res.ok) throw new Error("Failed to fetch containers");
    const data = await res.json();
    setContainers(data);
  } catch (err) {
    console.error("Failed to fetch containers:", err);
  }
}, []);

const fetchSetItems = useCallback(async (setId: number) => {
  try {
    const res = await fetch(`/api/sets/items?setId=${setId}`);
    if (!res.ok) throw new Error("Failed to fetch set items");
    const data = await res.json();
    setAllSetItems(data);
  } catch (err) {
    console.error("Failed to fetch set items:", err);
  }
}, []);
```

**Step 4: Update useEffect for initial load**

Replace the existing useEffect that calls `fetchContainers()` with:

```typescript
useEffect(() => {
  // Load root-level sets and unassigned containers
  fetchSets(null);
  fetchContainersForSet(null);
}, [fetchSets, fetchContainersForSet]);
```

Change initial view state from `"containers"` to `"browse"`.

**Step 5: Add set CRUD functions**

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
    if (capturedImage) {
      body.imageData = capturedImage;
    }
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to create set");

    setShowCreateSet(false);
    setNewSetName("");
    setNewSetDescription("");
    setCapturedImage(null);
    await fetchSets(currentSet?.id ?? null);
  } catch (err) {
    setError("Failed to create set");
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const updateSet = async () => {
  if (!selectedSet) return;
  setLoading(true);
  setError(null);
  try {
    const body: Record<string, unknown> = {
      id: selectedSet.id,
      name: newSetName,
      description: newSetDescription,
    };
    if (capturedImage) {
      body.imageData = capturedImage;
    }
    const res = await fetch("/api/sets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update set");

    setCapturedImage(null);
    setNewSetName("");
    setNewSetDescription("");
    setSelectedSet(null);
    setView("browse");
    await fetchSets(currentSet?.id ?? null);
  } catch (err) {
    setError("Failed to update set");
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const deleteSet = async (id: number) => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`/api/sets?id=${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete set");
    await fetchSets(currentSet?.id ?? null);
    await fetchContainersForSet(currentSet?.id ?? null);
  } catch (err) {
    setError("Failed to delete set");
    console.error(err);
  } finally {
    setLoading(false);
  }
};
```

**Step 6: Add navigation functions**

```typescript
const navigateIntoSet = async (set: Set) => {
  setBreadcrumbs(prev => [...prev, set]);
  setCurrentSet(set);
  setShowAllItems(false);
  setSearchTerm("");
  await Promise.all([
    fetchSets(set.id),
    fetchContainersForSet(set.id),
  ]);
};

const navigateToBreadcrumb = async (index: number) => {
  if (index === -1) {
    // Home
    setCurrentSet(null);
    setBreadcrumbs([]);
    setShowAllItems(false);
    setSearchTerm("");
    await Promise.all([
      fetchSets(null),
      fetchContainersForSet(null),
    ]);
  } else {
    const target = breadcrumbs[index];
    setCurrentSet(target);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setShowAllItems(false);
    setSearchTerm("");
    await Promise.all([
      fetchSets(target.id),
      fetchContainersForSet(target.id),
    ]);
  }
};

const openEditSet = (set: Set) => {
  setSelectedSet(set);
  setNewSetName(set.name);
  setNewSetDescription(set.description || "");
  setView("edit-set");
};
```

**Step 7: Add move function**

```typescript
const moveToSet = async (targetSetId: number | null) => {
  if (!moveTarget) return;
  setLoading(true);
  try {
    if (moveTarget.type === "container") {
      await fetch("/api/containers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: moveTarget.id, setId: targetSetId }),
      });
    } else {
      await fetch("/api/sets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: moveTarget.id, parentId: targetSetId }),
      });
    }
    setShowMoveModal(false);
    setMoveTarget(null);
    await fetchSets(currentSet?.id ?? null);
    await fetchContainersForSet(currentSet?.id ?? null);
  } catch (err) {
    setError("Failed to move item");
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const openMoveModal = async (type: "container" | "set", id: number) => {
  setMoveTarget({ type, id });
  await fetchAllSets();
  setShowMoveModal(true);
};
```

**Step 8: Update deleteTarget to support sets**

Change the deleteTarget type:

```typescript
const [deleteTarget, setDeleteTarget] = useState<{ type: "container" | "item" | "set"; id: number } | null>(null);
```

Update `confirmDelete`:

```typescript
const confirmDelete = (type: "container" | "item" | "set", id: number) => {
  setDeleteTarget({ type, id });
  setShowDeleteConfirm(true);
};
```

Update `handleDelete` to handle set deletion:

```typescript
const handleDelete = async () => {
  if (!deleteTarget) return;
  setLoading(true);
  setError(null);
  try {
    const endpoint = deleteTarget.type === "container" ? "/api/containers"
      : deleteTarget.type === "item" ? "/api/items"
      : "/api/sets";
    const res = await fetch(`${endpoint}?id=${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete ${deleteTarget.type}`);

    setShowDeleteConfirm(false);
    setDeleteTarget(null);

    if (deleteTarget.type === "container") {
      await fetchContainersForSet(currentSet?.id ?? null);
      setSelectedContainer(null);
      setItems([]);
    } else if (deleteTarget.type === "set") {
      await fetchSets(currentSet?.id ?? null);
      await fetchContainersForSet(currentSet?.id ?? null);
    } else if (selectedContainer) {
      await fetchItems(selectedContainer.id);
    }
  } catch (err) {
    setError(`Failed to delete ${deleteTarget.type}`);
    console.error(err);
  } finally {
    setLoading(false);
  }
};
```

**Step 9: Update filtered data**

Add filtered sets:

```typescript
const filteredSets = sets.filter(set =>
  set.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
  (set.description && set.description.toLowerCase().includes(searchTerm.toLowerCase()))
);
```

**Step 10: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add sets state, fetch, CRUD, navigation, and move logic"
```

---

### Task 6: UI — Replace container view with browse view (sets + containers)

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Replace the `{view === "containers" && ...}` block**

Replace the entire containers view block (the `{view === "containers" && (...)}` section, roughly lines 537-632) with the new browse view. This is the largest UI change.

The new browse view renders:
1. Breadcrumb bar (if inside a set)
2. Action buttons (+ Add Set, + Add Container)
3. Search bar
4. Flattened items toggle (if inside a set)
5. Set cards grid
6. Container cards grid (below sets)

```tsx
{view === "browse" && (
  <div>
    {/* Breadcrumbs */}
    {breadcrumbs.length > 0 && (
      <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <button onClick={() => navigateToBreadcrumb(-1)} className="text-blue-600 hover:text-blue-800">
          Home
        </button>
        {breadcrumbs.map((bc, i) => (
          <span key={bc.id} className="flex items-center gap-2">
            <span className="text-gray-400">/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="text-gray-700 font-medium">{bc.name}</span>
            ) : (
              <button onClick={() => navigateToBreadcrumb(i)} className="text-blue-600 hover:text-blue-800">
                {bc.name}
              </button>
            )}
          </span>
        ))}
      </div>
    )}

    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-semibold">
        {currentSet ? currentSet.name : "All Sets & Containers"}
      </h2>
      <div className="flex gap-2">
        <button
          onClick={() => setShowCreateSet(true)}
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
        <input
          ref={containerInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleContainerImageCapture}
          className="hidden"
        />
      </div>
    </div>

    <input
      type="text"
      placeholder="Search..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="border px-4 py-2 rounded w-full mb-4"
    />

    {/* Flattened items toggle — only when inside a set */}
    {currentSet && (
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={async () => {
            if (!showAllItems) {
              await fetchSetItems(currentSet.id);
            }
            setShowAllItems(!showAllItems);
          }}
          className={`px-3 py-1 rounded text-sm font-medium ${
            showAllItems ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {showAllItems ? "Show Sets & Containers" : "Show All Items"}
        </button>
      </div>
    )}

    {/* Flattened items view */}
    {showAllItems && currentSet ? (
      <div>
        {allSetItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No items in this set or its sub-sets.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allSetItems.map(item => (
              <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
                <img src={item.thumbnailUrl || item.imageData} alt={item.name} className="w-full h-48 object-cover" loading="lazy" />
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                  {item.quantity > 1 && (
                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mb-2">Qty: {item.quantity}</span>
                  )}
                  {item.category && (
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2">{item.category}</span>
                  )}
                  {item.description && <p className="text-gray-600 text-sm mb-2">{item.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : (
      <>
        {/* Sets grid */}
        {filteredSets.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Sets</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSets.map(set => (
                <div key={set.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow border-l-4 border-emerald-500">
                  {set.imageData ? (
                    <img
                      src={set.imageData}
                      alt={set.name}
                      className="w-full h-48 object-cover cursor-pointer"
                      loading="lazy"
                      onClick={() => navigateIntoSet(set)}
                    />
                  ) : (
                    <div
                      className="w-full h-48 bg-emerald-50 flex items-center justify-center cursor-pointer"
                      onClick={() => navigateIntoSet(set)}
                    >
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-emerald-400 text-sm mt-1 block">Set</span>
                      </div>
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-lg mb-1">{set.name}</h3>
                    {set.description && <p className="text-gray-600 text-sm mb-2">{set.description}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigateIntoSet(set)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => openEditSet(set)}
                        className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openMoveModal("set", set.id)}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1 rounded text-sm"
                      >
                        Move
                      </button>
                      <button
                        onClick={() => confirmDelete("set", set.id)}
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

        {/* Containers grid */}
        {filteredContainers.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Containers</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredContainers.map(container => (
                <div key={container.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
                  <img
                    src={container.thumbnailUrl || container.imageData}
                    alt={container.name}
                    className="w-full h-48 object-cover cursor-pointer"
                    loading="lazy"
                    onClick={() => {
                      setSelectedContainer(container);
                      fetchItems(container.id);
                      setView("items");
                    }}
                  />
                  <div className="p-4">
                    <h3 className="font-semibold text-lg mb-1">{container.name}</h3>
                    {container.category && (
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2">{container.category}</span>
                    )}
                    {container.description && <p className="text-gray-600 text-sm mb-2">{container.description}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedContainer(container);
                          fetchItems(container.id);
                          setView("items");
                        }}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm"
                      >
                        View Items
                      </button>
                      <button
                        onClick={() => openEditContainer(container)}
                        className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openMoveModal("container", container.id)}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1 rounded text-sm"
                      >
                        Move
                      </button>
                      <button
                        onClick={() => confirmDelete("container", container.id)}
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

        {filteredSets.length === 0 && filteredContainers.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {searchTerm ? "No results match your search" : "Nothing here yet. Add a set or container to get started!"}
          </div>
        )}
      </>
    )}
  </div>
)}
```

**Step 2: Update items view "Back" button**

In the items view, update the Back button to return to browse and restore the correct set context:

```tsx
<button
  onClick={() => {
    setView("browse");
    setSelectedContainer(null);
    setItems([]);
  }}
  className="text-blue-600 hover:text-blue-800 mb-2"
>
  ← Back to {currentSet ? currentSet.name : "All"}
</button>
```

**Step 3: Update edit-container "Cancel" button**

Change `setView("containers")` to `setView("browse")` in the cancel handler and in `updateContainer`.

**Step 4: Update createContainer to include setId**

In the `createContainer` function, add `setId: currentSet?.id || null` to the body, and after success call `fetchContainersForSet(currentSet?.id ?? null)` instead of `fetchContainers()`.

**Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace containers view with browse view showing sets + containers"
```

---

### Task 7: UI — Add edit-set view, create-set modal, and move-to modal

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add Edit Set view**

After the edit-item view block, add:

```tsx
{/* Edit Set View */}
{view === "edit-set" && selectedSet && (
  <div className="bg-white rounded-lg shadow p-6">
    <h2 className="text-2xl font-semibold mb-4">Edit Set</h2>
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} className="border px-3 py-2 rounded w-full" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} className="border px-3 py-2 rounded w-full" rows={3} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Image (optional)</label>
        <button onClick={() => setInputRef.current?.click()} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded">Choose Image</button>
        <input ref={setInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => setCapturedImage(reader.result as string);
            reader.readAsDataURL(file);
          }
        }} className="hidden" />
        {(capturedImage || selectedSet.imageData) && (
          <img src={capturedImage || selectedSet.imageData} alt="Set image" className="mt-2 w-32 h-32 object-cover rounded" />
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={updateSet} disabled={loading || !newSetName} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50">Save Changes</button>
        <button onClick={() => { resetForm(); setSelectedSet(null); setView("browse"); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
      </div>
    </div>
  </div>
)}
```

**Step 2: Add Create Set modal**

After the create-item form modal, add:

```tsx
{/* Create Set Modal */}
{showCreateSet && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
      <h3 className="text-xl font-semibold mb-4">New Set{currentSet ? ` in ${currentSet.name}` : ""}</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} className="border px-3 py-2 rounded w-full" placeholder="Set name (e.g., First Floor, Bedroom)" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} className="border px-3 py-2 rounded w-full" rows={2} placeholder="Optional description" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Image (optional)</label>
          <button onClick={() => setInputRef.current?.click()} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-sm">Choose Image</button>
          <input ref={setInputRef} type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => setCapturedImage(reader.result as string);
              reader.readAsDataURL(file);
            }
          }} className="hidden" />
          {capturedImage && <img src={capturedImage} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded" />}
        </div>
        <div className="flex gap-2">
          <button onClick={createSet} disabled={loading || !newSetName} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50">Create Set</button>
          <button onClick={() => { setShowCreateSet(false); setNewSetName(""); setNewSetDescription(""); setCapturedImage(null); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
        </div>
      </div>
    </div>
  </div>
)}
```

**Step 3: Add Move-To modal**

```tsx
{/* Move-To Modal */}
{showMoveModal && moveTarget && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
      <h3 className="text-xl font-semibold mb-4">Move to...</h3>
      <div className="space-y-2">
        <button
          onClick={() => moveToSet(null)}
          className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 font-medium"
        >
          Top Level (unassigned)
        </button>
        {allSets
          .filter(s => s.id !== moveTarget.id)
          .map(set => (
            <button
              key={set.id}
              onClick={() => moveToSet(set.id)}
              className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50"
            >
              {set.name}
              {set.description && <span className="text-gray-500 text-sm ml-2">— {set.description}</span>}
            </button>
          ))}
      </div>
      <button
        onClick={() => { setShowMoveModal(false); setMoveTarget(null); }}
        className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

**Step 4: Update delete confirmation to mention sets**

In the delete confirmation modal, update the text:

```tsx
<p className="mb-6">
  Are you sure you want to delete this {deleteTarget.type}? This action cannot be undone.
  {deleteTarget.type === "container" && " All items in this container will also be deleted."}
  {deleteTarget.type === "set" && " Containers and child sets will be moved to the top level."}
</p>
```

**Step 5: Update the create-container modal to include setId**

In the `createContainer` function body, add `setId: currentSet?.id || null` and after success, call `fetchContainersForSet(currentSet?.id ?? null)` instead of `fetchContainers()`.

**Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add edit-set, create-set, and move-to modals"
```

---

### Task 8: Update export routes for set hierarchy

**Files:**
- Modify: `src/app/api/export/route.ts`
- Modify: `src/app/api/export-gallery/route.ts`

**Step 1: Update CSV/JSON export**

Import `sets` from schema. Add set columns to the export:

- Add `setId`, `setName` columns to the export data
- Join containers with their set names
- Add `Set Name` to CSV headers

This is a straightforward extension — fetch all sets, build a lookup map `{ [setId]: setName }`, and add `setName: setLookup[container.setId] || ""` to each row.

**Step 2: Update HTML gallery export**

Group containers by set in the gallery output. Sets become top-level `<details>` sections, with containers nested inside. Unassigned containers get their own section.

**Step 3: Commit**

```bash
git add src/app/api/export/route.ts src/app/api/export-gallery/route.ts
git commit -m "feat: add set hierarchy to export routes"
```

---

### Task 9: Build, test, and deploy

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no errors. All routes appear in the output.

**Step 2: Test locally**

```bash
npm run dev
```

Manual smoke test:
- Create a set from root
- Create a nested set inside it
- Create a container (unassigned)
- Move the container into a set
- Drill into the set, verify breadcrumbs work
- Toggle "Show All Items" inside a set
- Edit a set
- Delete a set, verify containers become unassigned
- Export CSV, verify set columns present
- Export gallery, verify set grouping

**Step 3: Rebuild Docker**

```bash
docker compose down && docker compose up -d --build
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: sets feature complete — hierarchical container grouping"
```
