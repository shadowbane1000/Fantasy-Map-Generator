# Tasks 77 — set_province_capital AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-province-capital.ts`:
  - Imports: `errorResult`, `findEntityByRef`,
    `getPackCollection`, `okResult`, `parseEntityRef`, type
    `RawBurg`, `RawProvince`.
  - Types:
    - `ProvinceCapitalProvince { i, name, stateId,
      previousBurgId, previousBurgName }`.
    - `ProvinceCapitalBurg { i, name, state, cell }`.
    - `ProvinceCapitalRuntime { findProvince, findBurg, apply }`.
  - `defaultProvinceCapitalRuntime`:
    - `findProvince(ref)`:
      - `findEntityByRef` over provinces → null if missing.
      - Shape: `{ i, name, stateId: province.state ?? 0,
        previousBurgId: province.burg ?? 0, previousBurgName:
        name-lookup-of-previousBurg }`.
    - `findBurg(ref)`:
      - `findEntityByRef` over burgs → null if missing.
      - Shape: `{ i, name, state: burg.state ?? 0, cell:
        burg.cell ?? 0 }`.
    - `apply(provinceId, burgId, cell)`:
      - Lookup province via `getPackCollection<RawProvince>(
        "provinces")[provinceId]` and burg via
        `getPackCollection<RawBurg>("burgs")[burgId]`. Throw
        if missing/removed.
      - `province.burg = burgId`; `province.center = cell`.
  - Tool schema: `province` (int|string required), `burg`
    (int|string required).
  - Execute:
    - parseEntityRef(province) + parseEntityRef(burg).
    - findProvince → 404; findBurg → 404.
    - Reject province.i ≤ 0, burg.i ≤ 0.
    - Reject if `burg.state !== province.stateId` with a clear
      message suggesting reassignment.
    - try `apply(province.i, burg.i, burg.cell)`.
    - Return `{ province: {i, name}, previousBurg: {id, name},
      burg: {i, name} }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register near
  `setStateCapitalTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-province-capital.test.ts`:
  - Runtime-injected:
    - Sets capital by ids.
    - Match by names.
    - Refuse province 0 / burg 0.
    - Refuse cross-state pair.
    - Reject invalid refs.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack` with provinces and burgs.
    - Apply → `province.burg` + `province.center` updated.
    - Cross-state refusal: pack contains a province with
      state=1 and a burg with state=2; tool rejects.

## Task 4 — README

- [ ] Row near `rename_province`:
  ```
  | `set_province_capital`  | Promote a burg to be a province's capital — same side-effect as the Provinces Editor capital dropdown. Writes `province.burg` and `province.center`. The burg must belong to the same state as the province; the tool rejects cross-state pairs with a clear error. Matches province by id (>0) or name/fullName; burg by id (>0) or name. | "Make Rookholm the capital of the Stormvale province", "Promote burg 5 to province 3's capital" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-province-capital` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_province_capital tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Provinces Editor capital dropdown; UI-only.
- Plan writes the same `province.burg` and `province.center` the
  UI writes, and enforces the same state-membership constraint
  the UI presents (the dropdown filters to in-state burgs).

## Verification that tests prove the use case

- Integration test proves the live mutation.
- Cross-state rejection test prevents the footgun of orphaning
  a province's capital.
