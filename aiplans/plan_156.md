# Plan 156 — `add_hill` AI tool

## Use case

Add one or more hills (isolated high-ground blobs) to the terrain heightmap — the same side-effect the Heightmap Editor invokes for the "Hill" template step (`public/modules/ui/heightmap-editor.js:1083`):

```js
HeightmapGenerator.setGraph(grid);
HeightmapGenerator.addHill(count, height, x, y);
grid.cells.h = HeightmapGenerator.getHeights();
```

This mirrors the just-merged `smooth_heightmap` tool (plan 154 / merged). Both tools directly call `HeightmapGenerator` and then copy the fresh typed array back onto `grid.cells.h`.

## HeightmapGenerator.addHill signature (confirmed)

`src/modules/heightmap-generator.ts:104` —
```ts
addHill(count: string, height: string, rangeX: string, rangeY: string): void
```

All four arguments are **range strings** consumed by:
- `getNumberInRange(range)` (from `src/utils/probabilityUtils`) — accepts `"5"`, `"0"`, `"3-7"`, `"-5-10"`, `"2.5"` (float → probabilistic round). Non-string → 0. Invalid format w/o separator → 0.
- `getPointInRange(range, length)` (private, line 80) — reads `min-max` percent pairs (`"20-80"` ⇒ a random pixel between 20 % and 80 % of `graphWidth`/`graphHeight`). Explicitly checks `typeof range !== "string"` and logs / returns undefined otherwise.

So **both `rangeX` and `rangeY` MUST be strings** — `getPointInRange` outright refuses numeric input. `count` and `height` can be string or number in practice (`getNumberInRange` coerces non-strings to 0, but the editor UI always sends strings), but we must coerce to string before the call because a bare number will silently yield `getNumberInRange(5) === 0`.

Defaults from the Heightmap Editor template UI (`public/modules/ui/heightmap-editor.js:925` for count, `:915` is the height default `50-70` region — actual height depends on the template row; common Hill step in templates uses `"30-60"` or `"50"`):
- `count` — `"1-2"` is the editor's default placeholder for template steps.
- `height` — no universal default; templates vary (`"50"`, `"30-60"`, etc.). Our tool **requires** height explicitly.
- `rangeX` / `rangeY` — `"20-80"` is the most common template value (centre-ish of the map).

## Tool contract

Inputs:
- `count` (number | string, required) — how many hills (range string like `"1-3"` or a single number like `5`).
- `height` (number | string, required) — height of each hill (range string like `"30-60"` or a number like `50`). Resolved per-hill via `getNumberInRange`, then clamped via `lim` (0-100) inside `addHill`.
- `rangeX` (string, optional) — horizontal placement range in percent. Default `"20-80"`.
- `rangeY` (string, optional) — vertical placement range in percent. Default `"20-80"`.

All four are coerced to strings before the call (numbers become decimal strings — `5 → "5"`, `30 → "30"`). The underlying `getNumberInRange` accepts this form.

Outputs:
```
{ ok: true, count: string, height: string, rangeX: string, rangeY: string, cellsChanged: number }
```

`cellsChanged` is computed by diffing `grid.cells.h` before vs. after — matches `smooth_heightmap`'s response shape and is the single concrete observable effect we can surface.

## Validation / rejection rules

- `count` missing / undefined / null → error ("count is required").
- `count` not a number / string → error.
- `count` number that is not finite → error.
- `count` string that is empty / whitespace → error.
- `count` when coerced via `getNumberInRange` gives a non-positive value is NOT pre-rejected — `HeightmapGenerator.addHill` will simply loop 0 times and be a no-op. We let that through (matches `smooth_heightmap`'s philosophy of not second-guessing the generator).
- Same rules for `height`.
- `rangeX` / `rangeY` — if provided, must be a non-empty string (mirror `getPointInRange`'s explicit string check). Numbers rejected with a clear error message. Empty string rejected.
- Range-string syntax is NOT validated beyond "non-empty string" — `getPointInRange`/`getNumberInRange` already handle malformed input with soft fallbacks (0 / undefined). The tool documents the expected `"min-max"` percent form.

## Runtime-seam split (mirrors `smooth-heightmap.ts`)

```ts
export interface AddHillRuntime {
  addHill(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): { cellsChanged: number };
}
```

- `defaultAddHillRuntime.addHill(...)`:
  - `getGlobal<GridLike>("grid")` — throw if missing (same wording as `smooth_heightmap`).
  - `getGlobal<HeightmapGeneratorLike>("HeightmapGenerator")` — throw if missing / malformed.
  - Snapshot `before = Array.from(grid.cells.h)`.
  - `heightmap.setGraph(grid)` → `heightmap.addHill(count, height, rangeX, rangeY)`.
  - `next = heightmap.getHeights()`; throw if null/undefined.
  - Assign `grid.cells.h = next` (exact same line the editor uses at `heightmap-editor.js:1094`).
  - Diff-count `cellsChanged` and return.

## Integration / downstream redraw

Like `smooth_heightmap`, this tool does **not** redraw biomes / rivers / states. The heightmap editor redraws its own canvas when open, but for a user viewing the fully generated map the layers stay stale until they call `regenerate_map` or `regenerate_domain`. The tool description and README row must make this explicit.

## Tests

### Injected-runtime unit tests (vi.fn<AddHillRuntime["addHill"]>)

1. Accepts `count: "1-3"`, `height: "30-60"` with defaults for ranges → runtime called with `("1-3", "30-60", "20-80", "20-80")`.
2. Accepts `count: 2`, `height: 50` (numbers coerced to `"2"` / `"50"`).
3. Accepts explicit `rangeX` / `rangeY` (`"40-60"`).
4. Returns `{ ok, count, height, rangeX, rangeY, cellsChanged }` with the coerced string forms.
5. Rejects missing `count` (undefined / null).
6. Rejects non-finite numeric `count` (`NaN`, `Infinity`).
7. Rejects non-string / non-number `count` (boolean, object, array).
8. Rejects empty-string / whitespace-only `count`.
9. Same rejections for `height`.
10. Rejects numeric `rangeX` / `rangeY` (those params must be strings per `getPointInRange`).
11. Rejects empty-string `rangeX` / `rangeY`.
12. Surfaces runtime throws as errorResult.
13. Exported `addHillTool` has name `"add_hill"`, `required: ["count", "height"]`.

### `defaultAddHillRuntime` integration tests (globalThis seam)

Installs fake `globalThis.grid` + `globalThis.HeightmapGenerator` mirroring `smooth-heightmap.test.ts`:

- Missing `grid` → throws `/grid/`.
- Missing `HeightmapGenerator` → throws `/HeightmapGenerator/`.
- Happy path: `setGraph → addHill → getHeights` called in order with the forwarded args; `grid.cells.h` replaced by return of `getHeights`; `cellsChanged` is the diff count.
- `getHeights()` returns null → throws `/getHeights/`.

All `globalThis` reassignments use `as unknown as { ... }` casts.

## Files touched

- `src/ai/tools/add-hill.ts` (new)
- `src/ai/tools/add-hill.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register near `smoothHeightmapTool`.
- `README_AI.md` — new row immediately after the `smooth_heightmap` row, including API-key callout.
- `aiplans/plan_156.md`, `aiplans/tasks_156.md` (this planning pair).
