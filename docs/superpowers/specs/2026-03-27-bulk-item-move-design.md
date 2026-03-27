# Bulk Item Move — Design Spec

**Date:** 2026-03-27
**Status:** Approved

---

## Overview

Add bulk item selection and move to the items view, mirroring the existing bulk container selection pattern in the browse view.

---

## Data Model

No schema or API changes required. Uses the existing `PUT /api/items` endpoint, which already supports moving items to a container, a set, or root via `containerId`/`setId`.

---

## UI Changes — `src/app/page.tsx` only

### 1. New State

```typescript
const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
const [isBulkItemMove, setIsBulkItemMove] = useState(false);
```

`isBulkItemMove` distinguishes item bulk moves from container bulk moves in the shared move modal. Both `selectedItemIds` and `isBulkItemMove` are cleared when navigating away from the items view (in `navigateContainerBack(-1)` and when entering a new container via `navigateIntoContainer`).

### 2. Item Card Checkboxes

Each item card in the items view gets a checkbox in the top-left corner, same style as container card checkboxes:

```tsx
<input
  type="checkbox"
  checked={selectedItemIds.has(item.id)}
  onChange={() => setSelectedItemIds(prev => {
    const next = new Set(prev);
    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
    return next;
  })}
  className="absolute top-2 left-2 w-4 h-4 z-10"
  onClick={e => e.stopPropagation()}
/>
```

The card's image click navigates/opens as before; only the checkbox toggles selection.

### 3. Select All / Deselect All Toggle

In the items view header, add a toggle when items exist:

```tsx
<button onClick={() => {
  if (selectedItemIds.size === filteredItems.length) {
    setSelectedItemIds(new Set());
  } else {
    setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  }
}}>
  {selectedItemIds.size === filteredItems.length ? "Deselect all" : "Select all"}
</button>
```

### 4. Floating Bulk Action Bar

Appears at the bottom when `view === "items"` and `selectedItemIds.size > 0`:

```tsx
{view === "items" && selectedItemIds.size > 0 && (
  <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-gray-900 text-white px-6 py-4 shadow-lg animate-in slide-in-from-bottom duration-200">
    <span className="text-sm font-medium">{selectedItemIds.size} selected</span>
    <div className="flex gap-3">
      <button onClick={openBulkItemMoveModal}>Move to…</button>
      <button onClick={() => setSelectedItemIds(new Set())}>Clear</button>
    </div>
  </div>
)}
```

### 5. `bulkMoveItemsToDestination` Function

```typescript
const bulkMoveItemsToDestination = async (dest: { id: number; type: "set" | "container" } | null) => {
  setLoading(true);
  setError(null);
  try {
    const ids = Array.from(selectedItemIds);
    const results = await Promise.allSettled(
      ids.map(id => {
        const body: Record<string, unknown> = { id };
        if (dest === null) { body.containerId = null; body.setId = null; }
        else if (dest.type === "container") { body.containerId = dest.id; body.setId = null; }
        else { body.setId = dest.id; body.containerId = null; }
        return fetch("/api/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      })
    );
    const failedIndices = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && !(r as PromiseFulfilledResult<Response>).value.ok))
      .map(({ i }) => i);
    if (failedIndices.length > 0) {
      setError(`${failedIndices.length} item(s) could not be moved.`);
    }
    setSelectedItemIds(new Set(failedIndices.map(i => ids[i])));
    if (selectedContainer) await fetchItems(selectedContainer.id);
  } finally {
    setShowMoveModal(false);
    setIsBulkItemMove(false);
    setLoading(false);
  }
};
```

### 6. `openBulkItemMoveModal` Function

```typescript
const openBulkItemMoveModal = async () => {
  setMoveSearchTerm("");
  await fetchTree();
  setIsBulkItemMove(true);
  setIsBulkMove(false);   // ensure container bulk flag is clear
  setMoveTarget(null);
  setShowMoveModal(true);
};
```

### 7. Move Modal — Item Bulk Context

`isBulkItemMove` distinguishes item bulk moves from container bulk moves (`isBulkMove`). The modal title shows `Move N items to…` when `isBulkItemMove` is true.

Destination-click handlers in the modal:
- `isBulkMove` → call `bulkMoveToDestination` (existing container bulk)
- `isBulkItemMove` → call `bulkMoveItemsToDestination` (new item bulk)

Cancel button clears both flags.

Filter rule: when `isBulkItemMove` is true, exclude `selectedContainer` from destinations (moving items to their current container is a no-op).

**Destination semantics:**
- Container selected → `containerId = dest.id, setId = null`
- Set selected → `setId = dest.id, containerId = null`
- Root (null) → `containerId = null, setId = null`

---

## Non-Goals

- Bulk delete items
- Bulk edit item fields
- Drag-and-drop reordering
