# Plan 123 — set_marker_icon_size AI tool

## Use case

The Markers Editor (`public/modules/ui/markers-editor.js`)
exposes a second number input `markerIconSize` that
controls the *icon* (emoji/glyph) size inside the pin. It
is distinct from the pin/element `Size` input
(`marker.size`) covered by `set_marker_size`.

Data shape (confirmed in editor):
- Field is `marker.px` (pixels).
- Default when unset: `12`.
- UI number input: `min="2"`, `max="20"`, `step="0.5"`.
- On change, editor runs `redrawIcon(marker)` which sets
  `font-size` on `#markerN > text` and `width`/`height` on
  `#markerN > image`.

Goal: expose a per-marker AI tool for the LLM to change the
icon size without invoking the pin-size tool.

## Scope

Add one tool: `set_marker_icon_size(marker, size)`.

- `marker` — number (id > 0) or `"marker-123"` / current
  note name (string). Required.
- `size` — finite number in `[2, 20]`. Required.
- Per-marker scope (no cascade to same-type markers — the
  AI can iterate).
- Idempotent (noop if unchanged).
- Best-effort calls `drawMarkers()` to refresh the map.
- On success: `{ok, i, name, px, previousPx, noop}`.

## Implementation

1. **`src/ai/tools/set-marker-icon-size.ts`** — mirror
   `set-marker-size.ts` with the runtime-seam pattern:
   - `interface SetMarkerIconSizeRuntime {
       find(ref): {i, name, previousPx} | null;
       apply(i, px): void;
     }`
   - `defaultSetMarkerIconSizeRuntime` uses
     `findMarkerNoteRef` + `getPack` + `getGlobal` to
     mutate `marker.px` and call `drawMarkers()`.
   - Exports `DEFAULT_MARKER_ICON_SIZE = 12`,
     `MARKER_ICON_SIZE_MIN = 2`,
     `MARKER_ICON_SIZE_MAX = 20`.

2. **Registration** in `src/ai/index.ts`:
   - Import `setMarkerIconSizeTool` + factory.
   - Re-export alongside the other marker tools.
   - `registry.register(setMarkerIconSizeTool)` beside
     `setMarkerSizeTool`.

3. **`pack-types.ts`** — already has `px?: number` on
   `RawMarker`; no change needed.

4. **Tests** `src/ai/tools/set-marker-icon-size.test.ts`:
   - Unit (stubbed runtime):
     - sets px by numeric id
     - resolves by case-insensitive note name
     - rejects non-finite / non-number size
     - rejects out-of-range size (< 2, > 20)
     - rejects invalid marker refs
     - rejects unknown marker
     - noop when px is unchanged
     - surfaces runtime errors
   - `defaultSetMarkerIconSizeRuntime` integration:
     - writes `marker.px` on target marker and calls
       `drawMarkers` once
     - resolves by case-insensitive note name
     - does NOT cascade to same-type markers
     - succeeds when `drawMarkers` is missing

5. **`README_AI.md`** — add a table row directly beneath
   `set_marker_size`, reusing the same prose style (the
   "Using the chat in the app" section already documents
   the API-key flow; the row references per-marker scope
   and user invocation examples).

## Verification

- `npm test -- --run src/ai/tools/set-marker-icon-size`
  green.
- `npm test -- --run` — 1495 before; target 1495 +
  new tests.
- `npm run lint` — baseline 0 errors / 7 warnings / 1
  info; must match.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired into registry, exported in barrel.
- `marker.px` updated in-memory and DOM refreshed via
  `drawMarkers()`.
- Per-marker scope (no cascade).
- Range clamped to the UI's `[2, 20]`.
- Documented in README_AI.md with invocation examples.
