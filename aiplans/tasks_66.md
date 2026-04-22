# Tasks 66 — set_regiment_unit AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-regiment-unit.ts`:
  - Imports: `errorResult`, `getGlobal`, `getPack`, `isActive`,
    `okResult`.
  - Reuse: `BurgPackLike`, `resolveStateRefInPack` from
    `./list-burgs`; `findRegimentByRef` from `./rename-regiment`.
  - Types:
    - `RegimentUnitRef { stateId, stateName, i, name,
      previousCount }`.
    - `RegimentUnitRuntime { find, apply }`.
  - `defaultRegimentUnitRuntime.find(stateRef, regRef, unit)`:
    - Resolve state via resolveStateRefInPack; null if missing.
    - Check state is active.
    - `findRegimentByRef(state.military, regRef)` → null if missing.
    - Previous count = `regiment.u?.[unit] ?? 0` (coerce to 0 if
      not number).
    - Return `{ stateId, stateName: state.name ?? "", i: reg.i,
      name: reg.name ?? "", previousCount }`.
  - `defaultRegimentUnitRuntime.apply(stateId, i, unit, count)`:
    - Get state + regiment; throw if missing.
    - Ensure `regiment.u` is an object; if not, initialize to `{}`.
    - `regiment.u[unit] = count`.
    - `regiment.a = Object.values(regiment.u).reduce(
      (s, v) => s + (typeof v === "number" && v > 0 ? v : 0), 0)`.
    - Best-effort: find `#regiment{stateId}-{i} text`; set
      `textContent` to `Military?.getTotal(regiment) ?? regiment.a`
      (as a string).
  - Tool schema: `state` (int|string), `regiment` (int|string),
    `unit` (string non-empty), `count` (integer ≥ 0).
  - Execute: validate refs, unit, count; find → 404; try apply;
    return `{ stateId, stateName, i, name, unit, previousCount,
    count }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export `createSetRegimentUnitTool`,
  `setRegimentUnitTool`.
- [ ] `registry.register(setRegimentUnitTool)` near
  `renameRegimentTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-regiment-unit.test.ts`:
  - Runtime-injected:
    - Sets existing unit count; response includes previousCount
      and new count.
    - Creates a new unit key.
    - Rejects invalid state ref (null, -1, 1.5, "").
    - Rejects invalid regiment ref (null, -1, 1.5, "").
    - Rejects invalid unit (null, "", "   ", 42).
    - Rejects invalid count (-1, 1.5, NaN, Infinity, non-number).
    - Accepts 0.
    - Surfaces runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.states` with state 1 containing a
      regiment `{ i: 0, name: "1st Army", u: { Swordsmen: 100,
      Archers: 50 }, a: 150 }`.
    - Stub `globalThis.document` with fake `#regiment1-0` whose
      querySelector returns a text element.
    - Stub `globalThis.Military = { getTotal: vi.fn(() => 350) }`.
    - Apply Swordsmen: 200 → u.Swordsmen = 200, a = 250, text
      content set to "350" (Military.getTotal used).
    - Apply a new Cavalry: 50 → u.Cavalry = 50, a = 150 + 50 = 200
      (note: using the pre-apply values — after the first test's
      beforeEach resets).
    - When Military is absent → text content uses regiment.a.
    - Unknown regiment → error.
    - Unknown state → error.

## Task 4 — README

- [ ] Row under `rename_regiment`:
  ```
  | `set_regiment_unit`     | Change a regiment's unit count — writes `regiment.u[unit]` and recomputes `regiment.a` (army sum). Adds the unit key if it's not yet on the regiment. Matches state and regiment via the same two-part ref as `rename_regiment`. Refreshes the on-map troop total if the Military module is available. | "Give Rookhold's 1st Army 300 Swordsmen", "Add 50 Cavalry to the Phalanx" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-regiment-unit` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_regiment_unit tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Regiment Editor unit inputs, UI-only.
- Plan writes the same `regiment.u[unit]` the UI writes and
  recomputes `regiment.a` from the same `Object.values` sum. The
  on-map text label update uses the same `Military.getTotal`
  when available.
- Free-form unit keys match the UI's data-driven inputs (they
  accept anything `options.military` defines).

## Verification that tests prove the use case

- Existing-unit update and new-unit creation both tested.
- Integration test proves `regiment.a` recalculation AND the
  textContent update on the live DOM element.
- Missing-Military fallback tested — the tool still works on
  maps generated before Military was introduced.
