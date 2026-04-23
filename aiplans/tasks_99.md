# Tasks 99 — move_regiment AI tool

- [ ] Create `src/ai/tools/move-regiment.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getPack,
      isActive, okResult, type RawRegiment.
    - `./list-burgs`: BurgPackLike, resolveStateRefInPack.
    - `./rename-regiment`: findRegimentByRef.
  - Exports:
    - `MoveRegimentRef { stateId, stateName, i, name,
       previousX, previousY }`.
    - `MoveRegimentRuntime { find, move }`.
    - `defaultMoveRegimentRuntime`:
      - find: resolveStateRefInPack + isActive +
        findRegimentByRef. previousX/Y from reg.x/y
        (default 0).
      - move(stateId, i, x, y):
        - Look up state/regiment via pack; throw if
          missing.
        - Get `moveRegiment` global.
        - If present: call `moveRegiment(reg, x, y)`.
          Don't also write reg.x/y — moveRegiment does.
        - If missing: write reg.x = x; reg.y = y
          (fallback for test / pre-renderer env).
    - `createMoveRegimentTool(runtime?)` and
      `moveRegimentTool`.
  - Tool name: `move_regiment`.
  - Description: references the Regiment layer drag
    behavior, notes delegation to moveRegiment renderer,
    mentions fallback.
  - Schema: state (int|string), regiment (int|string),
    x (number), y (number). All required.
  - Validation:
    - isValidRef helper (reused pattern).
    - typeof x !== "number" || !Number.isFinite(x) → error.
    - typeof y !== "number" || !Number.isFinite(y) → error.
    - find returns null → "No regiment found..."
  - Noop: previousX === x && previousY === y.
  - Return payload: `{ stateId, stateName, i, name, x, y,
     previousX, previousY, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after moveMarkerTool.
  - Barrel re-export.
  - `registry.register(moveRegimentTool)`.

- [ ] Write `src/ai/tools/move-regiment.test.ts`:
  - Unit (stubbed):
    - moves by numeric ids
    - resolves by case-insensitive names
    - rejects non-finite x
    - rejects non-finite y
    - rejects invalid state refs
    - rejects invalid regiment refs
    - rejects unknown regiment
    - noop when coords unchanged
    - surfaces runtime errors
  - `defaultMoveRegimentRuntime (integration)`:
    - stubs `globalThis.pack.states` with military
      regiments + `globalThis.moveRegiment = vi.fn()`.
    - Move regiment → moveRegiment called with (reg, x,
      y). reg.x / y eventually reflect the new position
      (our mock can simulate that by writing to reg).
    - Fallback when moveRegiment missing: direct write
      to reg.x / y.

- [ ] Update `README_AI.md` — row near
  `set_regiment_icon`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add move_regiment tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime shape matches plan.
- Fallback branch matches plan.

## Verification: plan → use case

- UI's regiment drag mutates reg.x/y with SVG
  animation. Tool delegates to the same moveRegiment
  renderer for parity; fallback keeps the data path
  functional without a live renderer.

## Verification: tests → regressions

- If move forgot to call moveRegiment, integration
  assertion fails.
- If fallback wrote nothing, the fallback test fails.
- If non-finite x/y slipped through, validation tests
  fail.
- If noop semantics regressed, noop test fails.
