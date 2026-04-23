# Tasks 157 — `add_range`

## Implementation

- [ ] Create `src/ai/tools/add-range.ts`:
  - [ ] Export constants: `DEFAULT_RANGE_X = "20-80"`,
        `DEFAULT_RANGE_Y = "20-80"`.
  - [ ] Export `AddRangeRuntime` interface:
        `addRange(count, height, rangeX, rangeY): void`.
  - [ ] Implement `defaultAddRangeRuntime.addRange(...)`: read `window.grid`
        + `window.HeightmapGenerator` via `getGlobal`, throw if missing, call
        `setGraph(grid)`, `addRange(count, height, rangeX, rangeY)`, set
        `grid.cells.h = getHeights()`, throw if `getHeights()` returned
        null/undefined.
  - [ ] Implement `createAddRangeTool(runtime?)` returning a `Tool` with
        name `add_range`.
  - [ ] Validate `count` (required; number or non-empty string; numbers
        finite).
  - [ ] Validate `height` (required; number or non-empty string; numbers
        finite).
  - [ ] Validate `rangeX` (optional; non-empty string; default `"20-80"`).
  - [ ] Validate `rangeY` (optional; non-empty string; default `"20-80"`).
  - [ ] Coerce number `count` / `height` to strings before forwarding.
  - [ ] Return `okResult({ count, height, rangeX, rangeY })`.
  - [ ] Export `addRangeTool = createAddRangeTool()`.

## Tests — `src/ai/tools/add-range.test.ts`

- [ ] Tool behaviour:
  - [ ] Accepts numeric `count` / `height`, coerces to strings.
  - [ ] Accepts string range `count` / `height` verbatim.
  - [ ] Uses `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` when `rangeX` / `rangeY`
        are omitted.
  - [ ] Forwards explicit `rangeX` / `rangeY` strings.
  - [ ] Result body includes `ok`, `count`, `height`, `rangeX`, `rangeY`.
  - [ ] Rejects missing `count`.
  - [ ] Rejects missing `height`.
  - [ ] Rejects non-finite numeric `count` / `height`.
  - [ ] Rejects non-string / empty `rangeX` / `rangeY`.
  - [ ] Surfaces runtime errors.
  - [ ] Exported `addRangeTool.name === "add_range"`, schema requires
        `["count", "height"]`.
- [ ] Integration with `defaultAddRangeRuntime`:
  - [ ] Mock `window.grid` + `window.HeightmapGenerator` via
        `as unknown as { ... }` casts.
  - [ ] Assert `setGraph`, `addRange`, `getHeights` are called in order.
  - [ ] Assert `addRange` receives the exact forwarded strings.
  - [ ] Assert `grid.cells.h` is replaced with `getHeights()`'s return.
  - [ ] Assert throws when `grid` is missing.
  - [ ] Assert throws when `HeightmapGenerator` is missing.
  - [ ] Assert throws when `getHeights()` returns null.
  - [ ] Restore globals in `afterEach`.

## Registry / exports

- [ ] Add import + `registry.register(addRangeTool)` in `src/ai/index.ts`
      near `smoothHeightmapTool`.
- [ ] Re-export `createAddRangeTool`, `addRangeTool`, `DEFAULT_RANGE_X`,
      `DEFAULT_RANGE_Y` from `src/ai/index.ts`.

## Docs

- [ ] Add README_AI row for `add_range` immediately after `smooth_heightmap`.
      Mention: required `count` / `height` (number or hyphen range like
      `"2-4"`); optional `rangeX` / `rangeY` percentage-ranges (default
      `"20-80"`); does NOT auto-regenerate — call `regenerate_map` after to
      refresh rivers / biomes / etc. Link to API-key section.

## Verify

- [ ] `npm run build` — succeeds.
- [ ] `npm test` — all pass; test count increases.
- [ ] `npm run lint` — 7 warnings / 1 info / 0 errors (baseline unchanged).

## Commit

- [ ] Stage only the specific files (plan, tasks, tool, test, index, README).
- [ ] Commit: `feat(ai): add add_range tool`.
