# Bugfixes & HTML Gallery Export Design

## Context

iOS photo inventory app for cataloging inherited house contents into boxes. Users photograph containers and items, name them, and need to export as CSV or a shareable HTML gallery.

## Fix 1: API routes not saving metadata

**Files:** `src/app/api/containers/route.ts`, `src/app/api/items/route.ts`

**Problem:** POST and PUT handlers ignore `description`, `category`, `confidence` fields. The frontend sends them on update, but POST doesn't send them at all either.

**Changes:**
- Container POST: accept and save `description`, `category`
- Container PUT: destructure and save `description`, `category`, `confidence`
- Item POST: accept and save `description`, `category`
- Item PUT: destructure and save `description`, `category`, `confidence`
- Frontend `createContainer`: send `description` and `category` in POST body
- Frontend `createItem`: send `description` and `category` in POST body

## Fix 2: Cascading deletes

**File:** `src/app/api/containers/route.ts`

**Problem:** Deleting a container orphans its items. UI promises cascade but backend doesn't do it.

**Change:** In container DELETE handler, delete all items with matching `containerId` before deleting the container.

## Fix 3: Remove fake AI recognition

**Files:** `src/app/api/recognize/route.ts` (delete), `src/app/page.tsx`

**Problem:** Mock recognition matches filenames against hardcoded dictionary. Real camera photos always return "Unidentified Item" at 50% confidence.

**Changes:**
- Delete `src/app/api/recognize/route.ts`
- Remove `recognizeImage` function from page.tsx
- Remove auto-recognition calls from `handleContainerImageCapture` and `handleItemImageCapture` (keep image capture, just don't call recognize)
- Remove recognition result display from create forms
- Remove `recognitionResult` state and `RecognitionResult` interface
- Keep schema fields (`category`, `confidence`, `description`) for future AI integration

## New Feature: HTML Gallery Export

**New file:** `src/app/api/export-gallery/route.ts`
**Modified file:** `src/app/page.tsx` (add export button)

**Behavior:**
- GET endpoint returns a single self-contained HTML file
- All images embedded as base64 data URIs (already stored this way)
- Inline CSS, zero external dependencies
- Opens to container grid with thumbnail cards
- Click container to reveal its items with a back button
- JavaScript-driven show/hide, no server needed after download
- Clean, minimal design suitable for sharing with family

**Query params:** `containerId` (optional, to export single container)

**Frontend:** Add "Export HTML Gallery" button alongside existing CSV/JSON export.

## Implementation Order

1. Fix container/item API routes (metadata saving)
2. Fix cascading deletes
3. Remove fake AI recognition
4. Build HTML gallery export endpoint
5. Add gallery export button to frontend
