# Tasks 154 — `smooth_heightmap`

## Implementation

- [ ] Create `src/ai/tools/smooth-heightmap.ts`:
  - [ ] Export constants: `DEFAULT_SMOOTH_FACTOR = 4`, `DEFAULT_SMOOTH_ADD = 1.5`,
        `SMOOTH_FACTOR_MIN = 1`, `SMOOTH_FACTOR_MAX = 100`,
        `SMOOTH_ADD_MIN = -100`, `SMOOTH_ADD_MAX = 100`.
  - [ ] Export `SmoothHeightmapRuntime` interface: `smooth(factor, add) =>
        { cellsChanged: number }`.
  - [ ] Implement `defaultSmoothHeightmapRuntime.smooth(factor, add)`:
        read `window.grid` + `window.HeightmapGenerator` via `getGlobal`,
        throw if missing, snapshot `grid.cells.h`, call `setGraph(grid)`,
        `smooth(factor, add)`, set `grid.cells.h = getHeights()`, compute
        `cellsChanged`.
  - [ ] Implement `createSmoothHeightmapTool(runtime?)` returning a
        `Tool` with name `smooth_heightmap`.
  - [ ] Validate `factor` (finite number, `>= 1`, `<= 100`, default 4).
  - [ ] Validate `add` (finite number, `>= -100`, `<= 100`, default 1.5).
  - [ ] Return `okResult({ factor, add, cellsChanged })`.
  - [ ] Export `smoothHeightmapTool = createSmoothHeightmapTool()`.

## Tests — `src/ai/tools/smooth-heightmap.test.ts`

- [ ] Tool behaviour:
  - [ ] Uses defaults when no args given (factor=4, add=1.5).
  - [ ] Forwards explicit `factor` and `add`.
  - [ ] Result body includes `ok`, `factor`, `add`, `cellsChanged`.
  - [ ] Rejects non-numeric `factor` / `add`.
  - [ ] Rejects `factor < 1` and `factor > 100`.
  - [ ] Rejects `add < -100` and `add > 100`.
  - [ ] Surfaces runtime errors (`Error` thrown from `smooth`).
- [ ] Integration with `defaultSmoothHeightmapRuntime`:
  - [ ] Mock `window.grid` + `window.HeightmapGenerator` via
        `as unknown as { ... }` casts.
  - [ ] Assert `setGraph`, `smooth`, `getHeights` are called in order.
  - [ ] Assert `grid.cells.h` is replaced with `getHeights()`'s return.
  - [ ] Assert `cellsChanged` reflects the number of differing cells.
  - [ ] Restore globals in `afterEach`.

## Registry / exports

- [ ] Add import + `registry.register(smoothHeightmapTool)` in
      `src/ai/index.ts`.
- [ ] Re-export `createSmoothHeightmapTool`, `smoothHeightmapTool`,
      `DEFAULT_SMOOTH_FACTOR`, `DEFAULT_SMOOTH_ADD` from `src/ai/index.ts`.

## Docs

- [ ] Add README_AI row for `smooth_heightmap` after
      `set_heightmap_options`. Mention: `factor` default 4 (lower = more
      smoothing, 1 = full smooth); `add` default 1.5 (offset applied after
      averaging); does NOT auto-regenerate — call `regenerate_map` after to
      refresh rivers / biomes / etc.

## Verify

- [ ] `npm run build` — succeeds.
- [ ] `npm test` — all pass; test count increases.
- [ ] `npx biome check src/` — 7 warnings / 1 info / 0 errors (baseline).

## Commit

- [ ] Stage only the specific files (plan, tasks, tool, test, index, README).
- [ ] Commit: `feat(ai): add smooth_heightmap tool`.
