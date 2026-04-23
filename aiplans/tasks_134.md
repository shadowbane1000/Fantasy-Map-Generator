# Tasks 134 — set_religion_center

## Baseline
- [x] `npx biome check src/` → 7 warnings / 1 info / 0 errors.
- [x] Record starting test count.

## Implement
- [ ] Write `src/ai/tools/set-religion-center.ts`:
  - `ReligionCenterRef` interface (`i`, `name`, `previousCenter`, `locked`).
  - `ReligionCenterRuntime` (`find`, `getCellCount`, `apply`).
  - `defaultReligionCenterRuntime` using shared helpers.
  - `createSetReligionCenterTool` validates ref, cell type, cell bound,
    "No religion" placeholder, locked, and noop.
  - Export `setReligionCenterTool`.
- [ ] Write `src/ai/tools/set-religion-center.test.ts`:
  - Unit tests for runtime-seam behaviours (id, name, noop, locked,
    "No religion" placeholder, out-of-range cell, invalid cell type,
    runtime error).
  - `defaultRuntime` integration block using globalThis pack fixture.

## Wire up
- [ ] `src/ai/index.ts` — import, export, register the tool.
- [ ] `README_AI.md` — add row near `set_religion_culture` etc.

## Verify
- [ ] `npm run build` → green.
- [ ] `npm test` → all pass (baseline + new tests).
- [ ] `npx biome check src/` → matches baseline.

## Commit
- [ ] `git add` the specific files only, then commit with
  `feat(ai): add set_religion_center tool` + short body.
