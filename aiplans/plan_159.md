# Plan 159 — `add_trough` AI tool

## Goal
Expose Heightmap Editor's "Trough" template step as a Claude tool, parallel to
the just-merged `add_range` and `add_hill` tools. A trough is a linear
depression / valley — the inverse of a range.

## Upstream reference
- `src/modules/heightmap-generator.ts:294` —
  `addTrough(count, height, rangeX, rangeY, startCellId?, endCellId?)`.
- `public/modules/ui/heightmap-editor.js:1086` — template executor:
  ```
  HeightmapGenerator.setGraph(grid);
  HeightmapGenerator.addTrough(count, height, x, y);
  grid.cells.h = HeightmapGenerator.getHeights();
  ```

## Signature
`HeightmapGenerator.addTrough(count, height, rangeX, rangeY)` — four range
strings, same shape as `addRange` / `addHill`.

## Tool contract
- Name: `add_trough`.
- Required: `count` (number|string), `height` (number|string).
- Optional: `rangeX` (string, default `"20-80"`), `rangeY` (string, default
  `"20-80"`).
- Execute: `HeightmapGenerator.setGraph(grid)` →
  `HeightmapGenerator.addTrough(...)` → copy `getHeights()` back onto
  `grid.cells.h`.
- Return `{ok, count, height, rangeX, rangeY, cellsChanged}`.
- Does NOT auto-regenerate downstream domains.

## Structure
Mirror `add-hill.ts` (which already returns `cellsChanged`):
- `AddTroughRuntime` seam with default impl reading `window.grid` /
  `window.HeightmapGenerator`.
- Coercers: numeric or non-empty string for `count` / `height`; string or
  undefined/null (→ default) for ranges.
- `createAddTroughTool(runtime?)` factory + `addTroughTool` default instance.

## Re-exports (IMPORTANT)
`DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` are already re-exported from `./add-hill`
in `src/ai/index.ts`. We will **NOT** re-export them from `add-trough` — doing
so would trip TS2300 (duplicate identifier). Only re-export `addTroughTool`
and `createAddTroughTool`. The constants may be redefined as module-internal
`const`s in `add-trough.ts` (same literal value `"20-80"`) — they are used for
the defaults and for the schema-description strings.

## Registration
Register in `buildDefaultRegistry()` right after `addRangeTool`.

## Docs
Add a `README_AI.md` row immediately below `add_range`, following that row's
wording closely. Include the API-key reminder the other heightmap rows use.

## Tests
Mirror `add-hill.test.ts`:
- tool-level tests with a fake runtime (missing / bad args, defaults, number →
  string coercion, runtime errors, schema shape, cellsChanged forwarded).
- `defaultAddTroughRuntime` integration block: swap `globalThis.grid` /
  `globalThis.HeightmapGenerator` with stubs, assert setGraph→addTrough→
  getHeights sequence, assigned `grid.cells.h`, cellsChanged computed from
  before/after diff, and error branches when globals are missing or
  `getHeights()` returns null. Use `as unknown as { ... }` casts when
  assigning to the globals ref.

## Verification gates
- `npm run build` (tsc + vite) succeeds.
- `npm test` — expect `+N` vs the 2105-test baseline (the new test file adds
  ~13 cases).
- `npm run lint` — must still produce exactly `7 warnings / 1 info / 0 errors`.
