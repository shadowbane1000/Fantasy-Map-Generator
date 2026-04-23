# Plan 154 — `smooth_heightmap` AI tool

## Use case

Reduce height variation between neighboring cells — the same side-effect as the
Heightmap Editor's "Smooth" button (`smoothAllHeights`). Good for softening
noisy terrain, flattening jagged coasts, or repeatedly sanding an AI-generated
heightmap before downstream regeneration.

## Reference implementation

Heightmap editor button (`public/modules/ui/heightmap-editor.js:788`):

```js
function smoothAllHeights() {
  HeightmapGenerator.setGraph(grid);
  HeightmapGenerator.smooth(4, 1.5);
  grid.cells.h = HeightmapGenerator.getHeights();
  updateHeightmap();
}
```

Smooth method (`src/modules/heightmap-generator.ts:504`):

```ts
smooth(fr = 2, add = 0): void {
  if (!this.heights || !this.grid) return;
  this.heights = this.heights.map((h, i) => {
    const a = [h];
    this.grid.cells.c[i].forEach((c: number) => {
      a.push(this.heights![c]);
    });
    if (fr === 1) return (mean(a) as number) + add;
    return lim((h * (fr - 1) + (mean(a) as number) + add) / fr);
  });
}
```

Key facts:

- `HeightmapGenerator` is the real generator singleton on `window`
  (`src/modules/heightmap-generator.ts:675`).
- `smooth(fr, add)` averages each cell with its Voronoi neighbors. `fr` is the
  smoothing fraction: `fr=1` = full smooth (pure mean), higher values keep more
  of the original height. The UI button uses `fr=4, add=1.5` — `add` nudges the
  result up so repeated smoothing doesn't drive everything toward the sea.
- The template-Smooth tool re-uses the same method with only `fr` (see
  `heightmap-editor.js:1092`: `HeightmapGenerator.smooth(+count)`).
- After smoothing, the grid-level heights are copied back:
  `grid.cells.h = HeightmapGenerator.getHeights()` and the editor's
  `updateHeightmap()` re-paints the mock polygons + appends a history entry.

## Scope of the AI tool

We mirror the UI button one-to-one: call `setGraph(grid)`, call
`smooth(factor, add)`, copy `getHeights()` back to `grid.cells.h`. We do **not**
call `updateHeightmap()` because that helper only exists inside the editor
closure and drives the Heightmap Editor's preview layer + undo stack — neither
is relevant for an AI-driven smoothing step.

We also do **not** automatically trigger a full map regeneration after
smoothing. The user is expected to chain `regenerate_map` themselves if they
want the downstream effects (biomes, rivers, states, etc.) to refresh. This
matches how `set_heightmap_template` / `set_heightmap_options` / other passive
heightmap tools behave and leaves undo-style workflows possible.

### Parameters

- `factor` (number, optional, default `4`): the `fr` argument of `smooth(fr,
  add)`. Must be a finite number `>= 1`. Values `< 1` don't make sense
  (division by a positive denominator smaller than 1 blows up heights) and the
  UI never emits them. We cap at a generous upper bound (`100`) so we don't
  accept absurd values that are effectively no-ops.
- `add` (number, optional, default `1.5`): the `add` argument. Finite number
  in `[-100, 100]`. Matches the UI default.

Both have defaults matching the "Smooth" button so
`smooth_heightmap({})` reproduces the button exactly.

### Return value

`{ ok: true, factor, add, cellsChanged, regenerate_hint: "call regenerate_map
to refresh biomes/rivers/states" }`.

`cellsChanged` is optional — we compute it best-effort by snapshotting
`grid.cells.h` before and counting differences. It mirrors the tooltip the
editor pops up (`Cells changed: N`).

## Runtime seam

`SmoothHeightmapRuntime`:

```ts
interface SmoothHeightmapRuntime {
  smooth(factor: number, add: number): { cellsChanged: number };
}
```

`defaultSmoothHeightmapRuntime.smooth(factor, add)`:

1. Read `window.grid` — throw if missing.
2. Read `window.HeightmapGenerator` — throw if missing (same message style as
   `regenerate_domain`).
3. Snapshot `grid.cells.h` as a plain array.
4. Call `HeightmapGenerator.setGraph(grid)`.
5. Call `HeightmapGenerator.smooth(factor, add)`.
6. Write `grid.cells.h = HeightmapGenerator.getHeights()`.
7. Compute `cellsChanged` by comparing to the snapshot.

Unit tests mock the runtime with `as unknown as { smooth: ... }`-style casts
and inspect the invocation. An integration block exercises
`defaultSmoothHeightmapRuntime` with a hand-rolled `window.grid` +
`window.HeightmapGenerator` pair, asserting that `setGraph` / `smooth` /
`getHeights` are called in order and that `grid.cells.h` is updated.

## Failure modes

- `factor` not a finite number / `< 1` / `> 100` → validation error.
- `add` not a finite number / out of range → validation error.
- Missing `window.grid` or `window.HeightmapGenerator` (map not loaded) →
  runtime error surfaced via `errorResult`.

## Registration

- Export from `src/ai/tools/smooth-heightmap.ts`.
- Import + `registry.register(smoothHeightmapTool)` in `src/ai/index.ts`,
  grouped near `setHeightmapTemplateTool` / `setHeightmapOptionsTool`.
- Re-export `createSmoothHeightmapTool` and `smoothHeightmapTool` from the
  module barrel in `src/ai/index.ts`.
- README_AI row inserted after `set_heightmap_options`.

## Tests

- Unit: accepts defaults; forwards `factor` and `add`; rejects
  non-numeric / out-of-range `factor`; rejects non-numeric / out-of-range
  `add`; surfaces runtime errors; result body has `factor`/`add`/`cellsChanged`.
- Integration (defaultRuntime): fakes `grid` + `HeightmapGenerator` via
  `as unknown as { ... }` casts; verifies the call order and that
  `grid.cells.h` is refreshed from `getHeights()`.
