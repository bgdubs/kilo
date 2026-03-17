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
- API changes (parallel client-side calls are sufficient)

## Design

### State

Add to the main page component:

```ts
const [selectedContainerIds, setSelectedContainerIds] = useState<Set<number>>(new Set());
```

Derived: action bar is visible when `selectedContainerIds.size > 0`.

Clear selection on navigation (e.g. opening a set or going back to browse).

### Container Cards

- A small checkbox in the top-left corner, always visible in browse view
- Clicking toggles the container ID in/out of `selectedContainerIds`
- Checked cards get a subtle blue ring highlight
- Existing buttons (View Items, Edit, Move, Delete) are unaffected

### Floating Action Bar

Fixed to the bottom of the viewport, appears when `selectedContainerIds.size > 0`:

```
[ 3 selected ]  [ Move to Set ]  [ Clear ]
```

- **"X selected"** — live count of checked containers
- **"Move to Set"** — opens the existing move modal in bulk mode
- **"Clear"** — empties `selectedContainerIds`
- Subtle slide-in animation on appear/disappear

### Move Modal (reused)

The existing move modal lists all sets plus "Top Level (unassigned)". When triggered from the action bar:

1. User picks destination
2. `moveToSet` runs `PUT /api/containers` in parallel for each selected ID with the chosen `setId` (or `null`)
3. On completion: clear selection, close modal, refresh containers

The modal title changes to reflect bulk context (e.g. "Move 3 containers to…") when triggered from the action bar vs. single-container context.

### API

No changes. Existing `PUT /api/containers` with `{ id, setId }` is called in parallel for each selected container. Container counts are small enough that sequential or parallel calls are both fine; parallel is used for responsiveness.

## File Changes

| File | Change |
|------|--------|
| `src/app/page.tsx` | Add `selectedContainerIds` state; checkbox on container cards; floating action bar; extend `moveToSet` to accept array |

## Success Criteria

- [ ] Checkboxes visible on all container cards in browse view
- [ ] Checking a card highlights it and increments the action bar count
- [ ] Action bar appears/disappears based on selection
- [ ] "Move to Set" moves all selected containers and clears selection
- [ ] "Top Level (unassigned)" option works for bulk moves
- [ ] "Clear" deselects all without navigating
- [ ] Selection clears on navigation
