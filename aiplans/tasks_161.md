# Tasks — Plan 161 (`modify_heightmap`)

1. [x] Baseline — read `smooth-heightmap.ts`, `add-hill.ts`, their tests,
       `heightmap-generator.ts` (modify signature at line 486),
       `heightmap-editor.js` (rescaleWithCondition wrapper at line 768),
       `src/ai/index.ts`, `_shared/index.ts`. Record lint/test baselines
       (7 warnings / 1 info / 0 errors; 2140 tests).

2. [ ] Create `src/ai/tools/modify-heightmap.ts` mirroring `smooth-heightmap.ts`:
   - `ModifyHeightmapRuntime` interface — `modify(range, add, mult, power)
     => {cellsChanged}`.
   - `defaultModifyHeightmapRuntime` impl: guard `window.grid` +
     `window.HeightmapGenerator`, snapshot heights, setGraph → modify →
     getHeights, reassign `grid.cells.h`, diff-count `cellsChanged`.
   - Input coercers:
     - `range`: required, number → String(n) or non-empty trimmed string;
     - `add`: optional number, default 0, finite;
     - `mult`: optional number, default 1, finite;
     - `power`: optional number, default undefined, finite when provided.
   - Identity check: reject when add=0 && mult=1 &&
     (power === undefined || power === 0 || power === 1).
   - `createModifyHeightmapTool(runtime?)` factory.
   - `modifyHeightmapTool` default instance.
   - All `DEFAULT_*` constants kept module-internal; NOT re-exported.

3. [ ] Create `src/ai/tools/modify-heightmap.test.ts` mirroring
       `smooth-heightmap.test.ts`:
   - Tool tests with fake runtime:
     - required `range` — missing / null / undefined / empty / whitespace →
       error;
     - numeric `range` coerced to string;
     - defaults (`add: 0, mult: 1, power: undefined`) when omitted;
     - identity rejection (no-op call);
     - non-finite `add` / `mult` / `power` rejected;
     - explicit args forwarded to runtime unchanged;
     - runtime errors surfaced;
     - tool name + input-schema shape asserted.
   - Integration block for `defaultModifyHeightmapRuntime` using
     `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`
     — covers missing grid, missing generator, happy path with cellsChanged
     diff, and null getHeights result.

4. [ ] Register `modifyHeightmapTool` in `src/ai/index.ts` after
       `addTroughTool` (line ~1022). Re-export only
       `{ modifyHeightmapTool, createModifyHeightmapTool }` — NOT any
       `DEFAULT_*` constants.

5. [ ] Append a `| modify_heightmap | ... |` row to `README_AI.md` below the
       `add_trough` row, matching wording / API-key reminder. Include examples
       covering all three ops (add / multiply / power).

6. [ ] Verify: `npm run build`, `npm test` (expect ~+13 tests), `npm run lint`
       matches the 7/1/0 baseline.

7. [ ] Commit with `feat(ai): add modify_heightmap tool`, staging only the new /
       modified files.
