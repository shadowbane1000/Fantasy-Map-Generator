# Plan 96 — set_marker_pin AI tool

## Use case

The Markers Editor's Pin Shape dropdown
(`public/modules/ui/markers-editor.js:172`) writes
`marker.pin = value` (then cascades to same-type markers
in the UI). Options are: `bubble`, `pin`, `square`,
`squarish`, `diamond`, `hex`, `hexy`, `shieldy`,
`shield`, `pentagon`, `heptagon`, `circle`, `no`
(defined in `src/index.html:3662`). Default is `bubble`.

The AI chat has tools for marker type, icon, size, note,
pinned/locked, position — but not pin shape.

## Scope

Add one tool: `set_marker_pin(marker, pin)`.

- `marker` — id (> 0) or case-insensitive note name.
- `pin` — one of the 13 canonical shape names
  (case-insensitive).
- Writes `marker.pin = canonical`.
- Best-effort `drawMarkers()` call.
- Per-marker scope (same decision as set_marker_icon /
  set_marker_size).
- Idempotent.

## Implementation

1. **Add `pin?: string` to RawMarker** in
   `src/ai/tools/_shared/pack-types.ts`.

2. **Also add `fill?: string; stroke?: string;`** while
   we're here — both are used by the marker pin SVG and
   referenced by the markers editor. Not strictly needed
   for this tool but cheap to include alongside.

3. **New file `src/ai/tools/set-marker-pin.ts`**:
   - Imports: errorResult, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, type RawMarker,
     type RawNote from `./_shared`; findMarkerNoteRef,
     type MarkerNotePackLike from `./set-marker-note`.
   - `MARKER_PIN_SHAPES` readonly tuple with the 13
     shapes.
   - `DEFAULT_MARKER_PIN = "bubble"`.
   - `resolveMarkerPin(value): string | null` —
     case-insensitive lookup.
   - `MarkerPinRef { i, name, previousPin }`.
   - `MarkerPinRuntime { find, setPin }`.
   - `defaultMarkerPinRuntime`:
     - find: wrap findMarkerNoteRef + read
       `marker.pin ?? DEFAULT_MARKER_PIN`.
     - setPin: find marker, write marker.pin, best-effort
       drawMarkers().
   - Schema: `marker` (int|string, required), `pin`
     (string enum of shapes, required).

4. **Register** in `src/ai/index.ts`.

5. **Tests** `set-marker-pin.test.ts`:
   - `resolveMarkerPin` canonicalization.
   - Unit (stubbed):
     - sets by id
     - resolves by case-insensitive name
     - canonicalizes case of pin input
     - rejects unknown pin shape
     - rejects empty / non-string
     - rejects invalid refs
     - rejects unknown marker
     - noop when unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.markers + notes + drawMarkers.
     - writes pin by id.
     - no cascade to same-type markers.
     - succeeds when drawMarkers missing.

6. **README_AI.md** — row near `set_marker_size`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-pin` green.
- `npm test -- --run` — 1184 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Validates against the 13 canonical shapes.
- Writes marker.pin; best-effort drawMarkers.
- Per-marker scope; idempotent.
