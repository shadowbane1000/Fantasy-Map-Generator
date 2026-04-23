# Plan 157 — `add_range` AI tool

## Use case

Add a mountain range to the terrain heightmap — the same side-effect as
selecting "Range" in the Heightmap Editor's template steps. Useful when an
AI-generated world needs a spine of mountains, a dividing ridge between two
regions, or when bulking up an existing terrain before downstream regeneration
(rivers, biomes, states, etc.).

## Reference implementation

Heightmap editor call site (`public/modules/ui/heightmap-editor.js:1085`):

```js
else if (type === "Range") HeightmapGenerator.addRange(count, height, x, y);
// …
grid.cells.h = HeightmapGenerator.getHeights();
```

The same per-step block also calls `HeightmapGenerator.setGraph(grid)` once
before running the steps (`heightmap-editor.js:1070`).

`addRange` signature (`src/modules/heightmap-generator.ts:179`):

```ts
addRange(
  count: string,
  height: string,
  rangeX: string,
  rangeY: string,
  startCellId?: number,
  endCellId?: number,
): void
```

Key facts:

- All four primary args are strings. Internally the generator uses
  `getNumberInRange(count|height)` to allow either a plain number or a
  hyphen-delimited range like `"2-4"`, and `getPointInRange(rangeX|rangeY,
  length)` for percentage ranges like `"20-80"`.
- The AI tool mirrors the Range step exactly — it does not pass `startCellId`
  / `endCellId`. The generator picks random endpoints inside `rangeX` /
  `rangeY` if those are provided (they will be, because we default them).
- After mutating the generator's internal heights, the tool copies the result
  back with `grid.cells.h = HeightmapGenerator.getHeights()`, matching the UI
  pattern used by `addHill`, `addPit`, `addTrough`, and the sibling
  `smooth_heightmap` tool.

## Scope of the AI tool

We mirror the Range template step one-to-one:

1. Call `HeightmapGenerator.setGraph(grid)`.
2. Call `HeightmapGenerator.addRange(count, height, rangeX, rangeY)`.
3. Copy `grid.cells.h = HeightmapGenerator.getHeights()`.

We do **not** call `updateHeightmap()` (lives inside the editor closure and
drives the editor preview + undo stack — not relevant here) and we do **not**
auto-regenerate downstream domains. The user chains `regenerate_map` after
if they want biomes/rivers/states to refresh. This matches `smooth_heightmap`.

### Parameters

- `count` (number or string, required): blob count. A number or a
  hyphen-delimited range like `"2-4"`. Coerced to a string before being
  forwarded to `addRange`.
- `height` (number or string, required): ridge height. A number or a
  hyphen-delimited range like `"40-55"`. Coerced to a string.
- `rangeX` (string, optional, default `"20-80"`): placement range along the
  X-axis as a percentage-range (min-max, 0–100). Matches the default used by
  the editor's `newTemplateStep` builder.
- `rangeY` (string, optional, default `"20-80"`): same, along Y.

### Validation

- `count` / `height`: required; accept number or string. Numbers must be
  finite. Strings must be non-empty. We don't parse the hyphen syntax — the
  generator already handles both forms via `getNumberInRange`.
- `rangeX` / `rangeY`: if provided, must be non-empty strings. We don't
  enforce the exact `min-max` form — the generator tolerates either a single
  value or a range.

### Return value

`{ ok: true, count, height, rangeX, rangeY }` — the exact strings we passed
to the generator, so the caller can chain or log them.

## Runtime seam

```ts
interface AddRangeRuntime {
  addRange(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): void;
}
```

`defaultAddRangeRuntime.addRange(count, height, rangeX, rangeY)`:

1. Read `window.grid` via `getGlobal` — throw if missing / missing
   `grid.cells.h`.
2. Read `window.HeightmapGenerator` — throw if missing or missing the
   required methods (`setGraph`, `addRange`, `getHeights`).
3. Call `HeightmapGenerator.setGraph(grid)`.
4. Call `HeightmapGenerator.addRange(count, height, rangeX, rangeY)`.
5. Assign `grid.cells.h = HeightmapGenerator.getHeights()` (throw if the
   getter returns null/undefined).

Unit tests mock the runtime with `as unknown as { addRange: ... }`-style
casts. An integration block exercises the default runtime with a hand-rolled
`window.grid` + `window.HeightmapGenerator` pair and asserts the call order
plus that `grid.cells.h` is refreshed.

## Failure modes

- `count` missing / not a number or non-empty string → validation error.
- `height` missing / not a number or non-empty string → validation error.
- `rangeX` / `rangeY` provided but not a non-empty string → validation error.
- `window.grid` missing → runtime error.
- `window.HeightmapGenerator` missing / incomplete → runtime error.
- `getHeights()` returns null/undefined → runtime error.

## Registration

- Export from `src/ai/tools/add-range.ts`.
- Import + `registry.register(addRangeTool)` in `src/ai/index.ts`, grouped
  near `smoothHeightmapTool`.
- Re-export `createAddRangeTool`, `addRangeTool`, `DEFAULT_RANGE_X`,
  `DEFAULT_RANGE_Y` from the `src/ai/index.ts` barrel.
- README_AI row inserted after `smooth_heightmap`.

## Tests

- Unit: rejects missing `count` / missing `height`; accepts number inputs
  coerced to strings; accepts string ranges verbatim; applies default
  `rangeX` / `rangeY` when omitted; forwards explicit `rangeX` / `rangeY`;
  rejects non-string / empty `rangeX` / `rangeY`; rejects non-finite numeric
  `count` / `height`; surfaces runtime errors; result body carries
  `count`/`height`/`rangeX`/`rangeY`.
- Integration (defaultRuntime): fakes `grid` + `HeightmapGenerator` via
  `as unknown as { ... }` casts; verifies the call order (`setGraph` →
  `addRange` → `getHeights`); verifies `grid.cells.h` is refreshed; verifies
  the exact string values forwarded to `addRange`; verifies throws when
  `grid` / `HeightmapGenerator` / returned heights are missing.
