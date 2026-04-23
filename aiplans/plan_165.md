# Plan 165 — `clear_heightmap` AI tool

## Goal
Expose the Heightmap Editor's "Clear" / "Start from scratch" step (reset every
cell's height to 0, producing a blank-ocean canvas) as a Claude tool. Useful
before applying hills/ranges/etc. to build terrain bottom-up. Parallels
`smooth_heightmap` / `modify_heightmap` / `invert_heightmap` — single-op
heightmap mutation with the runtime-seam pattern.

## Upstream reference
- `public/modules/ui/heightmap-editor.js:800-809` — `startFromScratch`:
  ```js
  function startFromScratch() {
    if (changeOnlyLand.checked) return tip("Not allowed when ...");
    const someHeights = grid.cells.h.some(h => h);
    if (!someHeights) return tip("Heightmap is already cleared, ...");
    grid.cells.h = new Uint8Array(grid.cells.i.length);
    viewbox.select("#heights").selectAll("*").remove();
    updateHistory();
  }
  ```
  The handler is wired via `byId("brushClear").on("click", startFromScratch);`
  at `heightmap-editor.js:613`. The legacy UI **bypasses** `HeightmapGenerator`
  entirely — it just allocates a fresh zero-filled `Uint8Array` matching the
  cell count and assigns it to `grid.cells.h`.
- No "none" / "blank" / "clear" template exists in
  `src/modules/heightmap-generator.ts`; `fromTemplate` does not have a
  corresponding branch. Clearing is purely a cell-height reset done by the
  editor.

## Signature
Pure grid mutation: iterate every cell and set `grid.cells.h[i] = height`
(default 0).

## Tool contract
- Name: `clear_heightmap`.
- No required params.
- Optional: `height` (number in `[0, 100]`, default 0). Matches the clamp range
  of `HeightmapGenerator` ops so setting e.g. `height: 20` leaves every cell
  exactly at sea level. Validated as a finite number.
- Execute: walk `grid.cells.h` and write `height` into every index. Count how
  many cells changed (diff against the snapshot) for the response.
- Return `{ok, height, cellsCleared}`.
- Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still
  reflect the pre-clear heights until the caller runs `regenerate_map` (or the
  relevant `regenerate_domain`).

## Structure
Mirror `invert-heightmap.ts`:
- `ClearHeightmapRuntime` seam: `clear(height: number) => {cellsCleared: number}`.
- `defaultClearHeightmapRuntime` reads `window.grid`, guards `grid.cells.h`,
  snapshots the before-heights via `Array.from`, overwrites each index with
  the target height, returns the diff-count. **No `HeightmapGenerator` call** —
  the legacy editor doesn't use it for this op either.
- Input validation:
  - `validateHeight(raw)` — optional, finite number in `[0, 100]`, default 0.

## Re-exports (IMPORTANT)
Only re-export `clearHeightmapTool` and `createClearHeightmapTool` from
`src/ai/index.ts`. Do **NOT** re-export any `DEFAULT_*` constants — keep them
module-internal. (This matches plan 163's policy: fresh `DEFAULT_*` re-exports
would conflict with earlier tools and force TS2300 duplicate-identifier
errors.)

## Registration
Register in `buildDefaultRegistry()` right after `invertHeightmapTool` (the
current last heightmap-mutation tool).

## Docs
Add a `README_AI.md` row immediately below `invert_heightmap`, following the
`invert_heightmap` wording (includes the API-key reminder). Include 2-3 usage
examples covering default clear, `height: 20` (flood at sea level), and a
typical "start fresh before adding hills" flow.

## Tests
Mirror `invert-heightmap.test.ts`:
- Tool-level tests with a fake runtime:
  - default `height` (0) applied when called with no args;
  - explicit `height` forwarded to runtime unchanged;
  - non-finite `height` rejected (`"0"`, `NaN`, `Infinity`, `true`, `{}`);
  - out-of-range `height` rejected (`-1`, `101`);
  - null/undefined `height` treated as default;
  - runtime errors surfaced;
  - `clearHeightmapTool` name + input-schema shape asserted (no required keys).
- `defaultClearHeightmapRuntime` integration block using
  `globalThis as unknown as { grid?: unknown }` — covers missing grid, happy
  path with cellsCleared diff, and idempotency (calling twice on an
  already-zero heightmap returns `cellsCleared = 0`).

## Verification gates
- `npm run build` (tsc + vite) succeeds.
- `npm test` — expect +~11 tests (new file only).
- `npm run lint` — must still produce exactly `7 warnings / 1 info / 0 errors`.

## Commit
`feat(ai): add clear_heightmap tool` + 1-2 line body. Stage only the new /
modified files.
