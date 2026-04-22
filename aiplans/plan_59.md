# Plan 59 — add_marker AI tool

## Use case

The Markers Editor (`public/modules/ui/markers-editor.js`) lets a
user place a new POI on the map by clicking — the flow goes through
`Markers.add({...baseMarker, x, y, cell})` and the result lands in
`pack.markers[]` with an auto-assigned `i`. Optionally a note is
created.

The chat already has `list_markers` / `set_marker_note` /
`set_marker_pinned` / `set_marker_lock` / `remove_marker` but no
way to create one. That's a significant gap — the AI can edit
existing POIs but can't build a lore map from scratch.

## Scope

Add one tool: `add_marker(x, y, type?, icon?, name?, legend?, lock?)`:

- `x`, `y` required finite numbers (map pixel coords).
- `type` defaults to "custom" — free-form string (matches the
  fallback path in `Markers.add` where no config matches).
- `icon` defaults to "📍" — any unicode string that renders as the
  marker glyph.
- `name` optional — when provided, creates a note with id
  `marker{i}` and this name.
- `legend` optional — when provided with `name`, stored on the
  note. Without `name`, legend is ignored.
- `lock` optional boolean — when true, sets `marker.lock`.

Resolution: use the global `findCell(x, y)` to compute the cell
id; push a new marker into `pack.markers` with the next `i`
(`(last(pack.markers)?.i ?? 0) + 1`, or 1 if empty — to avoid
the placeholder 0 convention other collections use). Upsert the
note if applicable. Call `drawMarkers()` to render.

## Implementation

1. **New file `src/ai/tools/add-marker.ts`**:
   - Imports: `errorResult`, `getGlobal`, `getNotes`, `getPack`,
     `okResult`, type `RawMarker`, type `RawNote`.
   - `MarkerAddInput { x, y, type, icon, name, legend, lock }`.
   - `NewMarker { i, type, icon, x, y, cell, name, legend, lock }`.
   - `MarkerAddRuntime { add(input: MarkerAddInput): NewMarker }`.
   - `defaultMarkerAddRuntime.add`:
     - Get `markers = pack.markers`; throw if absent.
     - Get `findCell` global; throw if absent.
     - Compute `cell = findCell(x, y)`.
     - Compute next i: `const lastI = markers.length ?
       markers[markers.length - 1].i : 0; const i = lastI + 1`.
       (Using length-based lookup avoids a sort; matches the
       `last(pack.markers)?.i + 1 || 0` pattern in the generator.)
     - Build and push `{ i, type, icon, x, y, cell, lock? }`.
     - If `name` provided: upsert `window.notes` with
       `{ id: "marker{i}", name, legend: legend ?? "" }` (initialize
       notes to [] if undefined).
     - Call `drawMarkers()` if available (best-effort try/catch).
     - Return the new marker + name/legend.
   - Tool schema: x, y (required numbers), type, icon, name
     (strings, optional), legend (string, optional), lock
     (boolean optional).
   - Execute: validate, runtime.add, return the NewMarker body.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/add-marker.test.ts`**:
   - Runtime-injected:
     - Adds with just x, y → defaults applied (type "custom",
       icon "📍").
     - Adds with type + icon + name + legend + lock.
     - Rejects non-finite x / y.
     - Rejects invalid types for each optional (non-string type,
       etc).
     - Surfaces runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.pack` with empty markers[].
     - Stub `globalThis.findCell` to return a deterministic cell id.
     - Stub `globalThis.drawMarkers` mock.
     - Stub `globalThis.notes` empty array.
     - Call tool with x=100, y=200 → marker pushed, cell = stubbed,
       i = 1 (since empty), note NOT created (no name), drawMarkers
       called.
     - Call with name + legend → note pushed with id "marker1" etc.
     - Call with lock: true → marker.lock = true.
     - Call when pack.markers missing → error surfaced.
     - Call when findCell missing → error surfaced.

4. **README_AI.md** — row near `remove_marker`.

## Verification

- `npm test -- --run src/ai/tools/add-marker` green.
- `npm test -- --run` — 732 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "drop a marker at (500, 300) called 'Dragon Lair'" and
  the marker appears on the map with its note.
- Sensible defaults (type "custom", icon "📍") when caller is
  minimal.
- Handles the edge where `window.notes` doesn't exist yet.
