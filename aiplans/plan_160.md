# Plan 160 — `add_strait` AI tool

## Summary
Implement `add_strait`, the last sibling in the `add_*` heightmap-step family. It mirrors the Heightmap Editor "Strait" template step: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.addStrait(width, direction)` → `grid.cells.h = HeightmapGenerator.getHeights()`.

A strait carves a water channel across land terrain; unlike add_hill/add_pit/add_range/add_trough it takes only **two** arguments — `width` (range string) and `direction` (`"vertical"` or `"horizontal"`).

## Reference code
- `src/modules/heightmap-generator.ts:412` — `addStrait(width, direction = "vertical")` — width range-string, direction enum, no `count`/`height`/`rangeX`/`rangeY`.
- `public/modules/ui/heightmap-editor.js:1087` — `HeightmapGenerator.addStrait(count, dist)` where `count` is the width and `dist` is direction. Default width template is `"2-7"` (per `:942`).
- `src/ai/tools/add-trough.ts` / `.test.ts` — the most recent analog, defines the runtime-seam pattern.
- `src/ai/tools/add-hill.ts` — home of the shared `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` constants (not applicable here — strait has no x/y ranges, so we do NOT re-export them).
- `src/ai/tools/_shared/index.ts` — `errorResult`, `getGlobal`, `okResult`.

## Shape of add_strait.ts

Runtime seam:
```ts
interface AddStraitRuntime {
  addStrait(width: string, direction: string): { cellsChanged: number };
}
```

Default runtime: grabs `window.grid` and `window.HeightmapGenerator`; calls setGraph → addStrait → getHeights; assigns back onto `grid.cells.h`; counts changed cells.

Tool schema:
- `width` required — `["number", "string"]` → coerced to string.
- `direction` optional — `"vertical"` | `"horizontal"`, default `"vertical"`.

Tool returns `{ ok: true, width, direction, cellsChanged }`.

## Test plan (add-strait.test.ts)
1. Passes string width straight through.
2. Coerces numeric width to string.
3. Forwards explicit direction.
4. Defaults direction to `"vertical"`.
5. Rejects missing width (undefined / null).
6. Rejects non-finite / non-scalar width (NaN / ±Infinity / bool / object / array).
7. Rejects empty / whitespace string width.
8. Rejects unknown direction values.
9. Rejects non-string direction (numbers, bools, etc.).
10. Surfaces runtime errors.
11. Exports with expected name + required param.
12. `defaultAddStraitRuntime` integration:
    - throws when `window.grid` missing
    - throws when `window.HeightmapGenerator` missing
    - throws when required methods missing
    - throws when `getHeights()` returns null
    - calls setGraph → addStrait → getHeights and updates `grid.cells.h`
    - counts changed cells correctly

## Registration
- `src/ai/index.ts`:
  - Import `addStraitTool` from `./tools/add-strait`.
  - Re-export `{ addStraitTool, createAddStraitTool }`. **Do NOT re-export any shared constants** — TS2300 trap.
  - Register in `buildDefaultRegistry()` near `addTroughTool`.

## README_AI.md
- New row near `add_trough` describing behavior, args, "Requires an Anthropic API key" note, and usage examples.

## Acceptance
- `npm run build` succeeds.
- `npm test` passes (≥ +13 tests vs baseline 2140).
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
