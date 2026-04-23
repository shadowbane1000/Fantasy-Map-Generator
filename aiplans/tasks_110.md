# Tasks 110 — add_regiment AI tool

- [ ] Create `src/ai/tools/add-regiment.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPack, isActive, okResult, types RawRegiment,
    RawState.
  - Import resolveStateRefInPack + BurgPackLike from
    `./list-burgs`.
  - Local PackWithCells:
    ```
    interface PackWithCells {
      cells?: {
        h?: ArrayLike<number>;
        p?: [number, number][];
      };
      states?: RawState[];
    }
    ```
  - Exports:
    - `AddRegimentStateInfo { stateId, stateName }`.
    - `AddRegimentResult { i, name, cell, x, y, n,
       state }`.
    - `AddRegimentRuntime { findState, findCell,
       centroid, naval, add }`.
    - `defaultAddRegimentRuntime`:
      - findState: resolveStateRefInPack + isActive.
        Return stateId/name or null.
      - findCell: window.findCell; null if missing /
        non-integer.
      - centroid(cellId): pack.cells.p[cellId] as
        [cx, cy]; throw if missing.
      - naval(cellId): pack.cells.h[cellId] < 20 → 1
        else 0.
      - add(stateId, cellId, cx, cy, n):
        - Get Military module + getName; throw if
          missing.
        - Look up state; throw if missing.
        - i = state.military.length
          ? last(state.military).i + 1 : 0.
        - reg = { a:0, cell:cellId, i, n, u:{}, x:cx,
          y:cy, bx:cx, by:cy, state:stateId, icon:"🛡️" }.
        - reg.name = Military.getName(reg, military).
        - state.military.push(reg).
        - Best-effort Military.generateNote.
        - Best-effort drawRegiment(reg, stateId).
        - Return `{ i, name, cell:cellId, x:cx, y:cy,
           n, state:stateId }`.
    - `createAddRegimentTool(runtime?)` and
      `addRegimentTool`.
  - Tool name: `add_regiment`.
  - Description: references Regiment Editor Add Unit
    button, snaps to cell centroid, auto-names via
    Military.getName.
  - Schema:
    - state (int|string required)
    - x (number required)
    - y (number required)
  - Validation:
    - isValidRef(state).
    - typeof x / y !== number || !Number.isFinite → error.
    - findState returns null → error.
    - findCell returns null → error (findCell unavailable).
    - centroid lookup may throw → surfaced.
  - Return payload: `{ stateId, stateName, i, name,
    cell, x, y, n }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near addReligionTool.
  - Barrel re-export.
  - `registry.register(addRegimentTool)`.

- [ ] Write `src/ai/tools/add-regiment.test.ts`:
  - Unit (stubbed):
    - happy path returns new regiment
    - resolves state by case-insensitive name
    - rejects non-finite x
    - rejects non-finite y
    - rejects invalid state refs
    - rejects unknown state (findState null)
    - rejects findCell null
    - surfaces runtime errors (add throws)
  - `defaultAddRegimentRuntime (integration)`:
    - stubs pack, Military, drawRegiment, findCell.
    - happy path on land (n=0) and water (n=1).
    - errors when Military.getName missing.
    - resolves by state name.

- [ ] Update `README_AI.md` — row near
  `set_regiment_unit`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add add_regiment tool`.

## Verification: tasks → plan

- File + registration = "callable".
- Defaults match plan (icon, u, a, naval flag).
- Delegation to Military methods matches plan.

## Verification: plan → use case

- UI creates regiment with { a: 0, cell, i, n, u: {},
  x, y, bx, by, state, icon: "🛡️" }; tool does the
  same, snapping x/y to cell centroid.

## Verification: tests → regressions

- If icon default dropped, happy-path assertion fails.
- If naval flag wrong, naval/land tests fail.
- If Military.getName not called, the name assertion
  fails.
- If auto-id wrong (not last+1), the id assertion
  fails.
