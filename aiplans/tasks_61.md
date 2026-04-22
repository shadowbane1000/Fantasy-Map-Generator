# Tasks 61 — rename_biome AI tool

## Task 1 — findBiomeByRef helper

- [ ] In `src/ai/tools/rename-biome.ts`, export
  `findBiomeByRef(biomesData, ref): { k, id, name } | null`:
  - null if biomesData/i/name arrays missing.
  - Numeric ref: find first k where biomesData.i[k] === ref, skip
    k where biomesData.name[k] === "removed", return { k, id: ref,
    name: biomesData.name[k] }.
  - String ref: trim+lowercase; iterate; skip "removed"; match
    `biomesData.name[k]?.toLowerCase() === needle`. Return
    { k, id: biomesData.i[k], name: biomesData.name[k] }.

## Task 2 — Implement tool

- [ ] Types:
  - `BiomeRenameRef { i, name }`.
  - `BiomeRenameRuntime { find(ref): BiomeRenameRef | null;
    rename(i: number, name: string): void }`.
- [ ] `defaultBiomeRenameRuntime`:
  - `find`: findBiomeByRef → { i: res.id, name: res.name }.
  - `rename(i, name)`: refind by numeric id; throw if null; set
    `biomesData.name[k] = name`.
- [ ] Tool schema: `biome` (int|string required), `name` (string
  required).
- [ ] Execute:
  - Validate `biome`: integer >= 0 OR non-empty string.
  - Validate `name`: non-empty string.
  - Refuse rename-to "removed" (case-sensitive exact match).
  - `runtime.find(ref)` → 404 error.
  - Try/catch `runtime.rename(current.i, newName)`.
  - Return `{ i, previousName, name }`.

## Task 3 — Register

- [ ] Import in `src/ai/index.ts`, barrel re-export (incl
  `findBiomeByRef`), `registry.register(renameBiomeTool)`.

## Task 4 — Tests

- [ ] `src/ai/tools/rename-biome.test.ts`:
  - Runtime-injected:
    - Rename by numeric id.
    - Rename by case-insensitive name.
    - Trim name.
    - Refuse rename-to "removed".
    - Error on unknown ref.
    - Reject invalid biome (null, -1, 1.5, "").
    - Reject invalid name (null, "", "   ", 42).
    - Surface runtime failures.
  - `findBiomeByRef`:
    - null biomesData → null.
    - Match by id including 0 (Marine).
    - Skip "removed" slots for both id and name lookups.
    - Name match case-insensitive + whitespace trim.
  - Default-runtime integration:
    - Stub `globalThis.biomesData` with 3 biomes.
    - Rename by id → `biomesData.name[k]` updated.
    - Rename by name → right slot updated.
    - Rename of removed biome → error.

## Task 5 — README

- [ ] Row under `list_biomes`:
  ```
  | `rename_biome`          | Rename a biome (writes `biomesData.name[k]` — same as the Biomes Editor name field). Matches by numeric biome id (0 = Marine) or case-insensitive current name. Biomes that have been removed (name slot = "removed") are hidden from lookups and can't be renamed. Rejects rename-to "removed" (reserved sentinel). | "Rename Hot desert to Scorched Waste", "Rename biome 5 to 'Mage-touched Forest'" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/rename-biome` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add rename_biome tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Tasks 1, 2.
- Plan step 2 → Task 3.
- Plan step 3 → Task 4.
- Plan step 4 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Biomes Editor lets you rename; AI can't.
- Plan writes the same `biomesData.name[k]` the editor writes.
- Removal sentinel respected: removed biomes neither resolve in
  `find()` nor get overwritten by `rename()`, and can't be set as
  the new name. This preserves the UI's convention.

## Verification that tests prove the use case

- Runtime-injected tests exercise every validation + dispatch branch.
- `findBiomeByRef` unit tests specifically cover the Marine-at-i=0
  case (not a placeholder, unlike state 0) so the tool is usable
  across the full id range.
- Integration test confirms live mutation.
