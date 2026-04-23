# Plan 89 — set_marker_icon AI tool

## Use case

The Markers Editor's icon button
(`public/modules/ui/markers-editor.js:118`) opens an icon
picker. Selecting an emoji / URL runs
`changeMarkerIcon`, which writes
`marker.icon = value` (and, in the UI, cascades to all
same-type markers via `getSameTypeMarkers()` and calls
`redrawIcon(marker)` for each).

The AI chat can `set_marker_note`, `set_marker_pinned`,
`set_marker_lock`, `set_marker_type`, but not change the
icon. This tool fills that gap.

## Scope

Add one tool: `set_marker_icon(marker, icon)`.

- `marker` — numeric id (> 0) or case-insensitive note
  name (reuses findMarkerNoteRef).
- `icon` — non-empty trimmed string. Accepts any glyph
  (emoji) or URL. No enum validation — matches the UI's
  free-form icon input.
- Writes `marker.icon = trimmed`.
- **Per-marker scope**: does NOT cascade to same-type
  markers the way the UI does. Rationale: the AI tool
  should have predictable, precise scope; the AI can
  iterate if it wants bulk behavior. Documented
  divergence from the UI.
- Best-effort `drawMarkers()` call to refresh.
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-marker-icon.ts`**:
   - Imports: errorResult, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, type RawMarker, type
     RawNote from `./_shared`; findMarkerNoteRef,
     MarkerNotePackLike from `./set-marker-note`.
   - `MarkerIconRef { i, name, previousIcon }`.
   - `MarkerIconRuntime { find, setIcon }`.
   - `defaultMarkerIconRuntime`:
     - find: wrap findMarkerNoteRef, read marker.icon.
     - setIcon(i, icon): find marker, write `m.icon =
       icon`, best-effort drawMarkers().
   - Schema: `marker` (int|string), `icon` (string).
     Both required.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `src/ai/tools/set-marker-icon.test.ts`:
   - Unit (stubbed runtime):
     - sets icon by id
     - resolves by case-insensitive name
     - trims whitespace
     - noop when already at target
     - rejects empty / whitespace-only icon
     - rejects non-string icon
     - rejects invalid refs
     - rejects unknown marker
     - surfaces runtime errors
   - Integration:
     - stubs pack.markers + notes + drawMarkers.
     - writes icon by id.
     - resolves by name.
     - calls drawMarkers once.
     - no cascade: a same-type marker with a different
       id keeps its old icon.

4. **README_AI.md** — row near `set_marker_type`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-icon` green.
- `npm test -- --run` — 1104 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered, callable, documented.
- Writes `marker.icon = trimmed`.
- Scoped to the target marker only (no cascade).
- Best-effort drawMarkers call.
- Idempotent.
