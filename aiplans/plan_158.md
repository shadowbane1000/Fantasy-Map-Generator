# Plan 158 — `add_pit` AI tool

## Use case

Add one or more pits (isolated low-elevation depressions / craters) to the terrain heightmap — the same side-effect the Heightmap Editor invokes for the "Pit" template step (`public/modules/ui/heightmap-editor.js:1084`):

```js
HeightmapGenerator.setGraph(grid);
HeightmapGenerator.addPit(count, height, x, y);
grid.cells.h = HeightmapGenerator.getHeights();
```

This mirrors the just-merged `add_hill` (plan 156) and `add_range` (plan 157) tools. All three tools directly call a `HeightmapGenerator.add*` method and then copy the fresh typed array back onto `grid.cells.h`. Where `add_hill` raises terrain, `add_pit` carves downward — `addPit` subtracts `h * (Math.random() * 0.2 + 0.9)` from each neighbour while traversing out of a random land cell.

## HeightmapGenerator.addPit signature (confirmed)

`src/modules/heightmap-generator.ts:140` —
```ts
addPit(count: string, height: string, rangeX: string, rangeY: string): void
```

All four arguments are **range strings** consumed by `getNumberInRange` (count / height) and the private `getPointInRange` (rangeX / rangeY), identical to `addHill`. `rangeX` / `rangeY` MUST be strings — `getPointInRange` explicitly checks `typeof range !== "string"` and bails.

Implementation detail worth noting: the generator picks a start cell by rejection-sampling `(x, y)` in the range until it lands on a cell with `heights[start] >= 20` (i.e. land), up to 50 attempts. If the rejection loop exhausts, `addPit` silently returns without touching anything — that's an in-generator behaviour; our tool simply reports `cellsChanged: 0` for such a case.

## Tool contract

Inputs:
- `count` (number | string, required) — how many pits.
- `height` (number | string, required) — depth of each pit (higher value = deeper pit). Clamped via `lim` (0-100) inside `addPit`.
- `rangeX` (string, optional) — horizontal placement range in percent. Default `"20-80"`.
- `rangeY` (string, optional) — vertical placement range in percent. Default `"20-80"`.

All four are coerced to strings before the call.

Outputs:
```
{ ok: true, count: string, height: string, rangeX: string, rangeY: string, cellsChanged: number }
```

`cellsChanged` is computed by diffing `grid.cells.h` before vs. after.

## Validation / rejection rules (verbatim mirror of `add_hill`)

- `count` / `height` — missing / undefined / null / non-finite number / non-string-non-number / empty-string / whitespace-only → error.
- `rangeX` / `rangeY` — if provided, must be a non-empty string; numbers and empty strings rejected. `undefined` / `null` → apply the `"20-80"` default.
- Range-string syntax is NOT further validated — `getPointInRange` / `getNumberInRange` handle malformed input with soft fallbacks.

## Runtime-seam split (mirrors `add-hill.ts`)

```ts
export interface AddPitRuntime {
  addPit(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): { cellsChanged: number };
}
```

- `defaultAddPitRuntime.addPit(...)`:
  - `getGlobal<GridLike>("grid")` — throw `/grid/` if missing.
  - `getGlobal<HeightmapGeneratorLike>("HeightmapGenerator")` — throw `/HeightmapGenerator/` if missing / any of `setGraph` / `addPit` / `getHeights` is not a function.
  - Snapshot `before = Array.from(grid.cells.h)`.
  - `heightmap.setGraph(grid)` → `heightmap.addPit(count, height, rangeX, rangeY)`.
  - `next = heightmap.getHeights()`; throw `/getHeights/` on null/undefined.
  - Assign `grid.cells.h = next`.
  - Diff-count `cellsChanged` and return.

## Shared constants

`DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` ( = `"20-80"`) are already re-exported from `src/ai/index.ts` via the `add-hill` barrel entry. `add-pit.ts` defines local (non-exported) constants of the same value so the barrel does not gain duplicate identifier re-exports (the build error that bit plan 157).

## Integration / downstream redraw

Like `add_hill` / `add_range`, this tool does NOT redraw biomes / rivers / states. The description and README row must make the "run `regenerate_map` afterwards" callout explicit.

## Tests

### Injected-runtime unit tests (`vi.fn<AddPitRuntime["addPit"]>`)

1. Passes range strings through — `{ count: "1-3", height: "30-60" }` → runtime called with `("1-3", "30-60", "20-80", "20-80")`; result contains `{ ok:true, count:"1-3", height:"30-60", rangeX:"20-80", rangeY:"20-80", cellsChanged }`.
2. Numeric count/height coerced to string — `{ count: 2, height: 50 }` → `("2", "50", "20-80", "20-80")`.
3. Explicit rangeX / rangeY forwarded verbatim.
4. Missing `count` (undefined / null) → errorResult, addPit not called.
5. Missing `height` (undefined / null) → errorResult.
6. Non-finite / non-scalar `count` (NaN, Infinity, -Infinity, true, {}, []) → errorResult each.
7. Same rejections for `height`.
8. Empty / whitespace `count` and `height` → errorResult.
9. Numeric `rangeX` / `rangeY` → errorResult.
10. Empty / whitespace `rangeX` / `rangeY` → errorResult.
11. `null` / `undefined` `rangeX` / `rangeY` → treated as defaults.
12. Runtime throw → errorResult with message surfaced.
13. Exported `addPitTool.name === "add_pit"`, `required === ["count", "height"]`.

### `defaultAddPitRuntime` integration block (globalThis seam with `as unknown as { ... }` casts)

- Missing `grid` → throws `/grid/`.
- Missing `HeightmapGenerator` → throws `/HeightmapGenerator/`.
- Happy path: call order is `setGraph`, `addPit`, `getHeights`; `latestGraph === grid`; args forwarded; `grid.cells.h` replaced; `cellsChanged` equals diff count.
- `getHeights()` returns null → throws `/getHeights/`.

## Files touched

- `src/ai/tools/add-pit.ts` (new).
- `src/ai/tools/add-pit.test.ts` (new).
- `src/ai/index.ts` — import, re-export (`addPitTool` / `createAddPitTool` only — NO `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` re-exports), register after `addRangeTool`.
- `README_AI.md` — new row immediately after the `add_range` row.
- `aiplans/plan_158.md`, `aiplans/tasks_158.md` (this planning pair).
