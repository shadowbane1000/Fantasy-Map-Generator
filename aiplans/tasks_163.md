# Tasks — Plan 163 (`invert_heightmap`)

1. [x] Baseline — read `modify-heightmap.ts`, `smooth-heightmap.ts`, their
       tests, `heightmap-generator.ts` (invert signature at line 531),
       `heightmap-editor.js` (Invert UI select at 947-959 and execution at
       1089), `src/ai/index.ts`, `_shared/index.ts`. Confirmed canonical
       axis values are `"x" | "y" | "xy"`. Recorded baselines:
       7 warnings / 1 info / 0 errors; 2174 tests.

2. [ ] Create `src/ai/tools/invert-heightmap.ts` mirroring
       `modify-heightmap.ts`:
   - `InvertHeightmapRuntime` interface — `invert(count, axes) =>
     {cellsChanged}`.
   - `defaultInvertHeightmapRuntime` impl: guard `window.grid` +
     `window.HeightmapGenerator`, snapshot heights, setGraph → invert →
     getHeights, reassign `grid.cells.h`, diff-count `cellsChanged`.
   - Input coercers:
     - `axes`: required; normalise `"x"|"X"` → `"x"`, `"y"|"Y"` → `"y"`,
       `"xy"|"yx"|"XY"|"YX"|"both"` → `"xy"`; reject anything else;
     - `count`: optional finite number in `[0, 1]`, default `1`.
   - `createInvertHeightmapTool(runtime?)` factory.
   - `invertHeightmapTool` default instance.
   - All `DEFAULT_*` / `AXES` constants kept module-internal; NOT re-exported.

3. [ ] Create `src/ai/tools/invert-heightmap.test.ts` mirroring
       `modify-heightmap.test.ts`:
   - Tool tests with fake runtime:
     - required `axes` — missing / null / undefined / empty / whitespace →
       error;
     - unknown axes string ("foo", "z", "xyz") → error;
     - axis aliases ("X", "Y", "XY", "YX", "both") normalise to canonical;
     - default `count` (1) applied when omitted;
     - non-finite / out-of-range `count` rejected;
     - explicit count + axes forwarded to runtime unchanged;
     - runtime errors surfaced;
     - tool name + input-schema shape asserted.
   - Integration block for `defaultInvertHeightmapRuntime` using
     `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`
     — covers missing grid, missing generator, happy path with cellsChanged
     diff, and null getHeights result.

4. [ ] Register `invertHeightmapTool` in `src/ai/index.ts` after
       `modifyHeightmapTool`. Re-export only
       `{ invertHeightmapTool, createInvertHeightmapTool }` — NOT any
       `DEFAULT_*` constants.

5. [ ] Append a `| invert_heightmap | ... |` row to `README_AI.md` below the
       `modify_heightmap` row, matching wording / API-key reminder. Include
       examples covering all three canonical axis values.

6. [ ] Verify: `npm run build`, `npm test` (expect +~14 tests),
       `npm run lint` matches the 7/1/0 baseline.

7. [ ] Commit with `feat(ai): add invert_heightmap tool`, staging only the
       new / modified files.
