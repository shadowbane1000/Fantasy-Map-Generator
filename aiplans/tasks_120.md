# Tasks 120 — regenerate_all_burg_names AI tool

- [ ] Create `src/ai/tools/regenerate-all-burg-names.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPack, okResult, type RawBurg.
  - Import `BURG_NAME_MODES`, `resolveBurgNameMode`,
    type `BurgNameMode` from `./regenerate-burg-name`.
  - Local `BurgPack { burgs?: RawBurg[] }`.
  - Exports:
    - `RegenerateAllBurgNamesCounts { regenerated,
       skippedLocked, skippedRemoved }`.
    - `RegenerateAllBurgNamesRuntime { regenerate }`.
    - `defaultRegenerateAllBurgNamesRuntime.regenerate(
      mode)`:
      - Read pack.burgs; throw if missing.
      - Read Names module; throw if missing.
      - For mode=random: also require nameBases
        (throw if missing/empty).
      - Walk burgs:
        - Skip burg?.i === 0 or !burg.
        - Skip burg.removed → skippedRemoved++.
        - Skip burg.lock → skippedLocked++.
        - Generate name:
          - mode=culture: Names.getCulture(burg.culture).
          - mode=random: Names.getBase(rand index).
        - If name non-empty: write burg.name; best-effort
          update #burgLabel{i} text; regenerated++.
      - Return counts.
    - `createRegenerateAllBurgNamesTool(runtime?)` and
      `regenerateAllBurgNamesTool`.
  - Tool name: `regenerate_all_burg_names`.
  - Description: references Burgs Overview "Regenerate
    names" button, skips locked + removed, optional
    random mode.
  - Schema: mode (string enum, optional, default
    culture).
  - Validation:
    - resolveBurgNameMode on provided mode if present.
  - Return payload: `{ mode, ...counts }`.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write `regenerate-all-burg-names.test.ts`:
  - Unit (stubbed runtime):
    - default mode
    - explicit random
    - rejects unknown mode
    - surfaces runtime errors
  - Integration:
    - stubs pack with:
      - { i: 0 } (skip, placeholder)
      - { i: 1, name: "A", culture: 1 }
      - { i: 2, name: "B", culture: 2, lock: true }
      - { i: 3, name: "C", culture: 3, removed: true }
      - { i: 4, name: "D", culture: 4 }
    - stubs Names (getCulture/getBase), nameBases,
      document.
    - culture mode: Names.getCulture called 2 times
      (burgs 1, 4); counts = { regenerated: 2,
      skippedLocked: 1, skippedRemoved: 1 }.
    - random mode: Names.getBase called 2 times.
    - label texts updated.
    - errors when Names missing.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- File + registration = "callable".
- Skips locked + removed per plan.
- Counts exposed.

## Verification: plan → use case

- UI iterates burgs and writes name + updates label for
  each unlocked, non-removed burg. Tool does the same.

## Verification: tests → regressions

- If locked skip dropped, skippedLocked assertion
  fails.
- If removed skip dropped, skippedRemoved assertion
  fails.
- If regenerated count wrong, that assertion fails.
- If random mode missing nameBases wasn't caught, the
  missing-nameBases test fails.
