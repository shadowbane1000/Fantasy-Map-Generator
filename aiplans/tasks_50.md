# Tasks 50 — list_regiments AI tool

## Task 1 — Extend pack-types

- [ ] In `src/ai/tools/_shared/pack-types.ts`:
  - Add `RawRegiment`:
    ```ts
    export interface RawRegiment {
      i: number;
      name?: string;
      t?: number;       // total troops
      a?: number;       // army
      u?: Record<string, number>;
      n?: number;       // 1 if naval/fleet
      type?: string;
      cell?: number;
      x?: number;
      y?: number;
      state?: number;
      icon?: string;
    }
    ```
  - Add `military?: RawRegiment[]` to `RawState`.
- [ ] Re-export `RawRegiment` from `_shared/index.ts`.

## Task 2 — Implement tool

- [ ] Create `src/ai/tools/list-regiments.ts`:
  - Imports: `createPaginatedListTool`, `getPack`, `isActive`,
    `RawRegiment`, `RawState` from `_shared`; `resolveStateRefInPack`
    from `./list-burgs`.
  - `RegimentSummary { i, name, stateId, state, type, total, army,
    cell, x, y, naval, units }`.
  - `RegimentPackLike` (mirrors `BurgPackLike`): `states?: RawState[];
    burgs?: BurgPackLike["burgs"]` — reuse `BurgPackLike` directly if
    convenient (it already has states).
  - `readRegimentsFromPack(pack)`:
    - If `!pack?.states` → null.
    - Iterate active states; skip those without a military array.
    - For each regiment in `state.military`, map to `RegimentSummary`
      with `stateId: state.i`, `state: state.name ?? null`, etc.
    - `naval: (r.n ?? 0) === 1`; `units: r.u ?? {}`; defensively
      coerce numbers.
  - `RegimentsRuntime { readRegiments, resolveStateRef }`.
  - `defaultRegimentsRuntime` wired to `getPack<BurgPackLike>()`.
  - Factory via `createPaginatedListTool<RegimentSummary,
    RegimentFilters>`:
    - `name: "list_regiments"`.
    - Description: mentions `pack.states[*].military`, troop counts,
      fleets.
    - Input schema: `limit`, `offset`, `state` (int|string), `type`
      (string), `naval_only` (bool), `min_total` (number ≥ 0).
    - `collectionKey: "regiments"`.
    - `notReadyError` referencing `map:generated`.
    - `parseFilters` validates each; rejects weird types.
    - `applyFilters`: resolveStateRef when present, filter cascade,
      echo the applied filters object.

## Task 3 — Register in ai/index

- [ ] `import { listRegimentsTool } from "./tools/list-regiments";`.
- [ ] Barrel re-export `createListRegimentsTool`,
  `listRegimentsTool`, `readRegimentsFromPack`.
- [ ] `registry.register(listRegimentsTool)` near the other list
  tools.

## Task 4 — Tests

- [ ] `src/ai/tools/list-regiments.test.ts` covers:
  - Flatten across states; annotates state name.
  - Skips states without `military` or with an empty array.
  - Skips removed states (already filtered by `isActive`).
  - Pagination.
  - `state` filter by id and by case-insensitive name (via injected
    `resolveStateRef`).
  - Unknown state filter returns an error.
  - `type` filter case-insensitive.
  - `naval_only` filter.
  - `min_total` filter.
  - Invalid input validations (non-bool naval_only, non-number
    min_total, non-string type, invalid state ref).
  - not-ready when pack.states is missing.

## Task 5 — Default-runtime smoke test

- [ ] In the same test file, small describe block:
  - Stub `globalThis.pack` with two states, one with regiments and
    one without.
  - Call `listRegimentsTool.execute({})` and verify the flattened
    output matches.

## Task 6 — README

- [ ] Row under `list_routes`:
  ```
  | `list_regiments`        | List military regiments across all states (the same data the Military Overview reads from `pack.states[*].military`). Each entry reports id, name, state, type, total troops, army, coords, cell, naval flag, and unit composition. Paginated. Optional filters: `state` (id or name), `type` (case-insensitive), `naval_only`, `min_total`. | "List all fleets", "How many troops does Rookholm field?", "Show me armies of 5000+ troops" |
  ```

## Task 7 — Verify

- [ ] `npm test -- --run src/ai/tools/list-regiments` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7/1 baseline. Fix any autofixable patterns
  (`x && x.y` → `x?.y`) before committing.
- [ ] `npm run build` succeeds.

## Task 8 — Commit

- [ ] `feat(ai): add list_regiments tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (pack-types) → Task 1.
- Plan step 2 (tool) → Task 2.
- Plan step 3 (register) → Task 3.
- Plan step 4 (tests) → Tasks 4, 5.
- Plan step 5 (default-runtime smoke) → Task 5.
- Plan step 6 (README) → Task 6.
- Plan "Verification" → Task 7.

## Verification that plan accomplishes the use case

- Use case: AI can't see regiments; user can via Military Overview.
- Plan flattens the exact same `state.military` arrays the UI reads,
  using the same unit-composition structure (`regiment.u`) so
  follow-up prompts ("how many swordsmen does Rookholm have?") can
  answer from `units["Swordsmen"]`.
- State filter reuses the existing `resolveStateRefInPack` helper,
  so the AI can refer to states by id OR case-insensitive
  name/fullName — consistent with `list_burgs` and
  `list_provinces`.

## Verification that tests prove the use case

- Flatten tests prove cross-state aggregation.
- Filter tests (state / type / naval_only / min_total) cover every
  decision branch of the `applyFilters` cascade.
- Default-runtime smoke test confirms the helper wires up to the
  live `globalThis.pack` correctly, not just a fake runtime.
