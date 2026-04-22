# Plan 48 — set_marker_pinned AI tool

## Use case

The Markers Overview has a pin icon on every row; clicking it calls
`pinMarker` (`public/modules/ui/markers-overview.js:146`) which flips
`marker.pinned`, updates the `pinned` attribute on the markers SVG
`<g>`, and redraws the icons. Pinned markers are the only ones shown
when the overlay is filtered to "pinned only" — it's how the user
singles out a subset of important POIs (e.g. after placing a lot of
secondary markers for world-building brainstorming).

The chat currently lists markers (including the pin flag), sets
their notes, and removes them — but cannot pin or unpin them.

## Scope

Add one tool: `set_marker_pinned(marker, pinned)`. Explicit boolean
(consistent with `set_zone_visibility`); idempotent. Writes
`marker.pinned` exactly like the UI (set or delete the key), updates
the `#markers` group's `pinned` attribute based on whether any pinned
markers remain, and calls `drawMarkers()` when available.

Refs resolve via the existing `findMarkerNoteRef` helper (id or
case-insensitive current note name) — same as `set_marker_note` /
`remove_marker`.

## Implementation

1. **New file `src/ai/tools/set-marker-pinned.ts`**:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, `RawMarker`, `RawNote` from `_shared`;
     `findMarkerNoteRef`, `type MarkerNotePackLike` from
     `./set-marker-note`.
   - `MarkerPinnedRef { i, name, previousPinned }`.
   - `MarkerPinnedRuntime { find(ref), setPinned(i, pinned) }`.
   - `defaultMarkerPinnedRuntime.find`: reuse `findMarkerNoteRef` on
     `getPack<MarkerNotePackLike>()` + `getNotes<RawNote>()`. Return
     `{ i, name: result.previousName ?? "", previousPinned:
     !!pack.markers.find(m => m.i === i)?.pinned }`. (Have to peek at
     pack.markers directly for the pinned flag — note layer doesn't
     carry it.)
   - `defaultMarkerPinnedRuntime.setPinned(i, pinned)`:
     - Get pack.markers; throw if not an array or marker not found.
     - If `pinned` true: `marker.pinned = true`.
     - If `pinned` false: `delete marker.pinned`.
     - Compute `anyPinned = pack.markers.some(m => m.pinned)`.
     - If `document` available: flip the `#markers` element's
       `pinned` attribute (set `"1"` / removeAttribute when none).
     - Best-effort `getGlobal<() => void>("drawMarkers")?.()`.
   - Tool schema: `marker` (int|string required), `pinned` (boolean
     required).
   - Returns `{ i, name, pinned, previousPinned, noop }`. If already
     in the requested state: short-circuit, `noop: true`, skip the
     side-effect chain.

2. **Register** in `src/ai/index.ts`: import, barrel export,
   `registry.register(setMarkerPinnedTool)` after `setMarkerNoteTool`.

3. **Tests `src/ai/tools/set-marker-pinned.test.ts`** — runtime
   injected:
   - Pins a marker.
   - Unpins a marker.
   - Resolves by note name (case-insensitive).
   - Noop when already in requested state (setPinned not called).
   - Rejects unknown marker.
   - Rejects invalid `marker` refs (null, 0, -1, 1.5, "").
   - Rejects non-boolean `pinned`.
   - Surfaces runtime errors.

4. **Default-runtime integration test**:
   - Stub `globalThis.pack.markers` with non-contiguous ids and at
     least one already pinned.
   - Stub `globalThis.notes` for name-based resolution.
   - Stub `globalThis.document` with a fake `#markers` element
     exposing `setAttribute` / `removeAttribute` spies, and a spy
     `getElementById` for marker lookups.
   - Stub `globalThis.drawMarkers` mock.
   - Test: pin an unpinned marker → `marker.pinned === true`,
     `#markers[pinned="1"]` set, `drawMarkers` called.
   - Test: unpin the last pinned marker → `delete marker.pinned`,
     `#markers.removeAttribute("pinned")` called.
   - Test: unpin one of several pinned markers → attribute stays `"1"`.
   - Test: noop does NOT call drawMarkers or touch the attribute.

5. **README_AI.md** — new row under `remove_marker`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-pinned` green.
- `npm test -- --run` — full suite green (584 before).
- `npm run lint` — baseline intact.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "pin the Rookhold marker" / "unpin all markers except
  the dragon lair" and the overlay state matches clicking the pin
  icon in the Markers Overview exactly.
- Idempotent — asking to pin an already-pinned marker is a safe no-op.
- `#markers` SVG attribute tracks whether any marker is pinned (the
  UI relies on this for its "pinned only" overlay filter).
