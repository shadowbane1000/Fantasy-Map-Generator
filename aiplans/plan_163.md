# Plan 163 — `invert_heightmap` AI tool

## Goal
Expose the Heightmap Editor's "Invert" step (mirror the heightmap along one or
both axes) as a Claude tool. Parallels `smooth_heightmap` / `modify_heightmap`
— single-op heightmap mutation with the runtime-seam pattern.

## Upstream reference
- `src/modules/heightmap-generator.ts:531` —
  `invert(count: number, axes: string): void`.
  ```ts
  invert(count, axes) {
    if (!P(count) || !this.heights || !this.grid) return;
    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = this.grid;
    const inverted = this.heights.map((_h, i) => {
      const x = i % cellsX;
      const y = Math.floor(i / cellsX);
      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedI = nx + ny * cellsX;
      return this.heights![invertedI];
    });
    this.heights = inverted;
  }
  ```
  - `count` is a **probability** (0-1), not a literal repetition count — it's
    passed through `P(count)` which rolls `Math.random() < count` and bails
    when the roll fails. A whole-integer `count >= 1` always applies; `count
    < 0` or `count > 1` is clamped by `P` semantics (P(n>=1) always true,
    P(n<=0) always false).
  - `axes` drives which dimensions are mirrored:
    - `"x"` — mirror along the X axis only (`invertX=true, invertY=false`).
    - `"y"` — mirror along the Y axis only (`invertX=false, invertY=true`).
    - `"xy"` — mirror both axes (`invertX=true, invertY=true`) — equivalent to
      a 180° rotation.
    - The branch logic is literally `axes !== "y"` / `axes !== "x"`, so any
      string that isn't exactly `"y"` or `"x"` collapses to the `"xy"` path
      (e.g. `""`, `"both"`, `"yx"` all invert both axes). We still validate
      the canonical set `{"x", "y", "xy"}` so the tool contract is clear.
- `public/modules/ui/heightmap-editor.js:947-959` — the Invert template step
  UI renders a `<select>` with exactly these three options:
  ```html
  <select class="templateDist" data-tip="Mirror heightmap along axis">
    <option value="x" selected>x</option>
    <option value="y">y</option>
    <option value="xy">both</option>
  </select>
  ```
- `public/modules/ui/heightmap-editor.js:1089` — execution path:
  ```js
  else if (type === "Invert") HeightmapGenerator.invert(+count, dist);
  grid.cells.h = HeightmapGenerator.getHeights();
  ```
  (`count` here is the probability string like `"0.5"`, cast via `+`; `dist`
  is the select value — one of `"x" | "y" | "xy"`.)

## Signature
`HeightmapGenerator.invert(count: number, axes: string)`.

- `count`: number — probability (0-1). The legacy UI default is `0.5`. We pick
  a sensible tool default of `1` so a call with just `axes` always applies.
- `axes`: string — one of `"x"`, `"y"`, `"xy"`.

## Tool contract
- Name: `invert_heightmap`.
- Required: `axes` (string — must be one of `"x"`, `"y"`, `"xy"`; accept
  aliases like `"both"` / `"yx"` / `"XY"` by case-folding and normalising;
  reject unknown strings).
- Optional: `count` (number, default 1; finite number; clamped/rejected if
  outside [0, 1]? The generator's `P()` treats n>=1 as always-true and n<=0 as
  always-false, so values outside [0, 1] are effectively degenerate — we
  validate `count` is in `[0, 1]` with default `1` to keep the contract
  honest).
- Execute: `HeightmapGenerator.setGraph(grid)` →
  `HeightmapGenerator.invert(count, axes)` → copy `getHeights()` back onto
  `grid.cells.h`.
- Return `{ok, count, axes, cellsChanged}`.
- Does NOT auto-regenerate downstream domains — caller must invoke
  `regenerate_map` / the relevant `regenerate_domain` to refresh biomes,
  rivers, states, etc.

## Valid axis values
**Canonical set passed to `HeightmapGenerator.invert`**: `"x"`, `"y"`, `"xy"`.

Aliases accepted by the tool (normalised before forwarding):
- `"x"`, `"X"` → `"x"`
- `"y"`, `"Y"` → `"y"`
- `"xy"`, `"yx"`, `"XY"`, `"YX"`, `"both"` → `"xy"`

Anything else → error.

## Structure
Mirror `modify-heightmap.ts`:
- `InvertHeightmapRuntime` seam:
  `invert(count: number, axes: string) => {cellsChanged: number}`.
- `defaultInvertHeightmapRuntime` reads `window.grid` +
  `window.HeightmapGenerator`, guards both, snapshots before-heights, calls
  `setGraph/invert/getHeights`, writes `grid.cells.h`, diff-counts
  `cellsChanged`.
- Input validation:
  - `resolveAxes(raw)` — required, non-empty string; normalises to canonical
    `"x"`, `"y"`, or `"xy"`; rejects unknown strings.
  - `validateCount(raw)` — optional, finite number in `[0, 1]`, default `1`.

## Re-exports (IMPORTANT)
Only re-export `invertHeightmapTool` and `createInvertHeightmapTool` from
`src/ai/index.ts`. Do NOT re-export any `DEFAULT_*` constants — the prior
heightmap tools already re-export their own, and fresh `DEFAULT_*` re-exports
would trip TS2300 (duplicate identifier). Keep all shared-looking constants
module-internal to `invert-heightmap.ts`.

## Registration
Register in `buildDefaultRegistry()` right after `modifyHeightmapTool` (the
current last heightmap-mutation tool in the registry).

## Docs
Add a `README_AI.md` row immediately below `modify_heightmap`, following the
`smooth_heightmap` / `modify_heightmap` wording (includes an API-key
reminder). Include 2-3 usage examples covering each axis value.

## Tests
Mirror `modify-heightmap.test.ts`:
- Tool-level tests with a fake runtime:
  - required `axes` — missing / null / undefined / empty / whitespace → error;
  - unknown axes string → error;
  - aliases (`"both"`, `"yx"`, `"XY"`, `"X"`) normalise correctly;
  - default `count` (1) applied when omitted;
  - non-finite / out-of-range `count` rejected;
  - explicit count + axes forwarded to runtime unchanged;
  - runtime errors surfaced;
  - `invertHeightmapTool` name + input-schema shape asserted.
- `defaultInvertHeightmapRuntime` integration block using
  `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`
  — covers missing grid, missing generator, happy path with cellsChanged
  diff, and null getHeights result.

## Verification gates
- `npm run build` (tsc + vite) succeeds.
- `npm test` — expect +~14 tests (new file only).
- `npm run lint` — must still produce exactly `7 warnings / 1 info / 0 errors`.

## Commit
`feat(ai): add invert_heightmap tool` + 1-2 line body. Stage only the new /
modified files.
