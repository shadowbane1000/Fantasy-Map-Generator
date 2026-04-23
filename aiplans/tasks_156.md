# Tasks 156 — `add_hill`

- [ ] T1 Create `src/ai/tools/add-hill.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`; `Tool`, `ToolResult` from `./index`.
  - Defaults: `DEFAULT_RANGE_X = "20-80"`, `DEFAULT_RANGE_Y = "20-80"`.
  - `AddHillRuntime` interface: `{ addHill(count, height, rangeX, rangeY): { cellsChanged: number } }`.
  - `HeightmapGeneratorLike` + `GridLike` interfaces (same shape as smooth-heightmap: setGraph / addHill / getHeights; grid.cells.h).
  - `defaultAddHillRuntime.addHill(count, height, rangeX, rangeY)`:
    - getGlobal("grid") — throw `/grid/` if missing.
    - getGlobal("HeightmapGenerator") — throw `/HeightmapGenerator/` if missing / any of setGraph/addHill/getHeights not a function.
    - snapshot `before = Array.from(grid.cells.h)`.
    - `heightmap.setGraph(grid)` → `heightmap.addHill(count, height, rangeX, rangeY)`.
    - `next = heightmap.getHeights()`; throw `/getHeights/` on null/undefined.
    - `grid.cells.h = next`.
    - diff `cellsChanged`.
  - Helper `coerceRangeArg(name, raw, { allowNumber })`:
    - For `count` / `height` (allowNumber = true): accept finite number → `String(raw)`; accept non-empty trimmed string → raw; else error string.
    - For `rangeX` / `rangeY` (allowNumber = false, default fallback): undefined/null → fallback; non-empty trimmed string → raw; else error string.
  - `createAddHillTool(runtime?)`:
    - `name: "add_hill"`.
    - description: cite parallel to `smooth_heightmap`, the editor line `HeightmapGenerator.addHill(count, height, x, y)`, range-string format (`"1-3"`, `"50"`, `"30-60"`, `"-5-10"`), default `rangeX`/`rangeY` of `"20-80"`, no auto-regen downstream (run `regenerate_map`/`regenerate_domain`), returns `{count, height, rangeX, rangeY, cellsChanged}`.
    - `input_schema`: object with `count` (number OR string), `height` (number OR string), `rangeX` (string), `rangeY` (string); `required: ["count", "height"]`.
    - execute:
      1. Coerce `count` (allowNumber) → error if invalid.
      2. Coerce `height` (allowNumber) → error if invalid.
      3. Coerce `rangeX` (string only, default `"20-80"`) → error if invalid.
      4. Coerce `rangeY` (string only, default `"20-80"`) → error if invalid.
      5. try runtime.addHill(...) catch → errorResult.
      6. Return `okResult({ count, height, rangeX, rangeY, cellsChanged })`.
  - Export `addHillTool = createAddHillTool()`.

- [ ] T2 Create `src/ai/tools/add-hill.test.ts`:
  - Injected-runtime block (`makeRuntime` factory returning `{ runtime, addHill: vi.fn }`, `cellsChanged` default 12):
    1. `{ count: "1-3", height: "30-60" }` → addHill called with `("1-3","30-60","20-80","20-80")`; result has `ok:true, count:"1-3", height:"30-60", rangeX:"20-80", rangeY:"20-80", cellsChanged:12`.
    2. Numeric count/height coerced to string — `{ count: 2, height: 50 }` → `("2","50","20-80","20-80")`.
    3. Explicit ranges — `{ count:"1", height:"40", rangeX:"40-60", rangeY:"10-90" }` forwarded verbatim.
    4. Missing `count` → errorResult, addHill not called. (undefined and null cases)
    5. Missing `height` → errorResult.
    6. Invalid `count`: NaN, Infinity, true, {}, [] → errorResult each; addHill not called.
    7. Invalid `height`: same set.
    8. Empty / whitespace string `count` and `height` → errorResult.
    9. Numeric `rangeX` (`rangeX: 30`) → errorResult; same for `rangeY`.
    10. Empty-string `rangeX` / `rangeY` → errorResult.
    11. Runtime throws → errorResult with error message surfaced.
    12. Exported tool name `add_hill`, `input_schema.required` equals `["count","height"]`.
  - `defaultAddHillRuntime (integration)` block (mirrors smooth-heightmap test structure):
    - afterEach restores original `grid` / `HeightmapGenerator` on `globalThis`.
    - Missing `grid` → throws `/grid/`.
    - Missing `HeightmapGenerator` → throws `/HeightmapGenerator/`.
    - Happy path: records call order `setGraph`, `addHill`, `getHeights`; latestGraph === grid; latestArgs === `["2", "40", "25-75", "10-90"]`; grid.cells.h replaced; `cellsChanged` equals diff count.
    - `getHeights()` returns null → throws `/getHeights/`.
  - Use `as unknown as { ... }` casts for globalThis assignments.

- [ ] T3 Register in `src/ai/index.ts`:
  - Add `import { addHillTool } from "./tools/add-hill";` immediately after the `smoothHeightmapTool` import (alphabetical is preserved since `add-hill` < `smooth-heightmap`; actually we add it next to other add-* imports at the top since they're alphabetised). Inspect the existing import ordering — the existing block starts with `addBiomeTool`, `addBurgTool`, etc. Insert `addHillTool` alphabetically after `addCultureTool`.
  - Add `createAddHillTool` / `addHillTool` export block near the other add-* exports (after `addCultureTool` export block).
  - Add `registry.register(addHillTool);` immediately after `registry.register(smoothHeightmapTool);` (group the heightmap-editor tools together).

- [ ] T4 Add a `README_AI.md` row immediately after the existing `smooth_heightmap` row:
  - Cites `HeightmapGenerator.addHill(count, height, rangeX, rangeY)` and the copy-back to `grid.cells.h`.
  - Explains range-string format (`"1-3"`, `"50"`, `"30-60"`).
  - Lists required / optional params with defaults.
  - Notes downstream layers stay stale — run `regenerate_map` / `regenerate_domain` after.
  - Shared "Requires an Anthropic API key (see 'Getting an API key' below)" callout.
  - Example prompts column: "Add 3 hills of height 50", "Add a tall hill on the east side — rangeX: 70-95".

- [ ] T5 Verify:
  - Lint baseline before: `npm run lint 2>&1 | tail -5` — 7 warnings / 1 info / 0 errors.
  - After: `npm run build` succeeds, `npm test` all pass, `npm run lint` matches baseline.

- [ ] T6 Commit with `feat(ai): add add_hill tool` staging only the six touched files (add-hill.ts, add-hill.test.ts, src/ai/index.ts, README_AI.md, aiplans/plan_156.md, aiplans/tasks_156.md).
