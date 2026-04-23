# Plan 95 — set_marker_size AI tool

## Use case

The Markers Editor's Size input
(`public/modules/ui/markers-editor.js:154`) writes
`marker.size = +this.value` and recomputes SVG `width`
/ `height` / `x` / `y` with a `rescale` zoom factor. The
default size is 30.

The AI chat has `set_marker_icon`, `set_marker_type`,
`set_marker_note`, `set_marker_pinned`, `set_marker_lock`,
`move_marker` — but no way to change marker size.

## Scope

Add one tool: `set_marker_size(marker, size)`.

- `marker` — id (> 0) or case-insensitive note name.
- `size` — positive finite number. No strict upper
  bound — the UI accepts arbitrary numeric input, but we
  enforce `> 0` to avoid zero/negative sizes that would
  render invisible / inverted glyphs.
- Writes `marker.size = size`.
- Best-effort call `drawMarkers()` to refresh the layer.
  (Skipping the UI's per-element zoom-aware math —
  drawMarkers does a full re-render which is always
  correct.)
- **Per-marker scope**: same decision as set_marker_icon.
  The UI cascades to same-type markers; the AI tool
  scopes to the target marker for predictable control.
  Documented divergence.
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-marker-size.ts`**:
   - Imports: errorResult, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, type RawMarker,
     type RawNote from `./_shared`; findMarkerNoteRef,
     type MarkerNotePackLike from `./set-marker-note`.
   - `MarkerSizeRef { i, name, previousSize }`.
   - `MarkerSizeRuntime { find, setSize }`.
   - `defaultMarkerSizeRuntime`:
     - find: use findMarkerNoteRef; read `marker.size ?? 30`
       (UI default).
     - setSize(i, size): find marker, assign
       `marker.size = size`, best-effort drawMarkers().
   - Schema: `marker` (int|string required), `size`
     (number required, > 0).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-marker-size.test.ts`:
   - Unit (stubbed):
     - sets by id
     - resolves by case-insensitive name
     - rejects non-finite / zero / negative size
     - rejects invalid refs
     - rejects unknown marker
     - noop when unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.markers + notes + drawMarkers.
     - writes size, calls drawMarkers.
     - no cascade to same-type markers.
     - succeeds when drawMarkers missing.

4. **README_AI.md** — row near `set_marker_icon`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-size` green.
- `npm test -- --run` — 1172 before.
- `npm run lint` — 7/1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Writes marker.size.
- Per-marker scope; drawMarkers best-effort.
- Idempotent.
