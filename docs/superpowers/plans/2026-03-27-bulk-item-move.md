# Bulk Item Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk item selection and move to the items view, matching the existing bulk container selection pattern.

**Architecture:** All changes are in `src/app/page.tsx`. Add `selectedItemIds` + `isBulkItemMove` state, a `bulkMoveItemsToDestination` function, checkboxes on item cards, a "Select all / Deselect all" toggle in the items view header, a floating bulk action bar, and update the shared move modal to handle the item-bulk context.

**Tech Stack:** React 19, Next.js 15 App Router, Tailwind CSS 4

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/app/page.tsx` | Modify | State, functions, item card checkboxes, header toggle, bulk action bar, move modal |

---

## Task 1: State + Logic

**Files:**
- Modify: `src/app/page.tsx`

This task adds all new state and functions. No JSX changes yet.

- [ ] **Step 1: Add `selectedItemIds` and `isBulkItemMove` state**

Find the `isBulkMove` state declaration (line ~95):
```typescript
const [isBulkMove, setIsBulkMove] = useState(false);
```

Add two new state declarations directly after it:
```typescript
const [isBulkMove, setIsBulkMove] = useState(false);
const [isBulkItemMove, setIsBulkItemMove] = useState(false);
const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Clear item selection in `navigateIntoContainer`**

Find `navigateIntoContainer` (line ~618):
```typescript
const navigateIntoContainer = async (container: Container) => {
  setContainerStack(prev => [...prev, container]);
  setSelectedContainer(container);
  await fetchItems(container.id);
  setView("items");
};
```

Replace with:
```typescript
const navigateIntoContainer = async (container: Container) => {
  setContainerStack(prev => [...prev, container]);
  setSelectedContainer(container);
  setSelectedItemIds(new Set());
  await fetchItems(container.id);
  setView("items");
};
```

- [ ] **Step 3: Clear item selection in `navigateContainerBack`**

Find `navigateContainerBack` (line ~625):
```typescript
const navigateContainerBack = async (index: number) => {
  if (index === -1) {
    setContainerStack([]);
    setSelectedContainer(null);
    setItems([]);
    setNestedContainers([]);
    setView("browse");
  } else {
    const target = containerStack[index];
    setContainerStack(prev => prev.slice(0, index + 1));
    setSelectedContainer(target);
    await fetchItems(target.id);
  }
};
```

Replace with:
```typescript
const navigateContainerBack = async (index: number) => {
  setSelectedItemIds(new Set());
  if (index === -1) {
    setContainerStack([]);
    setSelectedContainer(null);
    setItems([]);
    setNestedContainers([]);
    setView("browse");
  } else {
    const target = containerStack[index];
    setContainerStack(prev => prev.slice(0, index + 1));
    setSelectedContainer(target);
    await fetchItems(target.id);
  }
};
```

- [ ] **Step 4: Add `openBulkItemMoveModal` function**

Find `openBulkMoveModal` (line ~695):
```typescript
const openBulkMoveModal = async () => {
  setMoveSearchTerm("");
  await fetchTree();
  setIsBulkMove(true);
  setMoveTarget(null);
  setShowMoveModal(true);
};
```

Add the new function directly after it:
```typescript
const openBulkItemMoveModal = async () => {
  setMoveSearchTerm("");
  await fetchTree();
  setIsBulkItemMove(true);
  setIsBulkMove(false);
  setMoveTarget(null);
  setShowMoveModal(true);
};
```

- [ ] **Step 5: Add `bulkMoveItemsToDestination` function**

Find `bulkMoveToDestination` (line ~703). Add the new function directly after its closing `};`:

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

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/bgw/code/kilo/ios-inventory && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/bgw/code/kilo/ios-inventory && git add src/app/page.tsx && git commit -m "feat: bulk item move state and functions"
```

---

## Task 2: Items View UI + Move Modal

**Files:**
- Modify: `src/app/page.tsx`

This task adds all JSX changes: checkboxes on item cards, select-all toggle in the header, floating bulk action bar, and move modal updates.

- [ ] **Step 1: Add checkbox to each item card**

Find the item card outer div in the items view (line ~1511). It currently looks like:
```tsx
<div
  key={item.id}
  className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
>
  <img
    src={item.thumbnailUrl || item.imageData}
```

Replace with (add `relative` to className and insert checkbox label before the img):
```tsx
<div
  key={item.id}
  className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow relative"
>
  <label className="absolute top-2 left-2 z-10 cursor-pointer" onClick={e => e.stopPropagation()}>
    <input
      type="checkbox"
      checked={selectedItemIds.has(item.id)}
      onChange={() => {
        setSelectedItemIds(prev => {
          const next = new Set(prev);
          if (next.has(item.id)) {
            next.delete(item.id);
          } else {
            next.add(item.id);
          }
          return next;
        });
      }}
      className="w-4 h-4 accent-blue-600"
    />
  </label>
  <img
    src={item.thumbnailUrl || item.imageData}
```

- [ ] **Step 2: Add "Select all / Deselect all" toggle to items view header**

Find the items view header right-side button (line ~1407):
```tsx
  <button
    onClick={() => itemInputRef.current?.click()}
    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
  >
    + Add Item
  </button>
```

Replace with (wrap in a flex div to add the toggle alongside):
```tsx
  <div className="flex items-center gap-2">
    {filteredItems.length > 0 && (
      <button
        onClick={() => {
          if (selectedItemIds.size === filteredItems.length) {
            setSelectedItemIds(new Set());
          } else {
            setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
          }
        }}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        {selectedItemIds.size === filteredItems.length && filteredItems.length > 0 ? "Deselect all" : "Select all"}
      </button>
    )}
    <button
      onClick={() => itemInputRef.current?.click()}
      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
    >
      + Add Item
    </button>
  </div>
```

- [ ] **Step 3: Add floating bulk action bar for items**

Find the existing container bulk action bar (line ~1353):
```tsx
        {/* Bulk selection action bar */}
        {view === "browse" && selectedContainerIds.size > 0 && (
```

Add a second bulk action bar for items directly after the closing `)}` of the container bar:
```tsx
        {/* Bulk item selection action bar */}
        {view === "items" && selectedItemIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-gray-900 text-white px-6 py-4 shadow-lg animate-in slide-in-from-bottom duration-200">
            <span className="text-sm font-medium">{selectedItemIds.size} selected</span>
            <div className="flex gap-3">
              <button
                onClick={openBulkItemMoveModal}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Move to…
              </button>
              <button
                onClick={() => setSelectedItemIds(new Set())}
                className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Update move modal title**

Find the modal title (line ~2020):
```tsx
              <h3 className="text-xl font-semibold mb-3">
                {isBulkMove ? `Move ${selectedContainerIds.size} containers to…` : "Move to…"}
              </h3>
```

Replace with:
```tsx
              <h3 className="text-xl font-semibold mb-3">
                {isBulkMove
                  ? `Move ${selectedContainerIds.size} containers to…`
                  : isBulkItemMove
                  ? `Move ${selectedItemIds.size} items to…`
                  : "Move to…"}
              </h3>
```

- [ ] **Step 5: Update move modal root button onClick**

Find the Root button onClick (line ~2030):
```tsx
                <button
                  onClick={() => isBulkMove ? bulkMoveToDestination(null) : moveToDestination(null)}
```

Replace with:
```tsx
                <button
                  onClick={() => isBulkMove ? bulkMoveToDestination(null) : isBulkItemMove ? bulkMoveItemsToDestination(null) : moveToDestination(null)}
```

- [ ] **Step 6: Update move modal tree node filter + onClick**

Find the `treeNodes.filter(node => {` block inside the modal (line ~2036). Replace the entire filter and map block:

Current:
```tsx
                {treeNodes
                  .filter(node => {
                    // Sets can only go into sets
                    if (moveTarget?.type === "set" && node.type === "container") return false;
                    // Can't move to self
                    if (moveTarget && node.type === moveTarget.type && node.id === moveTarget.id) return false;
                    // Bulk move: can't move selected containers into themselves
                    if (isBulkMove && node.type === "container" && selectedContainerIds.has(node.id)) return false;
                    // Search filter
                    if (moveSearchTerm && !node.name.toLowerCase().includes(moveSearchTerm.toLowerCase())) return false;
                    return true;
                  })
                  .map(node => (
                    <button
                      key={`${node.type}-${node.id}`}
                      onClick={() => isBulkMove ? bulkMoveToDestination({ id: node.id, type: node.type }) : moveToDestination({ id: node.id, type: node.type })}
```

Replace with:
```tsx
                {treeNodes
                  .filter(node => {
                    // Sets can only go into sets
                    if (moveTarget?.type === "set" && node.type === "container") return false;
                    // Can't move to self
                    if (moveTarget && node.type === moveTarget.type && node.id === moveTarget.id) return false;
                    // Container bulk: can't move selected containers into themselves
                    if (isBulkMove && node.type === "container" && selectedContainerIds.has(node.id)) return false;
                    // Item bulk: can't move items to the container they're already in
                    if (isBulkItemMove && node.type === "container" && node.id === selectedContainer?.id) return false;
                    // Search filter
                    if (moveSearchTerm && !node.name.toLowerCase().includes(moveSearchTerm.toLowerCase())) return false;
                    return true;
                  })
                  .map(node => (
                    <button
                      key={`${node.type}-${node.id}`}
                      onClick={() => isBulkMove ? bulkMoveToDestination({ id: node.id, type: node.type }) : isBulkItemMove ? bulkMoveItemsToDestination({ id: node.id, type: node.type }) : moveToDestination({ id: node.id, type: node.type })}
```

- [ ] **Step 7: Update move modal Cancel button**

Find the Cancel button (line ~2058):
```tsx
              <button
                onClick={() => { setShowMoveModal(false); setMoveTarget(null); setIsBulkMove(false); }}
```

Replace with:
```tsx
              <button
                onClick={() => { setShowMoveModal(false); setMoveTarget(null); setIsBulkMove(false); setIsBulkItemMove(false); }}
```

- [ ] **Step 8: Verify TypeScript**

```bash
cd /Users/bgw/code/kilo/ios-inventory && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/bgw/code/kilo/ios-inventory && git add src/app/page.tsx && git commit -m "feat: bulk item selection, move modal, and action bar in items view"
```

---

## Self-Review Checklist

- [ ] `selectedItemIds` cleared in `navigateIntoContainer` ✓ (Task 1 Step 2)
- [ ] `selectedItemIds` cleared in `navigateContainerBack` ✓ (Task 1 Step 3)
- [ ] `isBulkItemMove` and `isBulkMove` mutually exclusive ✓ (`openBulkItemMoveModal` sets `isBulkMove(false)`)
- [ ] Cancel button clears both `isBulkMove` and `isBulkItemMove` ✓ (Task 2 Step 7)
- [ ] Current container excluded from item bulk destinations ✓ (Task 2 Step 6)
- [ ] `bulkMoveItemsToDestination` clears `isBulkItemMove` in finally ✓ (Task 1 Step 5)
