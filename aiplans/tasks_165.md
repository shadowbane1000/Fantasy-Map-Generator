# Tasks 165 — `clear_heightmap`

- [ ] Confirm cwd is the plan-165 worktree.
- [ ] Write `src/ai/tools/clear-heightmap.ts`:
  - `ClearHeightmapRuntime` seam (`clear(height) => {cellsCleared}`).
  - `defaultClearHeightmapRuntime` — guards `window.grid.cells.h`, writes
    `height` into every index, returns diff count.
  - `validateHeight` helper: finite number in `[0, 100]`, default 0.
  - `createClearHeightmapTool(runtime)` — name `clear_heightmap`, no required
    params, description references the "Start from scratch" / blank-ocean UI
    behaviour and the API-key setup, returns `{ok, height, cellsCleared}`.
  - `clearHeightmapTool = createClearHeightmapTool()`.
- [ ] Write `src/ai/tools/clear-heightmap.test.ts`:
  - Tool-level suite with fake runtime — default height, explicit height,
    null/undefined default behaviour, non-numeric rejection, out-of-range
    rejection, runtime error surfacing, export-shape assertions.
  - `defaultClearHeightmapRuntime` integration block with
    `globalThis as unknown as { grid?: unknown }` — missing grid, happy path
    with cellsCleared diff, custom `height` overrides, idempotent re-run
    returns `cellsCleared = 0`.
- [ ] Register in `src/ai/index.ts`:
  - Import `clearHeightmapTool` near `invertHeightmapTool`.
  - Re-export `clearHeightmapTool` + `createClearHeightmapTool` only (NOT any
    `DEFAULT_*` constant).
  - Register after `invertHeightmapTool` in `buildDefaultRegistry()`.
- [ ] Add a `README_AI.md` row under `invert_heightmap` with description +
      usage examples, noting the API-key requirement.
- [ ] `npm run build` — must pass cleanly.
- [ ] `npm test` — all green, +~11 new tests.
- [ ] `npm run lint` — exactly 7 warnings / 1 info / 0 errors.
- [ ] Commit: `feat(ai): add clear_heightmap tool` (+ 1-2 line body). Stage
      only the new/modified files.
- [ ] Report back.
