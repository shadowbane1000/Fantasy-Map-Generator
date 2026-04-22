# Tasks 63 — set_biome_habitability AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-biome-habitability.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult`;
    `findBiomeByRef` from `./rename-biome`.
  - Types:
    - `BiomeHabitabilityRef { i, name, previousHabitability }`.
    - `BiomeHabitabilityRuntime { find, apply }`.
  - `defaultBiomeHabitabilityRuntime.find`: findBiomeByRef →
    `{ i: res.id, name: res.name, previousHabitability:
    biomesData.habitability?.[res.k] ?? 0 }`.
  - `defaultBiomeHabitabilityRuntime.apply(id, value)`:
    - Refind via findBiomeByRef; throw if null or
      habitability array missing.
    - `biomesData.habitability[k] = value`.
    - Best-effort `getGlobal<() => void>("recalculatePopulation")?.()`
      wrapped in try/catch.
  - Tool schema: `biome` (int|string required), `habitability`
    (integer [0, 9999]).
  - Execute: validate biome ref (int ≥ 0 OR non-empty string);
    validate habitability is integer in range; find → 404; try
    apply; return `{ i, name, previousHabitability, habitability }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export `createSetBiomeHabitabilityTool`,
  `setBiomeHabitabilityTool`.
- [ ] `registry.register(setBiomeHabitabilityTool)` after
  `setBiomeColorTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-biome-habitability.test.ts`:
  - Runtime-injected:
    - Sets habitability by id.
    - Sets by case-insensitive name.
    - Rejects invalid biome refs (null, -1, 1.5, "").
    - Rejects invalid habitability (NaN, -1, 10000, 1.5, non-number).
    - Accepts boundary values 0 and 9999.
    - Error on unknown biome.
    - Surfaces runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.biomesData` with 4 biomes incl "removed"
      and a habitability array.
    - Stub `globalThis.recalculatePopulation` with vi.fn.
    - Apply 40 to biome 1 → data updated; recalculate called.
    - Apply to removed biome (id 2) → error; no mutation; no
      recalc.
    - When recalculatePopulation is undefined → tool still
      succeeds.

## Task 4 — README

- [ ] Row under `set_biome_color`:
  ```
  | `set_biome_habitability`| Set a biome's habitability (writes `biomesData.habitability[k]`, calls `recalculatePopulation()` — same as the Biomes Editor habitability input). Integer in [0, 9999]. 0 = uninhabitable (e.g. Marine, Glacier). Matches by id or name; removed biomes skipped. | "Make tundras uninhabitable — habitability 0", "Bump grassland habitability to 40" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-biome-habitability` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_biome_habitability tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: habitability input in the Biomes Editor; AI can't
  tune.
- Plan writes `biomesData.habitability[k]` and calls the same
  `recalculatePopulation()` global the editor calls. Cell
  populations refresh identically.
- Range [0, 9999] matches the editor's validation so tool values
  are interoperable with the UI's stored data.

## Verification that tests prove the use case

- Runtime-injected tests cover every validation and dispatch
  branch.
- Integration test asserts both the data mutation AND the
  recalculate-population call — the two side-effects the UI
  performs.
- Boundary + NaN / non-integer tests pin the range contract.
