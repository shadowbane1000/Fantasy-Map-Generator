# Tasks 59 — add_marker AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/add-marker.ts`:
  - Imports: `errorResult`, `getGlobal`, `getNotes`, `getPack`,
    `okResult`, type `RawMarker`, type `RawNote`.
  - Types:
    - `MarkerAddInput { x, y, type, icon, name, legend, lock }`.
    - `NewMarker { i, type, icon, x, y, cell, name, legend, lock }`.
    - `MarkerAddRuntime { add(input: MarkerAddInput): NewMarker }`.
  - `defaultMarkerAddRuntime.add(input)`:
    - `pack = getPack<{ markers?: RawMarker[] }>()`; throw if
      `!Array.isArray(pack?.markers)`.
    - `findCell = getGlobal<(x,y) => number>("findCell")`; throw if
      not function.
    - `cell = findCell(input.x, input.y)`.
    - `i = (markers.length ? markers[markers.length-1]!.i : 0) + 1`.
    - `type = input.type ?? "custom"`; `icon = input.icon ?? "📍"`.
    - `marker: RawMarker = { i, type, icon, x: input.x, y: input.y,
      cell }`. If `input.lock`: `marker.lock = true`.
    - `markers.push(marker)`.
    - If `input.name`:
      - Ensure notes: `let notes = getNotes<RawNote>(); if
        (!Array.isArray(notes)) { (globalThis as {notes?}).notes =
        []; notes = [] }`.
      - Push `{ id: "marker${i}", name: input.name, legend:
        input.legend ?? "" }`.
    - Best-effort `getGlobal<() => void>("drawMarkers")?.()`.
    - Return NewMarker shape.
  - Tool schema: required `x`, `y` numbers; optional `type`,
    `icon`, `name`, `legend` strings; optional `lock` boolean.
  - Execute: validate x,y finite numbers; validate optional
    fields; try runtime.add; return NewMarker body.

## Task 2 — Register

- [ ] Import; barrel re-export; `registry.register(addMarkerTool)`.

## Task 3 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/add-marker.test.ts`:
  - Minimal add (just x, y) → defaults applied, runtime.add called
    with them.
  - Full add (type, icon, name, legend, lock) → runtime.add called
    with each field.
  - Reject non-finite x / y (NaN, Infinity, "10", null).
  - Reject non-string type / icon / name / legend.
  - Reject non-boolean lock.
  - Surface runtime failures.

## Task 4 — Default-runtime integration test

- [ ] `describe("defaultMarkerAddRuntime (integration)")`:
  - beforeEach: `globalThis.pack = { markers: [] }`; stub
    `globalThis.findCell = vi.fn((x,y) => 42)`; stub
    `globalThis.drawMarkers = vi.fn()`; stub `globalThis.notes = []`.
  - afterEach: restore originals.
  - Tests:
    - Add minimal marker → pack.markers length 1, marker.i = 1,
      marker.type "custom", marker.icon "📍", marker.cell 42,
      drawMarkers called once, notes untouched.
    - Add with name + legend → note pushed with id "marker1",
      matching name/legend.
    - Add with lock: true → marker.lock === true.
    - When `pack.markers` is not present → error surfaced, no
      push.
    - When `findCell` missing → error surfaced.
    - When `window.notes` missing → it's created and the note
      lands there.
    - Second add after first → marker.i = 2.

## Task 5 — README

- [ ] Under `remove_marker` add:
  ```
  | `add_marker`            | Place a new marker on the map at (x, y). Optional `type` (free-form; default "custom"), `icon` (default 📍), `name` and `legend` (create a matching note with id `marker{i}`), `lock`. Uses the global `findCell(x,y)` to map coords → cell, pushes to `pack.markers`, calls `drawMarkers()`. | "Drop a marker at 500, 300 called Dragon Lair with legend 'Here there be dragons'", "Add a castle icon at the ruin site" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/add-marker` passes.
- [ ] `npm test -- --run` passes.
- [ ] `npm run lint` 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add add_marker tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Tasks 1.
- Plan step 2 → Task 2.
- Plan step 3 → Tasks 3, 4.
- Plan step 4 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: no AI path to create markers; UI click → `Markers.add`
  lands in pack.markers.
- Plan takes the fallback path (unknown type "custom" by default)
  of Markers.add — push to pack.markers with a fresh i, compute
  cell via findCell, and re-render via drawMarkers. Same effect
  as a UI-driven add of a custom marker.
- Note upsert via window.notes mirrors the Notes Editor flow and
  matches set_marker_note's id convention.

## Verification that tests prove the use case

- Integration test confirms all three side-effects: pack.markers
  push, optional notes push, drawMarkers call.
- Error paths for missing pack / findCell ensure the tool fails
  loudly in a half-loaded map rather than corrupting state.
- i-assignment test (second add → i=2) ensures ids don't collide.
