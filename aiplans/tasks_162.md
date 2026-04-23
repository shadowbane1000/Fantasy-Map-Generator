# Tasks — Plan 162 (`mask_heightmap`)

1. [x] Baseline — read `smooth-heightmap.ts`, `modify-heightmap.ts`,
       `add-strait.ts` and their tests, `heightmap-generator.ts` (mask
       signature at line 516 — `mask(power = 1)`), `heightmap-editor.js`
       (Mask button handler at line 1088, UI bounds `-10..10` at line 966),
       `src/ai/index.ts`, `_shared/index.ts`. Record lint / test baselines
       (7 warnings / 1 info / 0 errors; 2174 tests).

2. [ ] Create `src/ai/tools/mask-heightmap.ts` mirroring `smooth-heightmap.ts`:
   - `MaskHeightmapRuntime` interface — `mask(power: number)
     => {cellsChanged}`.
   - `defaultMaskHeightmapRuntime` impl: guard `window.grid` +
     `window.HeightmapGenerator`, snapshot heights, setGraph → mask →
     getHeights, reassign `grid.cells.h`, diff-count `cellsChanged`.
   - Input validation:
     - `power`: optional number, default `1`, must be finite, in `[-10, 10]`.
   - No identity rejection — every `power` value is a legitimate call.
   - `createMaskHeightmapTool(runtime?)` factory.
   - `maskHeightmapTool` default instance.
   - All `DEFAULT_*` / `MASK_POWER_*` constants kept module-internal; NOT
     re-exported from `src/ai/index.ts`.

3. [ ] Create `src/ai/tools/mask-heightmap.test.ts` mirroring
       `smooth-heightmap.test.ts`:
   - Tool tests with fake runtime:
     - default `power: 1` when called with no args / `{}` /
       `{ power: null }` / `{ power: undefined }`;
     - forwards explicit `power` unchanged (`2`, `-3`, `0`, `10`);
     - non-number / non-finite `power` rejected
       (`"1"`, `true`, `{}`, `NaN`, `±Infinity`);
     - out-of-range `power` rejected (`-11`, `11`, `1000`);
     - runtime errors surfaced;
     - tool name + input-schema shape asserted (no required keys).
   - Integration block for `defaultMaskHeightmapRuntime` using
     `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`
     — covers missing grid, missing generator, happy path with cellsChanged
     diff, and null `getHeights` result.

4. [ ] Register `maskHeightmapTool` in `src/ai/index.ts` after
       `modifyHeightmapTool`. Re-export only
       `{ maskHeightmapTool, createMaskHeightmapTool }` — NOT any
       `DEFAULT_*` / `MASK_POWER_*` constants.

5. [ ] Append a `| mask_heightmap | ... |` row to `README_AI.md` below the
       `modify_heightmap` row, matching wording / API-key reminder. Include
       examples covering default, softer mask, and inverted mask.

6. [ ] Verify: `npm run build`, `npm test` (expect ~+13 tests), `npm run lint`
       matches the 7/1/0 baseline.

7. [ ] Commit with `feat(ai): add mask_heightmap tool`, staging only the new /
       modified files.
