# Plan 125 — set_marker_shift AI tool

## Use case

The Markers Editor (`public/modules/ui/markers-editor.js`)
exposes two number inputs `markerIconShiftX` and
`markerIconShiftY` that control the *icon's* horizontal /
vertical offset inside the pin (the "Icon dx / Icon dy"
fields). They are distinct from the marker position
(`marker.x` / `marker.y`, already covered by `move_marker`)
and from icon size (`marker.px`, covered by
`set_marker_icon_size`).

Data shape (confirmed in editor at lines 17-18, 43-44,
104-105, 138-152, 196-210):
- Fields are `marker.dx` and `marker.dy`.
- Default when unset: `50` each (percentage — they are
  rendered as `x="{dx}%"` / `y="{dy}%"` on the icon `<text>`
  element and `x="{dx/2}%"` / `y="{dy/2}%"` on the icon
  `<image>` element).
- UI number input: `min="0"`, `max="100"`, `step="1"`.
- On change, editor runs `redrawIcon(marker)` which sets
  `x` / `y` on `#markerN > text` and `#markerN > image`.
- Editor also seeds the inputs to `50` when the marker
  has no `dx` / `dy` yet (`marker.dx || 50`).

Note: the task description mentioned "approximate range
-5 to +5". That's wrong — the HTML input uses `min="0"
max="100" step="1"` (percentage offsets inside the pin).
We honor the HTML input bounds `[0, 100]`.

Goal: expose a per-marker AI tool for the LLM to shift the
icon inside its pin without touching marker position.

## Scope

Add one tool: `set_marker_shift(marker, dx?, dy?)`.

- `marker` — number (id > 0) or `"marker-123"` / current
  note name (string). Required.
- `dx` — finite number in `[0, 100]`. Optional.
- `dy` — finite number in `[0, 100]`. Optional.
- At least one of `dx` / `dy` required.
- Partial update: if only `dx` is given, existing `dy` is
  preserved (not clobbered to `undefined`). Same for `dy`.
- Per-marker scope (no cascade to same-type markers — the
  AI can iterate).
- Idempotent (noop if both fields unchanged).
- Best-effort calls `drawMarkers()` to refresh the map.
- On success: `{ok, i, previousDx, previousDy, dx, dy}`
  (per the use case spec — no `name` / `noop` required,
  but keep parity with `set_marker_icon_size` by returning
  a flat result object).

## Implementation

1. **`src/ai/tools/set-marker-shift.ts`** — mirror
   `set-marker-icon-size.ts` with the runtime-seam pattern:
   - `interface SetMarkerShiftRuntime {
       find(ref): {i, name, previousDx, previousDy} | null;
       apply(i, dx, dy): void;
     }`
   - `defaultSetMarkerShiftRuntime` uses
     `findMarkerNoteRef` + `getPack` + `getGlobal` to
     mutate `marker.dx` / `marker.dy` and call
     `drawMarkers()`.
   - Exports `DEFAULT_MARKER_SHIFT = 50`,
     `MARKER_SHIFT_MIN = 0`,
     `MARKER_SHIFT_MAX = 100`.

2. **Registration** in `src/ai/index.ts`:
   - Import `setMarkerShiftTool` + factory.
   - Re-export alongside the other marker tools.
   - `registry.register(setMarkerShiftTool)` beside
     `setMarkerIconSizeTool`.

3. **`pack-types.ts`** — already has `dx?: number` and
   `dy?: number` on `RawMarker`; no change needed.

4. **Tests** `src/ai/tools/set-marker-shift.test.ts`:
   - Unit (stubbed runtime):
     - sets both dx and dy by numeric id
     - sets only dx (preserves existing dy in the response
       and in the apply call)
     - sets only dy (preserves existing dx)
     - resolves by case-insensitive note name
     - rejects when both dx and dy are missing
     - rejects when both dx and dy are undefined
     - rejects non-finite dx
     - rejects non-finite dy
     - rejects out-of-range dx (< 0, > 100)
     - rejects out-of-range dy (< 0, > 100)
     - accepts boundary values 0 and 100
     - rejects invalid marker refs
     - rejects unknown marker
     - noop when both unchanged
     - surfaces runtime errors
   - `defaultSetMarkerShiftRuntime` integration:
     - writes `marker.dx` / `marker.dy` on target and calls
       `drawMarkers` once
     - partial update preserves untouched field
     - resolves by case-insensitive note name
     - does NOT cascade to same-type markers
     - succeeds when `drawMarkers` is missing

5. **`README_AI.md`** — add a table row directly beneath
   `set_marker_icon_size`, reusing the same prose style
   (the "Using the chat in the app" section already
   documents the API-key flow; the row references
   per-marker scope and user invocation examples).

## Verification

- `npm test -- --run src/ai/tools/set-marker-shift`
  green.
- `npm test -- --run` — 1521 before; target 1521 +
  new tests.
- `npm run lint` — baseline 0 errors / 7 warnings / 1
  info; must match.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired into registry, exported in barrel.
- `marker.dx` / `marker.dy` updated in-memory and DOM
  refreshed via `drawMarkers()`.
- Partial update works — never clobbers the untouched
  field.
- Per-marker scope (no cascade).
- Range clamped to the UI's `[0, 100]`.
- Documented in README_AI.md with invocation examples.
