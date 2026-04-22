# Tasks 64 — remove_biome AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/remove-biome.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult`;
    `findBiomeByRef` from `./rename-biome`.
  - Export `DEFAULT_BIOME_COUNT = 13`.
  - Types:
    - `RemoveBiomeRef { i, name }`.
    - `BiomeRemovalRuntime { find, remove }`.
  - `defaultBiomeRemovalRuntime.find`: findBiomeByRef → { i: res.id,
    name: res.name }.
  - `defaultBiomeRemovalRuntime.remove(id)`:
    - `biomesData = getGlobal<BiomesDataLike>("biomesData")`.
    - `res = findBiomeByRef(biomesData, id)`; throw if null.
    - Throw if `id < DEFAULT_BIOME_COUNT`.
    - `biomesData.name[res.k] = "removed"`.
  - Tool schema: `biome` (int|string required).
  - Execute:
    - Validate biome ref (int ≥ 0 OR non-empty string).
    - `runtime.find` → 404.
    - If `current.i < DEFAULT_BIOME_COUNT`, reject with:
      "Cannot remove default biome {i} ({name}); only custom biomes
      (id >= 13) can be removed."
    - Try `runtime.remove(current.i)`.
    - Return `{ i, name }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export `createRemoveBiomeTool`, `removeBiomeTool`,
  `DEFAULT_BIOME_COUNT`.
- [ ] `registry.register(removeBiomeTool)` after
  `setBiomeHabitabilityTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/remove-biome.test.ts`:
  - Runtime-injected:
    - Remove custom biome by id.
    - Remove custom biome by case-insensitive name.
    - Reject invalid refs.
    - Error on unknown biome.
    - Reject removal of default biome (id < 13) — each of a few
      sample ids (0, 5, 12).
    - Surface runtime failures.
  - Default-runtime integration:
    - biomesData with 15 biomes (13 defaults + 2 customs + one
      custom already "removed"):
      - ids [0..14], names [13 defaults] + ["Custom1", "Custom2",
        "removed"... wait length 15 uses ids 0..14, not 15 entries].
      - Actually: `i: [0..14]` (15 entries); `name:
        [...defaults, "Custom1", "removed"]`.
    - Stub globalThis.biomesData.
    - Remove id 13 → name[13] = "removed".
    - Remove by "custom1" → same.
    - Removal of id 5 (default) → error; name[5] unchanged.
    - Removal of already-removed id 14 → error (findBiomeByRef
      skips).

## Task 4 — README

- [ ] Row under `set_biome_habitability`:
  ```
  | `remove_biome`          | Remove a **custom** biome (id >= 13) by setting `biomesData.name[k]` to the "removed" sentinel — same side-effect as the Biomes Editor trash icon. Default biomes (ids 0–12) are protected because cells may still reference them. Matches by id or case-insensitive current name. | "Remove the Magic Grove custom biome", "Delete biome 14" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/remove-biome` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add remove_biome tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: custom-biome removal, UI-only.
- Plan mirrors the UI's sentinel-write approach and reuses
  findBiomeByRef so the "already removed" slots aren't re-resolved
  (preventing accidental double-removes).
- Default-biome protection goes beyond the UI (which just hides the
  trash icon) — necessary because an AI could otherwise set a
  default to "removed" and leave millions of cells orphaned.

## Verification that tests prove the use case

- Default-biome rejection tested at multiple ids to guard against
  off-by-one.
- findBiomeByRef already has unit tests covering "removed"-skip
  semantics; this test focuses on the add-sentinel path.
- Integration test proves the live mutation happens on
  `globalThis.biomesData.name[k]` exactly.
