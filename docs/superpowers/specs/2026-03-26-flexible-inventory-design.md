# Flexible Inventory Nesting — Design Spec

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Four changes to the iOS Inventory app:

1. **Bug fix** — photos appearing upside-down due to EXIF orientation not being applied
2. **Flexible nesting** — sets, containers, and items can all live at root, inside sets, or inside containers (with appropriate constraints)
3. **Create from root** — single "+" dropdown at the top level to create any entity type
4. **Sort newest first + auto-scroll** — latest created entities appear at top; UI scrolls to new items after creation

---

## 1. Data Model Changes

### Principle
Approach A: extend existing tables with nullable foreign keys. No data loss. Two small additions, one constraint rule enforced at app level.

### `items` table — add `setId`
```sql
setId INTEGER REFERENCES sets(id) ON DELETE SET NULL
```
An item's parent is determined by which FK is set:
- `containerId` set → item lives inside a container
- `setId` set → item lives directly inside a set
- both null → item is at root (standalone)
- **constraint:** only one of `containerId` / `setId` may be non-null at a time (enforced in API)

### `containers` table — add `parentContainerId`
```sql
parentContainerId INTEGER REFERENCES containers(id) ON DELETE SET NULL
```
A container's parent is determined by which FK is set:
- `setId` set → container lives inside a set
- `parentContainerId` set → container lives inside another container
- both null → container is at root
- **constraint:** only one of `setId` / `parentContainerId` may be non-null at a time (enforced in API)
- **constraint:** a container may not be its own ancestor (circular nesting prevention — enforced in move API)

### `sets` table — unchanged
Already has `parentId` (nullable FK → sets) for nesting. No changes needed.

### Migration
Add the two columns with `ALTER TABLE`. Both are nullable so existing rows remain valid with both new columns null (root-level by default). No data needs to be rewritten.

---

## 2. EXIF Orientation Fix

**File:** `src/lib/image-utils.ts`

Sharp's `.rotate()` called with no arguments auto-corrects rotation based on EXIF orientation metadata, then strips the EXIF tag. Add `.rotate()` as the first operation in the Sharp pipeline in both `processImage()` and `generateThumbnail()`.

**Before:**
```ts
sharp(buffer).resize(...).jpeg(...)
```
**After:**
```ts
sharp(buffer).rotate().resize(...).jpeg(...)
```

Fixes all upside-down / sideways photos on iOS-captured images going forward. Does not retroactively fix already-stored images (stored as base64 without EXIF).

---

## 3. Create from Root

### UI
A single "+" button in the top-right of the header opens a dropdown menu with three options:
- 📁 New Set
- 📦 New Container
- 🏷️ New Item

The same dropdown (with context-appropriate options) also appears inside sets and containers for adding children at that level. For example, inside a container the dropdown offers "New Container" (nested) and "New Item". Inside a set it offers all three.

### Behavior
- Tapping an option opens the existing creation form (name, photo, description) with the parent context pre-set
- After creation, the new entity appears at the top of the current view and is scrolled into focus with a brief highlight animation

---

## 4. Move Anything Anywhere

### Trigger
Each card (set, container, item) gains a "Move" action in its existing context menu (alongside Edit and Delete).

### Destination Picker — Flat Searchable List
A modal showing the full hierarchy as a flat indented list:

```
🏠 Root (top level)
  📁 Living Room
    📁 Closet
  📁 Garage
    📦 Tool Chest
    📦 Shelving Unit
      📦 Top Shelf
  📦 Kitchen Drawer      ← container at root
```

- Search input filters by name in real time
- Invalid destinations are excluded:
  - Cannot move a set into a container (sets only nest in sets)
  - Cannot move an entity into itself or its own descendant
  - Cannot move an entity to its current parent (no-op)
- "Root" is always the first option
- Destinations show their type icon and indentation depth

### Move Semantics
- Moving a **container** → all its items and nested containers move with it (FK cascade — no explicit action needed)
- Moving a **set** → all its containers (and their contents) move with it
- Moving an **item** → just the item; clears old parent FK, sets new one

### API changes
- `PUT /api/containers` — accept `setId`, `parentContainerId` (with mutual-exclusion validation and cycle detection)
- `PUT /api/items` — accept `containerId`, `setId` (with mutual-exclusion validation)
- `PUT /api/sets` — accept `parentId` (already exists; add cycle detection)
- New `GET /api/tree` — returns sets and containers only (no items — items cannot be destinations) flattened for the destination picker, each node with `{id, type, name, depth, parentId}`

---

## 5. Sort Newest First + Auto-Scroll

### API
All list endpoints (`GET /api/containers`, `GET /api/items`, `GET /api/sets`, `GET /api/tree`) return results ordered by `createdAt DESC`.

### UI
- After any create action succeeds, the UI re-fetches the list (already does this) and scrolls the newly created card into view
- The new card receives a brief CSS highlight animation (e.g., a fade-in from a slightly brighter background) to draw the eye

---

## Non-Goals

- Retroactive EXIF fix for already-stored images
- Drag-and-drop reordering (manual sort order)
- Moving multiple items at once (bulk move stays container-only for now)
- Offline / optimistic updates

---

## File Impact Summary

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `setId` to items, `parentContainerId` to containers |
| `src/db/migrations/` | New migration adding the two columns |
| `src/lib/image-utils.ts` | Add `.rotate()` to Sharp pipeline |
| `src/app/api/containers/route.ts` | Support `parentContainerId`, mutual-exclusion validation |
| `src/app/api/items/route.ts` | Support `setId`, mutual-exclusion validation, nullable `containerId` |
| `src/app/api/sets/route.ts` | Add cycle detection to PUT |
| `src/app/api/tree/route.ts` | New endpoint — flattened hierarchy for destination picker |
| `src/app/page.tsx` | "+" dropdown, move modal, newest-first sort, auto-scroll |
