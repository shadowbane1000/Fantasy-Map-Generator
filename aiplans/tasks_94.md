# Tasks 94 — move_marker AI tool

- [ ] Create `src/ai/tools/move-marker.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getNotes,
      getPack, okResult, parseEntityRef, type RawMarker,
      type RawNote.
    - `./set-marker-note`: findMarkerNoteRef,
      type MarkerNotePackLike.
  - Exports:
    - `MoveMarkerRef { i, name, previousX, previousY,
       previousCell }`.
    - `MoveMarkerRuntime { find, move }` where
      `move(ref, x, y) -> number` returns new cell.
    - `defaultMoveMarkerRuntime`:
      - find: use findMarkerNoteRef; read marker.x,
        marker.y, marker.cell.
      - move(ref, x, y):
        - Get pack.markers; throw if missing.
        - Find marker by id; throw if missing.
        - Look up findCell global; throw if missing.
        - const cell = findCell(x, y).
        - Write marker.x = x; marker.y = y; marker.cell
          = cell.
        - Best-effort: update `#marker{i}` SVG x/y
          attrs.
        - Best-effort: drawMarkers() call.
        - Return cell.
    - `createMoveMarkerTool(runtime?)` / `moveMarkerTool`.
  - Tool name: `move_marker`.
  - Description: mentions Markers Editor drag behavior,
    writes x/y/cell, best-effort SVG update.
  - Schema: `marker` (int|string required), `x` (number
    required, finite), `y` (number required, finite).
  - Validation:
    - parseEntityRef.
    - typeof x !== "number" || !Number.isFinite(x) →
      error.
    - typeof y !== "number" || !Number.isFinite(y) →
      error.
    - find returns null → "No marker found..."
  - Noop: previousX === x && previousY === y.
  - Return payload: `{ i, name, x, y, cell, previousX,
    previousY, previousCell, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other marker tools.
  - Barrel re-export.
  - `registry.register(moveMarkerTool)` near other
    `setMarker*` / `addMarker`.

- [ ] Write `src/ai/tools/move-marker.test.ts`:
  - Unit (stubbed runtime):
    - moves by numeric id
    - resolves by case-insensitive name
    - rejects non-finite x (Infinity, NaN, non-number)
    - rejects non-finite y
    - rejects invalid marker refs
    - rejects unknown marker
    - noop when coords unchanged
    - surfaces runtime errors
  - `defaultMoveMarkerRuntime (integration)`:
    - stubs `globalThis.pack.markers` (2 markers),
      `globalThis.notes` (one note),
      `globalThis.findCell = vi.fn(() => 42)`,
      `globalThis.drawMarkers = vi.fn()`.
    - stubs `globalThis.document` with a fake marker
      SVG element that has setAttribute.
    - move by id: verify marker.x/y/cell updated,
      SVG x/y attrs updated, drawMarkers called once.
    - resolves by name.
    - errors when findCell is not defined.

- [ ] Update `README_AI.md` — row near `add_marker`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add move_marker tool`.

## Verification: tasks → plan

- File + registration cover "callable".
- Runtime seam (find / move) matches plan's shape.
- Integration covers findCell + SVG + drawMarkers as
  documented in the plan.

## Verification: plan → use case

- UI drag updates marker.x, marker.y, marker.cell using
  findCell — tool does the same. UI also updates the
  SVG rect in-place; tool does the same via
  setAttribute.

## Verification: tests → regressions

- If move forgot to update cell, integration assertion
  fails.
- If findCell missing wasn't caught, the error test
  fails.
- If SVG x/y attrs weren't updated, those assertions
  fail.
- If non-finite x/y slipped through, validation tests
  fail.
- If noop semantics removed, noop test fails.
