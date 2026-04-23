# Tasks — Plan 159 (`add_trough`)

1. [x] Baseline — read `add-range.ts`, `add-hill.ts`, their tests,
       `heightmap-generator.ts` (addTrough signature), `heightmap-editor.js`
       (Trough handler), `src/ai/index.ts`, `_shared/index.ts`. Record
       lint/test baselines (7 warnings / 1 info / 0 errors; 2105 tests).

2. [ ] Create `src/ai/tools/add-trough.ts` mirroring `add-hill.ts`:
   - `AddTroughRuntime` interface, `defaultAddTroughRuntime` impl (reads
     `window.grid` + `window.HeightmapGenerator`, calls setGraph →
     addTrough → getHeights, writes back `grid.cells.h`, returns
     `{cellsChanged}`).
   - Input coercers (required count/height; optional string ranges).
   - `createAddTroughTool(runtime?)` factory.
   - `addTroughTool` default instance.
   - Internal `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` = `"20-80"` — do NOT
     re-export (add-hill already re-exports them).

3. [ ] Create `src/ai/tools/add-trough.test.ts` mirroring `add-hill.test.ts`:
   - Tool tests with a fake runtime: range-string pass-through, numeric
     coercion, explicit ranges, defaults when null/undefined, missing /
     non-scalar / non-finite count & height rejected, numeric range args
     rejected, empty-string range args rejected, runtime errors surfaced,
     schema shape asserted.
   - Integration block for `defaultAddTroughRuntime` using
     `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`
     — covers missing grid, missing generator, happy path with cellsChanged
     diff, and null getHeights result.

4. [ ] Register `addTroughTool` in `src/ai/index.ts` after `addRangeTool`.
   Re-export only `{ addTroughTool, createAddTroughTool }` — NOT
   `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` (would collide with add-hill's
   exports).

5. [ ] Append a `| add_trough | ... |` row to `README_AI.md` below the
       `add_range` row, matching wording / API-key reminder.

6. [ ] Verify: `npm run build`, `npm test` (expect +N tests), `npm run lint`
       matches the 7/1/0 baseline.

7. [ ] Commit with `feat(ai): add add_trough tool`, staging only the new /
       modified files.
