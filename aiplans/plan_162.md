# Plan 162 — `mask_heightmap` AI tool

## Goal
Expose the Heightmap Editor's "Mask" template step (radial insulation — lowers
heights near the map edges to produce an island / continent silhouette) as a
Claude tool. Parallels `smooth_heightmap` / `modify_heightmap` — single-op
heightmap mutation with the runtime-seam pattern.

## Upstream reference
- `src/modules/heightmap-generator.ts:516` —
  `mask(power = 1): void`.
  ```ts
  mask(power = 1) {
    if (!this.heights || !this.grid) return;
    const fr = power ? Math.abs(power) : 1;
    this.heights = this.heights.map((h, i) => {
      const [x, y] = this.grid.points[i];
      const nx = (2 * x) / graphWidth - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / graphHeight - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted (0 is center, 1 is edge)
      const masked = h * distance;
      return lim((h * (fr - 1) + masked) / fr);
    });
  }
  ```
- `public/modules/ui/heightmap-editor.js:1088` — handler:
  `else if (type === "Mask") HeightmapGenerator.mask(+count);`
- `public/modules/ui/heightmap-editor.js:961-968` — Mask template-step UI:
  ```
  <input class="templateCount"
    data-tip="Set masking fraction. 1 - full insulation (prevent land on map edges),
              2 - half-insulation, etc. Negative number to inverse the effect"
    type="number" min=-10 max=10 value=${count || 1} />
  ```
  So the UI bounds `power` in `[-10, 10]` and defaults to `1`.

## Signature
`HeightmapGenerator.mask(power = 1): void`.

- `power`: number — masking fraction (`fr`). `1` = full insulation (map edges
  pushed to sea level); larger `|power|` = softer masking (keeps more of the
  original height). Negative values invert the effect so the *center* is
  depressed instead.

## Tool contract
- Name: `mask_heightmap`.
- Required: none.
- Optional: `power` (number in `[-10, 10]`, default `1` — matches the UI).
- Execute: `HeightmapGenerator.setGraph(grid)` →
  `HeightmapGenerator.mask(power)` → copy `getHeights()` back onto
  `grid.cells.h`.
- Return `{ok, power, cellsChanged}`.
- Does NOT auto-regenerate downstream domains.

## Structure
Mirror `smooth-heightmap.ts`:
- `MaskHeightmapRuntime` seam:
  `mask(power: number) => {cellsChanged: number}`.
- `defaultMaskHeightmapRuntime` reads `window.grid` + `window.HeightmapGenerator`,
  guards both, snapshots before-heights, calls `setGraph/mask/getHeights`,
  writes `grid.cells.h`, diff-counts `cellsChanged`.
- Input validation:
  - `power`: optional number, default `1`, must be finite, must lie within
    `[MASK_POWER_MIN, MASK_POWER_MAX]` = `[-10, 10]` (matches UI bounds).
- No identity-rejection: `power = 1` is the *intended* default (full mask), not
  a no-op. Any `power` value is a valid call because the mask always multiplies
  every cell by a radial distance factor (only cells at exact center + near
  edges see the extreme changes; everything in between is mutated too).

## Re-exports (IMPORTANT)
Only re-export `maskHeightmapTool` and `createMaskHeightmapTool` from
`src/ai/index.ts`. Do NOT re-export any `DEFAULT_*` / `MASK_POWER_*` constants
— keeping them module-internal avoids TS2300 clashes with other heightmap tool
re-exports.

## Registration
Register in `buildDefaultRegistry()` right after `modifyHeightmapTool` (the
current last heightmap-mutation tool in the registry).

## Docs
Add a `README_AI.md` row immediately below `modify_heightmap`, following the
`smooth_heightmap` / `modify_heightmap` wording (includes an API-key reminder).
Include 2-3 usage examples covering default, softer mask, and inverted mask.

## Tests
Mirror `smooth-heightmap.test.ts`:
- Tool-level tests with a fake runtime:
  - default `power: 1` when called with no args / `{}` / `{ power: null }` /
    `{ power: undefined }`;
  - forwards explicit `power` unchanged (e.g. `2`, `-3`, `0`, `10`);
  - non-number / non-finite `power` rejected (`"1"`, `true`, `{}`, `NaN`,
    `±Infinity`);
  - out-of-range `power` rejected (`-11`, `11`, `1000`);
  - runtime errors surfaced;
  - `maskHeightmapTool` name + input-schema shape asserted (no required keys).
- `defaultMaskHeightmapRuntime` integration block using
  `globalThis as unknown as { grid?: unknown; HeightmapGenerator?: unknown }`:
  - missing grid → throw;
  - missing generator → throw;
  - happy path asserts `setGraph → mask → getHeights` call order, `power`
    forwarded exactly, `grid.cells.h` reassigned, `cellsChanged` matches diff;
  - `getHeights()` returning null → throw.

## Verification gates
- `npm run build` (tsc + vite) succeeds.
- `npm test` — expect ~+13 tests from the new file on top of the 2174 baseline.
- `npm run lint` — must still produce exactly `7 warnings / 1 info / 0 errors`.

## Commit
`feat(ai): add mask_heightmap tool` + 1-2 line body. Stage only the new /
modified files.
