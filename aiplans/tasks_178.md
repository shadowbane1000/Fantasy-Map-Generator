# Tasks — Plan 178 (`find_cell_at_coords`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 190 files / 2475 tests. Record.
- [x] Read reference files: `get-cell-info{.ts,.test.ts}`, `focus-on-map.ts`,
  `_shared/globals.ts`, `_shared/results.ts`, `_shared/index.ts`,
  `src/utils/index.ts:197` (window.findCell), and
  `src/utils/graphUtils.ts:282` (`findClosestCell`).
- [ ] Write `src/ai/tools/find-cell-at-coords.ts` with:
  - `FindCellRuntime` interface with `findCell(x, y)` returning
    `number | null | "not-ready"`.
  - `defaultFindCellRuntime` reading `globalThis.findCell` first, falling
    back to a manual `pack.cells.p` nearest-neighbour scan.
  - `createFindCellAtCoordsTool(runtime)` and exported
    `findCellAtCoordsTool`.
  - Schema: `x` (number, required), `y` (number, required). Description
    explains SVG pixel coordinate space and references `window.findCell`.
- [ ] Write `src/ai/tools/find-cell-at-coords.test.ts`:
  - Seam-block tests (pure runtime) covering all 11 cases from the plan.
  - `defaultFindCellRuntime` integration block using
    `(globalThis as unknown as { pack?: …; findCell?: … })` writes +
    `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a
  single `registry.register(findCellAtCoordsTool);` next to
  `getCellInfoTool`.
- [ ] Add a README_AI.md row near `get_cell_info` mirroring its shape —
  description with API key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of
  new test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add find_cell_at_coords tool` staging only the
  plan, tasks, tool file, test file, `src/ai/index.ts`, and README_AI.md.
