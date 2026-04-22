# Tasks 60 — list_biomes AI tool

## Task 1 — Implement helper + tool

- [ ] `src/ai/tools/list-biomes.ts`:
  - Imports: `createPaginatedListTool`, `getGlobal`.
  - `BiomeSummary { i, name, color, habitability, iconsDensity,
    cost, cells, area, rural, urban, population }`.
  - `BiomesData` interface (parallel arrays, all fields present
    except cells/area/rural/urban which are optional).
  - `readBiomesFromPack(biomesData, populationRate)`:
    - null if `biomesData?.i` not an array.
    - Map each index k → summary, defaulting missing fields.
    - population = Math.max(0, Math.round((rural+urban) * rate)).
  - `BiomesRuntime { readBiomes(): BiomeSummary[] | null }`.
  - `defaultBiomesRuntime.readBiomes`: reads
    `globalThis.biomesData` + `globalThis.populationRate`.
  - Factory via `createPaginatedListTool<BiomeSummary>`:
    - `name: "list_biomes"`.
    - Description: mentions biomesData origin + which fields
      require the Biomes Editor to have opened to populate.
    - Input schema: just `limit`, `offset`.
    - `collectionKey: "biomes"`.
    - `notReadyError`: "Biomes data is not available yet."

## Task 2 — Register

- [ ] Import `listBiomesTool`, barrel re-export (+
  `readBiomesFromPack`), register near other list tools.

## Task 3 — Tests

- [ ] `src/ai/tools/list-biomes.test.ts`:
  - Returns 13 default biomes.
  - `name` and `color` match input.
  - Missing cells/area/rural/urban default to 0.
  - When cells/etc present, summary carries them through.
  - population uses populationRate scaling.
  - Pagination.
  - `readBiomesFromPack(undefined)` → null.
  - `readBiomesFromPack({ i: [] })` → empty array.
  - Default-runtime integration: set globalThis.biomesData to a
    small BiomesData + populationRate; call tool; verify output.

## Task 4 — README

- [ ] New row near `list_rivers`:
  ```
  | `list_biomes`           | List biomes on the map (13 default + any user-added). Each entry reports id, name, color, habitability, icon density, movement cost, and — after the Biomes Editor has been opened — cells, area, rural, urban, and scaled population. Paginated. | "List the biomes", "Which biome is most habitable?", "How big is the Temperate Deciduous Forest?" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/list-biomes` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add list_biomes tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Biomes Editor shows biomes; AI has no tool.
- Plan reads the same `biomesData` object the editor reads,
  flattening the parallel arrays into per-biome summaries.
- Missing per-biome stats (cells/area/rural/urban) are defaulted,
  so the tool works whether or not the editor has been opened —
  the generator-time data (name, color, habitability, cost) is
  always present.

## Verification that tests prove the use case

- Unit test for `readBiomesFromPack` covers null / empty / full.
- Integration test wires to live globals.
- Population scaling test ensures the rural+urban → population
  multiplication matches `list_states`'s / `list_cultures`'s
  existing conventions.
