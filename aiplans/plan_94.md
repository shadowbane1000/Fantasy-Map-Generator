# Plan 94 — move_marker AI tool

## Use case

The Markers Editor lets users drag a marker on the map
(`public/modules/ui/markers-editor.js:73`). The drag end
handler:

```js
marker.x = rn(x + dx + zoomSize / 2, 1);
marker.y = rn(y + dy + zoomSize, 1);
marker.cell = findCell(marker.x, marker.y);
```

and the SVG `<svg id="marker{i}">`'s `x` / `y` attrs are
updated in-place.

The AI chat can `add_marker`, rename/set_note, change
type/icon/pinned/locked, and remove markers — but there's
no way to relocate an existing marker.

## Scope

Add one tool: `move_marker(marker, x, y)`.

- `marker` — id (> 0) or case-insensitive note name.
- `x`, `y` — finite numbers. (Negative values are allowed
  — the map viewbox can extend below 0 if a user loaded
  an unusual map; but typical maps have x/y ≥ 0.)
- Updates `marker.x`, `marker.y`, and `marker.cell =
  findCell(x, y)`.
- Best-effort SVG update on `#marker{i}`: set its `x`/`y`
  attrs directly. (The UI handles zoom-size dependent
  positioning; we keep it simple by writing the raw
  coords.)
- Best-effort `drawMarkers()` if available (alternative
  to per-element SVG updates).
- Idempotent: noop when x, y already match and cell is
  unchanged.

## Implementation

1. **New file `src/ai/tools/move-marker.ts`**:
   - Imports: errorResult, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, type RawMarker,
     type RawNote from `./_shared`; findMarkerNoteRef,
     type MarkerNotePackLike from `./set-marker-note`.
   - `MoveMarkerRef { i, name, previousX, previousY,
      previousCell }`.
   - `MoveMarkerRuntime { find, move }`.
   - `move(ref, x, y)` returns the new cell id.
   - `defaultMoveMarkerRuntime`:
     - find: wrap findMarkerNoteRef; read marker.x,
       marker.y, marker.cell.
     - move(ref, x, y):
       - Find marker. Throw if missing.
       - `cell = findCell(x, y)` — throw if findCell
         missing.
       - Write `marker.x = x; marker.y = y; marker.cell = cell`.
       - Best-effort update `#marker{i}` SVG x/y attrs.
       - Best-effort call `drawMarkers()` (covers the case
         where the marker isn't rendered yet).
       - Return cell.
   - Schema: `marker` (int|string required), `x` (number
     required), `y` (number required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `move-marker.test.ts`:
   - Unit (stubbed):
     - moves by id
     - resolves by case-insensitive name
     - rejects non-finite x/y
     - rejects invalid refs
     - rejects unknown marker
     - noop when coords unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.markers + findCell + drawMarkers +
       a minimal DOM.
     - moves a marker: updates x, y, cell; SVG x/y attrs
       updated.
     - rejects when findCell missing.

4. **README_AI.md** — row near `add_marker`.

## Verification

- `npm test -- --run src/ai/tools/move-marker` green.
- `npm test -- --run` — 1161 before.
- `npm run lint` — 7/1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Writes marker.x, marker.y, marker.cell.
- Uses findCell for cell computation.
- Best-effort SVG + drawMarkers.
- Idempotent.
