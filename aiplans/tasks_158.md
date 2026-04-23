# Tasks 158 — `add_pit`

- [ ] T1 Create `src/ai/tools/add-pit.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`; `Tool`, `ToolResult` from `./index`.
  - Internal (NON-exported) constants `DEFAULT_RANGE_X = "20-80"`, `DEFAULT_RANGE_Y = "20-80"` — exporting them would collide with the `add-hill` re-exports in `src/ai/index.ts`.
  - `AddPitRuntime` interface: `{ addPit(count, height, rangeX, rangeY): { cellsChanged: number } }`.
  - Local `HeightmapGeneratorLike` + `GridLike` interfaces (setGraph / addPit / getHeights; grid.cells.h).
  - `defaultAddPitRuntime.addPit(count, height, rangeX, rangeY)`:
    - getGlobal("grid") — throw `/grid/` if missing.
    - getGlobal("HeightmapGenerator") — throw `/HeightmapGenerator/` if missing / any of setGraph/addPit/getHeights not a function.
    - snapshot `before = Array.from(grid.cells.h)`.
    - `heightmap.setGraph(grid)` → `heightmap.addPit(count, height, rangeX, rangeY)`.
    - `next = heightmap.getHeights()`; throw `/getHeights/` on null/undefined.
    - `grid.cells.h = next`.
    - diff `cellsChanged`.
  - Helpers (parity with add-hill): `coerceRangeLikeArg(name, raw)` for count/height, `coerceStringRangeArg(name, raw, fallback)` for rangeX/rangeY.
  - `createAddPitTool(runtime?)`:
    - `name: "add_pit"`.
    - description: cite parallel to `add_hill`, the editor line `HeightmapGenerator.addPit(count, height, x, y)`, range-string format examples, default `rangeX` / `rangeY` of `"20-80"`, note that the generator rejection-samples to ensure the start cell is land (`h >= 20`) and silently no-ops if that fails, no auto-regen downstream (run `regenerate_map` / `regenerate_domain`), returns `{count, height, rangeX, rangeY, cellsChanged}`, include "Requires an Anthropic API key" callout.
    - `input_schema`: object with `count` (`["number", "string"]`), `height` (`["number", "string"]`), `rangeX` (string), `rangeY` (string); `required: ["count", "height"]`.
    - execute:
      1. Coerce `count` via `coerceRangeLikeArg` → error if invalid.
      2. Coerce `height` → error if invalid.
      3. Coerce `rangeX` via `coerceStringRangeArg` (default `"20-80"`) → error if invalid.
      4. Coerce `rangeY` → error if invalid.
      5. try runtime.addPit(...) catch → errorResult.
      6. Return `okResult({ count, height, rangeX, rangeY, cellsChanged })`.
  - Export `addPitTool = createAddPitTool()`.

- [ ] T2 Create `src/ai/tools/add-pit.test.ts`:
  - Injected-runtime block (`makeRuntime` returning `{ runtime, addPit: vi.fn }`, `cellsChanged` default 12):
    1. `{ count: "1-3", height: "30-60" }` → addPit called with `("1-3","30-60","20-80","20-80")`; result `ok:true, count:"1-3", height:"30-60", rangeX:"20-80", rangeY:"20-80", cellsChanged:12`.
    2. Numeric count/height — `{ count:2, height:50 }` → `("2","50","20-80","20-80")`.
    3. Explicit ranges forwarded verbatim.
    4. Missing `count` (undefined / null) → errorResult, addPit not called.
    5. Missing `height` → same.
    6. Non-finite / non-scalar `count` (NaN, ±Infinity, true, {}, []) → errorResult.
    7. Same for `height`.
    8. Empty / whitespace `count` / `height` → errorResult.
    9. Numeric `rangeX` / `rangeY` → errorResult.
    10. Empty / whitespace `rangeX` / `rangeY` → errorResult.
    11. `null` / `undefined` `rangeX` / `rangeY` → defaults applied.
    12. Runtime throw → errorResult, message surfaced.
    13. Exported tool: name `"add_pit"`, input_schema.type `"object"`, required `["count","height"]`.
  - `defaultAddPitRuntime (integration)` block:
    - afterEach restores original `grid` / `HeightmapGenerator` on `globalThis`.
    - Missing `grid` → throws `/grid/`.
    - Missing `HeightmapGenerator` → throws `/HeightmapGenerator/`.
    - Happy path: records call order `["setGraph","addPit","getHeights"]`; latestGraph === grid; latestArgs equals `["2","40","25-75","10-90"]`; grid.cells.h replaced; cellsChanged equals diff count.
    - `getHeights()` returns null → throws `/getHeights/`.
  - Use `as unknown as { ... }` casts for globalThis assignments.

- [ ] T3 Register in `src/ai/index.ts`:
  - Import `addPitTool` from `./tools/add-pit` (alphabetical placement — after `addMarkerTool`, before `addProvinceTool`).
  - Add an export block for `addPitTool` / `createAddPitTool` alphabetically (after `addMarkerTool` / `addProvinceTool` area — insert before `addProvinceTool` block). Do NOT re-export `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` — those already come from `add-hill`.
  - Add `registry.register(addPitTool);` immediately after `registry.register(addRangeTool);` — group the Heightmap Editor template tools together.

- [ ] T4 Add a `README_AI.md` row immediately after the existing `add_range` row:
  - Cites `HeightmapGenerator.addPit(count, height, rangeX, rangeY)` and the copy-back to `grid.cells.h`.
  - Range-string format reminder (`"1-3"`, `"50"`, `"30-60"`).
  - Required / optional params with defaults.
  - Notes the generator rejects land-less starts up to 50 attempts and may no-op silently — in which case `cellsChanged` is 0.
  - Notes downstream layers stay stale — run `regenerate_map` / `regenerate_domain` after.
  - Requires Anthropic API key callout.
  - Example prompts column.

- [ ] T5 Verify:
  - Lint baseline before: 7 warnings / 1 info / 0 errors.
  - After: `npm run build` succeeds, `npm test` passes, `npm run lint` matches baseline.

- [ ] T6 Commit with `feat(ai): add add_pit tool` staging only the six touched files (add-pit.ts, add-pit.test.ts, src/ai/index.ts, README_AI.md, aiplans/plan_158.md, aiplans/tasks_158.md).
