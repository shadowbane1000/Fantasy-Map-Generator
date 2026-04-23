# Tasks 132 — set_culture_center

## Baseline
- [x] `npx biome check src/` → 7 warnings / 1 info / 0 errors.
- [x] Record starting test count.

## Implement
- [ ] Write `src/ai/tools/set-culture-center.ts`:
  - `CultureCenterRef` interface (`i`, `name`, `previousCenter`, `locked`).
  - `CultureCenterRuntime` (`find`, `getCellCount`, `apply`).
  - `defaultCultureCenterRuntime` using shared helpers.
  - `createSetCultureCenterTool` validates ref, cell type, cell bound,
    Wildlands, locked, and noop.
  - Export `setCultureCenterTool`.
- [ ] Write `src/ai/tools/set-culture-center.test.ts`:
  - Unit tests for runtime-seam behaviours (id, name, noop, locked,
    wildlands, out-of-range cell, invalid cell type, runtime error).
  - `defaultRuntime` integration block using globalThis pack fixture.

## Wire up
- [ ] `src/ai/index.ts` — import, export, register the tool.
- [ ] `README_AI.md` — add row near `set_culture_color` etc.

## Verify
- [ ] `npm run build` → green.
- [ ] `npm test` → all pass (baseline + new tests).
- [ ] `npx biome check src/` → matches baseline.

## Commit
- [ ] `git add` the specific files only, then commit with
  `feat(ai): add set_culture_center tool` + short body.
