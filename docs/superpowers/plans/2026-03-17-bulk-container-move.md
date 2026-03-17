# Bulk Container Move Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-visible checkboxes to container cards and a floating action bar for bulk-moving containers to any set (or no set).

**Architecture:** All changes are confined to `src/app/page.tsx`. New state tracks selected container IDs; a `useEffect` clears selection on navigation; a floating action bar drives a bulk variant of the existing move modal. No API changes needed — parallel `PUT /api/containers` calls handle bulk moves.

**Tech Stack:** Next.js 15, React useState/useEffect, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-bulk-container-move-design.md`

> **Note:** This project has no test suite. Each task includes manual verification steps instead.

---

## File Map

| File | Lines affected | What changes |
|------|---------------|--------------|
| `src/app/page.tsx` | ~88–90 | Add `isBulkMove`, `selectedContainerIds` state |
| `src/app/page.tsx` | ~162–165 | Add `useEffect` to clear selection on navigation |
| `src/app/page.tsx` | ~482–515 | Refactor `moveToSet`, add `bulkMoveToSet`, add `openBulkMoveModal` |
| `src/app/page.tsx` | ~950–1020 | Add checkbox + ring highlight to container cards |
| `src/app/page.tsx` | ~1020–1030 | Add floating action bar before closing browse `</div>` |
| `src/app/page.tsx` | ~1549–1567 | Update modal guard, filter, title, dispatch, cancel handler |

---

## Task 1: Add state and clear-on-navigate effect

**Files:**
- Modify: `src/app/page.tsx:88-90` (state declarations)
- Modify: `src/app/page.tsx:162-165` (useEffect block)

- [ ] **Step 1: Add `isBulkMove` and `selectedContainerIds` state**

  Find the block at line 88–90 that reads:
  ```ts
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
    const [allSets, setAllSets] = useState<Set[]>([]);
  ```

  Replace with:
  ```ts
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
    const [isBulkMove, setIsBulkMove] = useState(false);
    const [allSets, setAllSets] = useState<Set[]>([]);
    const [selectedContainerIds, setSelectedContainerIds] = useState<Set<number>>(new Set());
  ```

- [ ] **Step 2: Add clear-selection effect**

  Find the existing `useEffect` at line ~162:
  ```ts
    useEffect(() => {
      fetchSets(null);
      fetchContainersForSet(null);
    }, [fetchSets, fetchContainersForSet]);
  ```

  Add a new `useEffect` directly after it:
  ```ts
    useEffect(() => {
      setSelectedContainerIds(new Set());
    }, [currentSet, view]);
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `docker logs ios-inventory-inventory-1 --tail 5`

  Expected: no new TypeScript errors. (The app hot-reloads; errors appear in logs.)

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: add selectedContainerIds and isBulkMove state with clear-on-navigate"
  ```

---

## Task 2: Add bulk move functions

**Files:**
- Modify: `src/app/page.tsx:482-515` (move functions)

- [ ] **Step 1: Refactor `moveToSet` to add error handling**

  Find the existing `moveToSet` function at line ~482:
  ```ts
    // Move function
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
  ```

  Replace with (adds `setError(null)` on entry — this clears any previously displayed error when starting a new move, which is the correct UX):
  ```ts
    // Move function
    const moveToSet = async (targetSetId: number | null) => {
      if (!moveTarget) return;
      setLoading(true);
      setError(null);
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
  ```

- [ ] **Step 2: Add `bulkMoveToSet` and `openBulkMoveModal`**

  Find the `openMoveModal` function at line ~511:
  ```ts
    const openMoveModal = async (type: "container" | "set", id: number) => {
      setMoveTarget({ type, id });
      await fetchAllSets();
      setShowMoveModal(true);
    };
  ```

  Replace with:
  ```ts
    const openMoveModal = async (type: "container" | "set", id: number) => {
      setMoveTarget({ type, id });
      await fetchAllSets();
      setShowMoveModal(true);
    };

    const openBulkMoveModal = async () => {
      await fetchAllSets();
      setIsBulkMove(true);
      setMoveTarget(null);
      setShowMoveModal(true);
    };

    const bulkMoveToSet = async (targetSetId: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const ids = Array.from(selectedContainerIds);
        const results = await Promise.allSettled(
          ids.map(id =>
            fetch("/api/containers", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, setId: targetSetId }),
            })
          )
        );
        const failedIndices = results
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => r.status === "rejected" || (r.status === "fulfilled" && !(r as PromiseFulfilledResult<Response>).value.ok))
          .map(({ i }) => i);
        if (failedIndices.length > 0) {
          setError(`${failedIndices.length} container(s) could not be moved. The rest were moved successfully.`);
        }
        const failedIds = failedIndices.map(i => ids[i]);
        setSelectedContainerIds(new Set(failedIds));
        // Fire-and-forget refresh
        fetchContainersForSet(currentSet?.id ?? null);
        fetchSets(currentSet?.id ?? null);
      } finally {
        // Always close modal and reset bulk flag, even if an error is thrown
        setShowMoveModal(false);
        setIsBulkMove(false);
        setLoading(false);
      }
    };
  ```

- [ ] **Step 3: Verify no TypeScript errors**

  Check `docker logs ios-inventory-inventory-1 --tail 5` — no new errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: add bulkMoveToSet and openBulkMoveModal functions"
  ```

---

## Task 3: Add checkboxes to container cards

**Files:**
- Modify: `src/app/page.tsx:950-1020` (container cards grid)

- [ ] **Step 1: Add checkbox and ring highlight to each container card**

  Find the container card `<div>` at line ~954:
  ```tsx
                        <div
                          key={container.id}
                          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
                        >
  ```

  Replace with:
  ```tsx
                        <div
                          key={container.id}
                          className={`bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow relative ${
                            selectedContainerIds.has(container.id) ? "ring-2 ring-blue-500" : ""
                          }`}
                        >
  ```

- [ ] **Step 2: Add the checkbox inside the card, before the image**

  Find the `<img>` tag inside the container card at line ~959:
  ```tsx
                          <img
                            src={container.thumbnailUrl || container.imageData}
                            alt={container.name}
                            className="w-full h-48 object-cover cursor-pointer"
  ```

  Add the checkbox immediately before the `<img>`:
  ```tsx
                          <label className="absolute top-2 left-2 z-10 cursor-pointer" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedContainerIds.has(container.id)}
                              onChange={() => {
                                setSelectedContainerIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(container.id)) {
                                    next.delete(container.id);
                                  } else {
                                    next.add(container.id);
                                  }
                                  return next;
                                });
                              }}
                              className="w-4 h-4 accent-blue-600"
                            />
                          </label>
                          <img
                            src={container.thumbnailUrl || container.imageData}
                            alt={container.name}
                            className="w-full h-48 object-cover cursor-pointer"
  ```

- [ ] **Step 3: Verify visually**

  Open `http://localhost:4001` in a browser. Container cards should each have a small checkbox in the top-left corner. Checking one should add a blue ring to the card.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: add multi-select checkboxes to container cards"
  ```

---

## Task 4: Add floating action bar

**Files:**
- Modify: `src/app/page.tsx:1020-1030` (end of browse view)

- [ ] **Step 1: Add bottom padding to the container grid when bar is visible**

  Find the containers section header at line ~949 (include the comment line to ensure exact match):
  ```tsx
                {/* Containers grid */}
                {filteredContainers.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Containers</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  ```

  Replace with:
  ```tsx
                {/* Containers grid */}
                {filteredContainers.length > 0 && (
                  <div className={selectedContainerIds.size > 0 ? "pb-20" : ""}>
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Containers</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  ```

- [ ] **Step 2: Add floating action bar**

  Find the closing tag for the browse view at line ~1030:
  ```tsx
          </div>
        )}

        {/* Items View */}
  ```

  Add the action bar JSX immediately before `{/* Items View */}`:
  ```tsx
        {/* Bulk selection action bar */}
        {selectedContainerIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-gray-900 text-white px-6 py-4 shadow-lg animate-in slide-in-from-bottom duration-200">
            <span className="text-sm font-medium">{selectedContainerIds.size} selected</span>
            <div className="flex gap-3">
              <button
                onClick={openBulkMoveModal}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Move to Set
              </button>
              <button
                onClick={() => setSelectedContainerIds(new Set())}
                className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Items View */}
  ```

- [ ] **Step 3: Verify action bar appears and disappears**

  Open `http://localhost:4001`. Check a container card — the dark action bar should slide up from the bottom with the count. Click "Clear" — it should disappear.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: add floating bulk action bar for container multi-select"
  ```

---

## Task 5: Update move modal for bulk mode

**Files:**
- Modify: `src/app/page.tsx:1549-1567` (move modal)

- [ ] **Step 1: Update modal guard, filter, title, dispatch, and cancel**

  Find the entire move modal block at line ~1548:
  ```tsx
        {/* Move-To Modal */}
        {showMoveModal && moveTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">Move to...</h3>
              <div className="space-y-2">
                <button onClick={() => moveToSet(null)} className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 font-medium">
                  Top Level (unassigned)
                </button>
                {allSets.filter(s => s.id !== moveTarget.id).map(set => (
                  <button key={set.id} onClick={() => moveToSet(set.id)} className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50">
                    {set.name}
                    {set.description && <span className="text-gray-500 text-sm ml-2">&mdash; {set.description}</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowMoveModal(false); setMoveTarget(null); }} className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
            </div>
          </div>
        )}
  ```

  Replace with:
  ```tsx
        {/* Move-To Modal */}
        {showMoveModal && (moveTarget || isBulkMove) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">
                {isBulkMove ? `Move ${selectedContainerIds.size} containers to…` : "Move to…"}
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => isBulkMove ? bulkMoveToSet(null) : moveToSet(null)}
                  className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 font-medium"
                >
                  Top Level (unassigned)
                </button>
                {allSets.filter(s => moveTarget?.type === "set" ? s.id !== moveTarget.id : true).map(set => (
                  <button
                    key={set.id}
                    onClick={() => isBulkMove ? bulkMoveToSet(set.id) : moveToSet(set.id)}
                    className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50"
                  >
                    {set.name}
                    {set.description && <span className="text-gray-500 text-sm ml-2">&mdash; {set.description}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowMoveModal(false); setMoveTarget(null); setIsBulkMove(false); }}
                className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
  ```

- [ ] **Step 2: Verify single-move is unaffected**

  Open `http://localhost:4001`. Click the "Move" button on any individual container card. The modal should open with title "Move to…" and all sets listed. Move it to a different set and confirm it moves correctly.

- [ ] **Step 3: Verify bulk move**

  Check 2–3 containers. Click "Move to Set" in the action bar. The modal should open with title "Move 3 containers to…". Pick a destination. All selected containers should move; the action bar should disappear (or show only failed ones).

- [ ] **Step 4: Verify "Top Level" works for bulk**

  Check 2 containers in a set. Bulk-move them to "Top Level (unassigned)". Navigate to the root — they should appear there.

- [ ] **Step 5: Verify selection clears on navigation**

  Check some containers. Navigate into a child set (or click a breadcrumb). The action bar should disappear and no checkboxes should be checked.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: update move modal to support bulk container moves"
  ```

---

## Done

All success criteria from the spec should now pass:

- [ ] Checkboxes visible on all container cards in browse view (including inside sets)
- [ ] Checking a card highlights it and increments the action bar count
- [ ] Action bar appears/disappears based on selection; does not obscure last row
- [ ] "Move to Set" bulk-moves all selected containers and clears selection (or retains failed ones)
- [ ] "Top Level (unassigned)" option works for bulk moves
- [ ] "Clear" deselects all without navigating
- [ ] Selection clears when navigating into/out of a set or leaving browse view
- [ ] Partial failures show an error and retain only failed containers in selection
- [ ] Single-container move (existing) is unaffected
