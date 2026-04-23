# Plan 97 — set_marker_colors AI tool

## Use case

The Markers Editor exposes two color inputs for the pin:
`markerFill` and `markerStroke`
(`public/modules/ui/markers-editor.js:180, 187`). Each
writes `marker.fill = value` / `marker.stroke = value`
(cascading to same-type markers in the UI) and calls
`redrawPin(marker)`.

The AI chat has no way to set a marker's pin colors.
Combining fill and stroke into one tool is natural — they
are a single visual concept (pin appearance), and it
saves the AI a round-trip when it wants to set both.

## Scope

Add one tool: `set_marker_colors(marker, fill?, stroke?)`.

- `marker` — id (> 0) or case-insensitive note name.
- `fill` — optional CSS color string (hex, named, rgb,
  rgba, hsl, hsla, hwb, lab, lch, color).
- `stroke` — optional CSS color string.
- At least one of fill / stroke must be provided.
- Writes `marker.fill` / `marker.stroke` as given.
- Best-effort `drawMarkers()`.
- Per-marker scope (same as set_marker_icon / size / pin).
- Idempotent: noop when both values (or the single
  provided value) match current.

## Implementation

1. **New file `src/ai/tools/set-marker-colors.ts`**:
   - Imports: errorResult, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, type RawMarker,
     type RawNote from `./_shared`;
     findMarkerNoteRef, type MarkerNotePackLike from
     `./set-marker-note`;
     isValidCssColor from `./set-state-color`.
   - `DEFAULT_MARKER_FILL = "#ffffff"`,
     `DEFAULT_MARKER_STROKE = "#000000"` (from the UI
     input defaults in index.html).
   - `MarkerColorsRef { i, name, previousFill,
      previousStroke }`.
   - `MarkerColorsRuntime { find, apply }`.
   - `apply(i, { fill?, stroke? })` writes whichever
     fields are present and calls drawMarkers.
   - Schema:
     - marker (int|string, required)
     - fill (string, optional)
     - stroke (string, optional)
     - Tool-level validation: at least one of fill /
       stroke required.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-marker-colors.test.ts`:
   - Unit (stubbed):
     - sets fill only
     - sets stroke only
     - sets both
     - resolves by name
     - rejects invalid CSS color
     - rejects missing both fill and stroke
     - rejects invalid refs
     - rejects unknown marker
     - noop when both match
     - noop when only provided field matches
     - surfaces runtime errors
   - Integration:
     - stubs pack.markers + notes + drawMarkers.
     - writes fill only; stroke preserved.
     - writes both; drawMarkers called.
     - no cascade to same-type markers.
     - succeeds when drawMarkers missing.

4. **README_AI.md** — row near `set_marker_pin`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-colors`
  green.
- `npm test -- --run` — 1199 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Accepts either or both of fill/stroke, requires at
  least one.
- Writes only the provided fields.
- Best-effort drawMarkers.
- Per-marker scope; idempotent.
