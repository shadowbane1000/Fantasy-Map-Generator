# Plan 81 — set_marker_type AI tool

## Use case

The Markers Editor (`public/modules/ui/markers-editor.js:114`)
lets a user change a single marker's `type` via the
`markerType` text input. The type is an arbitrary string
label that groups markers (used by the editor's
`getSameTypeMarkers()` to apply shared formatting). A user
opens a marker, types a new type label, and blurs — the
change handler runs `marker.type = this.value`. No redraw
needed: the SVG marker icon itself does not depend on the
type.

The AI chat has `set_marker_note`, `set_marker_pinned`,
`set_marker_lock`, and `add_marker` — but no way to change
the type of an existing marker.

## Scope

Add one tool: `set_marker_type(marker, type)`.

- `marker` required — numeric id (> 0) or case-insensitive
  current note name (reuses `findMarkerNoteRef` from
  set-marker-note).
- `type` required — non-empty trimmed string. No enum: the
  UI accepts free-form. Allow clearing via explicit empty
  string? No — rename "clear" to unset omitted, keep scope
  narrow: type must be a non-empty string (matches the
  existing validation pattern for name/legend inputs).
- Writes `marker.type = trimmed`.
- Idempotent: noop when already the same value.
- No redraw call needed — `marker.type` is pure metadata
  and changing it does not alter the rendered icon. (This
  matches what `changeMarkerType` does in the UI.)

## Implementation

1. **New file `src/ai/tools/set-marker-type.ts`**:
   - Imports: `errorResult`, `getNotes`, `getPack`,
     `okResult`, `parseEntityRef`, type `RawMarker`, type
     `RawNote`.
   - Re-uses `findMarkerNoteRef` + `MarkerNotePackLike` from
     `./set-marker-note` (same pattern as
     `set-marker-pinned`, `set-marker-lock`).
   - `MarkerTypeRef { i, name, previousType }`.
   - `MarkerTypeRuntime { find, setType }`.
   - `defaultMarkerTypeRuntime.find`: wrap
     findMarkerNoteRef, then read the marker's current type.
   - `defaultMarkerTypeRuntime.setType`: find marker by id
     in `pack.markers`, write `m.type = type`.
   - Tool schema: `marker` (int|string required), `type`
     (string required).
   - Noop path: previousType === trimmed input → return
     noop: true.
   - Error path: marker not found; pack.markers missing;
     type not a non-empty string.

2. **Register** in `src/ai/index.ts`: import, barrel
   re-export, and `registry.register(setMarkerTypeTool)` in
   `buildDefaultRegistry()`.

3. **Tests** — `src/ai/tools/set-marker-type.test.ts`
   parallel to set-marker-pinned:
   - `resolveMarkerTypeRef` equivalent via runtime stub.
   - Unit: sets by id, sets by name, noop when unchanged,
     rejects non-string / empty string type, rejects
     invalid marker refs, surfaces runtime errors.
   - Integration: stubs `globalThis.pack` + `globalThis.notes`,
     calls the real `setMarkerTypeTool`, asserts that
     `pack.markers[i].type` is updated. Also verifies the
     tool does NOT call `drawMarkers` (no DOM side effect).

4. **README_AI.md** — add row near `set_marker_pinned`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-type` green.
- `npm test -- --run` — 990 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can set a marker's type string via id or note name.
- Idempotent: noop when already set to the requested value.
- Rejects empty / whitespace-only types.
- Does not call drawMarkers (matches UI behavior).
