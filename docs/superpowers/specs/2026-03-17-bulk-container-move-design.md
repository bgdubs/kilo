# Bulk Container Move to Set

**Date:** 2026-03-17
**Status:** Approved

## Overview

Add multi-select checkboxes to container cards and a floating action bar for bulk-moving containers to any set (or no set).

## Goals

- Select one or more containers using always-visible checkboxes
- Move selected containers to any set, or unassign them to top level
- Minimal disruption to existing layout and UX

## Out of Scope

- Multi-select for sets (only containers)
- Bulk delete
- "Select all" / "Deselect all" shortcut
- API changes (parallel client-side calls are sufficient)

## Design

### State

Add to the main page component:

```ts
const [selectedContainerIds, setSelectedContainerIds] = useState<Set<number>>(new Set());
```

Derived: action bar is visible when `selectedContainerIds.size > 0`.

**Clearing selection:** Use a `useEffect` that clears `selectedContainerIds` whenever `currentSet` changes (drilling into or out of a set) or when `view` changes away from `"browse"`.

### Where Checkboxes Appear

Checkboxes are visible on container cards whenever `view === "browse"` — this includes browsing inside a set (the app stays on `view === "browse"` when navigating set hierarchy). Checkboxes are hidden in all other views (`items`, `edit-container`, etc.).

### Container Cards

- A small checkbox in the top-left corner, always visible when `view === "browse"`
- Clicking toggles the container ID in/out of `selectedContainerIds`
- Checked cards get a subtle blue ring highlight
- Existing buttons (View Items, Edit, Move, Delete) are unaffected

### Floating Action Bar

Fixed to the bottom of the viewport (`position: fixed; bottom: 0; z-index: 50`), appears when `selectedContainerIds.size > 0`:

```
[ 3 selected ]  [ Move to Set ]  [ Clear ]
```

- **"X selected"** — live count of checked containers
- **"Move to Set"** — opens the move modal in bulk mode (see below)
- **"Clear"** — empties `selectedContainerIds`
- Subtle slide-in animation on appear/disappear
- When the action bar is visible, add `padding-bottom` to the container grid so the bar does not obscure the last row

### Move Modal

#### Bulk Mode vs. Single Mode

The existing move modal is gated on `showMoveModal && moveTarget`. To support bulk mode cleanly, add a separate boolean flag:

```ts
const [showMoveModal, setShowMoveModal] = useState(false);
const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
const [isBulkMove, setIsBulkMove] = useState(false);
```

- **Single mode** (existing): `moveTarget` is set, `isBulkMove` is false. Modal guard: `showMoveModal && (moveTarget || isBulkMove)`.
- **Bulk mode**: `moveTarget` is null, `isBulkMove` is true.

The existing modal JSX contains `allSets.filter(s => s.id !== moveTarget.id)` (non-optional access). With the updated guard `showMoveModal && (moveTarget || isBulkMove)`, the modal can render when `moveTarget` is null (bulk mode), making this a crash. **This line must be replaced** with the safe version:

```ts
allSets.filter(s => moveTarget?.type === "set" ? s.id !== moveTarget.id : true)
```

The original filter excluded any entry whose `id` matched `moveTarget.id`, which is ambiguous when `moveTarget` could be a container or null (container and set IDs share the same autoincrement sequences and can collide). The new filter is precise: only exclude a set from the destination list when the thing being moved is itself a set (to prevent moving a set into itself). For container moves (single and bulk), all sets are valid destinations.

The modal title is dynamic:
- Single container: `"Move to…"`
- Bulk: `"Move ${selectedContainerIds.size} containers to…"`

The destination list is unchanged: all sets + "Top Level (unassigned)".

#### Triggering from action bar

```ts
function openBulkMoveModal() {
  fetchAllSets();
  setIsBulkMove(true);
  setMoveTarget(null);
  setShowMoveModal(true);
}
```

On close/cancel, reset: `setIsBulkMove(false)`.

### Move Execution

Replace the current `moveToSet` with two functions:

**Single move (existing, refactored):**
```ts
async function moveToSet(targetSetId: number | null) {
  if (!moveTarget) return;
  setLoading(true);
  try {
    if (moveTarget.type === "container") {
      await fetch("/api/containers", { method: "PUT", body: JSON.stringify({ id: moveTarget.id, setId: targetSetId }), headers: { "Content-Type": "application/json" } });
    } else {
      await fetch("/api/sets", { method: "PUT", body: JSON.stringify({ id: moveTarget.id, parentId: targetSetId }), headers: { "Content-Type": "application/json" } });
    }
    setShowMoveModal(false);
    setMoveTarget(null);
    fetchContainersForSet(currentSet?.id ?? null);
    fetchSets(currentSet?.id ?? null);
  } catch {
    setError("Failed to move item");
  } finally {
    setLoading(false);
  }
}
```

**Bulk move (new):**
```ts
async function bulkMoveToSet(targetSetId: number | null) {
  setLoading(true);
  try {
    const ids = Array.from(selectedContainerIds);
    const results = await Promise.allSettled(
      ids.map(id => fetch("/api/containers", { method: "PUT", body: JSON.stringify({ id, setId: targetSetId }), headers: { "Content-Type": "application/json" } }))
    );
    // A move is failed if the fetch threw OR if the response is not ok (e.g. HTTP 4xx/5xx)
    const failedIndices = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok))
      .map(({ i }) => i);
    if (failedIndices.length > 0) {
      setError(`${failedIndices.length} container(s) could not be moved. The rest were moved successfully.`);
    }
    // Successful moves stay; no rollback
    // Retain only failed IDs in selection for retry; clear the rest
    const failedIds = failedIndices.map(i => ids[i]);
    setSelectedContainerIds(new Set(failedIds));
    setShowMoveModal(false);
    setIsBulkMove(false);
    // Fire-and-forget refresh (intentional — no need to await these)
    fetchContainersForSet(currentSet?.id ?? null);
    fetchSets(currentSet?.id ?? null);
  } finally {
    setLoading(false);
  }
}
```

On partial failure, the existing `setError` string approach is used (consistent with the rest of the app).

### Modal Dispatch

In the modal's set selection handler, call either `moveToSet(id)` or `bulkMoveToSet(id)` based on `isBulkMove`.

The modal's cancel/close button must reset both `showMoveModal` and `isBulkMove`:

```ts
// cancel button handler
setShowMoveModal(false);
setMoveTarget(null);
setIsBulkMove(false);
```

Failing to reset `isBulkMove` here would leave the modal permanently stuck in bulk mode after the first cancel.

## File Changes

| File | Change |
|------|--------|
| `src/app/page.tsx` | Add `selectedContainerIds`, `isBulkMove` state; checkbox on container cards; floating action bar with z-50 and grid padding; `bulkMoveToSet` function; update move modal guard, filter, title, and dispatch logic; `useEffect` to clear selection on `currentSet`/`view` change |

## Success Criteria

- [ ] Checkboxes visible on all container cards in browse view (including inside sets)
- [ ] Checking a card highlights it and increments the action bar count
- [ ] Action bar appears/disappears based on selection; does not obscure last row
- [ ] "Move to Set" bulk-moves all selected containers and clears selection (or retains failed ones)
- [ ] "Top Level (unassigned)" option works for bulk moves
- [ ] "Clear" deselects all without navigating
- [ ] Selection clears when navigating into/out of a set or leaving browse view
- [ ] Partial failures show an error and retain only failed containers in selection
- [ ] Single-container move (existing) is unaffected
