# Tasks — Plan 177 (`get_cell_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 188 files / 2437 tests. Record.
- [x] Read reference files: `get-map-info{.ts,.test.ts}`, `list-burgs.ts`,
  `_shared/index.ts`, `_shared/results.ts`, `_shared/globals.ts`,
  `src/types/PackedGraph.ts`, and `public/modules/ui/general.js:260`
  (`updateCellInfo`).
- [ ] Write `src/ai/tools/get-cell-info.ts` with:
  - `CellInfo` interface (all resolved fields).
  - `readCellFromState(pack, grid, biomesData, cell)` pure helper returning
    `CellInfo | "not-ready" | "out-of-bounds"`.
  - `CellInfoRuntime` + `defaultCellInfoRuntime` reading `globalThis.pack`,
    `globalThis.grid`, `globalThis.biomesData`.
  - `createGetCellInfoTool(runtime)` and exported `getCellInfoTool`.
  - Tool schema: `cell` (integer, required); description references
    `pack.cells.*` fields.
- [ ] Write `src/ai/tools/get-cell-info.test.ts`:
  - Seam-block tests (fake pack / grid / biomesData) covering 12 cases from
    the plan.
  - `defaultCellInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: … })` writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a single
  `registry.register(getCellInfoTool);` next to `getMapInfoTool`.
- [ ] Add a README_AI.md row mirroring `get_map_info`'s shape — description
  with API key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of new
  test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_cell_info tool` staging only the plan,
  tasks, tool file, test file, index.ts, and README_AI.md.
