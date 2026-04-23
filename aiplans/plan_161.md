# Plan 161 — `modify_heightmap` AI tool

## Goal
Expose the Heightmap Editor's "Modify" step (arithmetic edits applied to cells
whose height falls in a range) as a Claude tool. Parallels `smooth_heightmap` /
`add_hill` / `add_pit` / `add_range` / `add_trough` — single-op heightmap
mutation with the runtime-seam pattern.

## Upstream reference
- `src/modules/heightmap-generator.ts:486` —
  `modify(range: string, add: number, mult: number, power?: number): void`.
  ```ts
  modify(range, add, mult, power?) {
    const min = range === "land" ? 20 : range === "all" ? 0 : +range.split("-")[0];
    const max = range === "land" || range === "all" ? 100 : +range.split("-")[1];
    const isLand = min === 20;
    this.heights = this.heights.map((h) => {
      if (h < min || h > max) return h;
      if (add) h = isLand ? Math.max(h + add, 20) : h + add;
      if (mult !== 1) h = isLand ? (h - 20) * mult + 20 : h * mult;
      if (power) h = isLand ? (h - 20) ** power + 20 : h ** power;
      return lim(h);
    });
  }
  ```
- `public/modules/ui/heightmap-editor.js:768-786` —
  `rescaleWithCondition()` is the Heightmap Editor's Modify-button wrapper:
  ```
  HeightmapGenerator.setGraph(grid);
  HeightmapGenerator.modify(range, add, mult, power);
  grid.cells.h = HeightmapGenerator.getHeights();
  ```

## Signature
`HeightmapGenerator.modify(range, add, mult, power?)`.

- `range`: string — `"all"`, `"land"`, or a hyphen pair `"min-max"` in [0, 100].
  (Only cells with `min <= h <= max` are touched. `"land"` is a convenience
  alias for `"20-100"` that also floors the result at 20 so land never flips
  below sea level.)
- `add`: number — additive offset (applied first).
- `mult`: number — multiplicative factor (applied second; skipped when `mult
  === 1`).
- `power`: optional number — exponent (applied third; skipped when falsy /
  undefined).

## Tool contract
- Name: `modify_heightmap`.
- Required: `range` (string — coerced from number too).
- Optional: `add` (number, default 0), `mult` (number, default 1), `power`
  (number — no default; `undefined` skips the exponent branch).
- Validate at least one of `add` / `mult` / `power` differs from identity
  (identities are `add === 0`, `mult === 1`, `power === undefined | 0 | 1`).
  Reject otherwise (the call would be a no-op).
- Execute: `HeightmapGenerator.setGraph(grid)` →
  `HeightmapGenerator.modify(range, add, mult, power)` → copy `getHeights()`
  back onto `grid.cells.h`.
- Return `{ok, range, add, mult, power, cellsChanged}` (omit `power` from the
  body when undefined is cleaner? keep it — we report what we passed).
- Does NOT auto-regenerate downstream domains.

## Structure
Mirror `smooth-heightmap.ts`:
- `ModifyHeightmapRuntime` seam:
  `modify(range: string, add: number, mult: number, power: number | undefined)
   => {cellsChanged: number}`.
- `defaultModifyHeightmapRuntime` reads `window.grid` + `window.HeightmapGenerator`,
  guards both, snapshots before-heights, calls `setGraph/modify/getHeights`,
  writes `grid.cells.h`, diff-counts `cellsChanged`.
- Input validation:
  - `coerceRangeString(raw)` — accepts string (non-empty), number (coerced to
    String(n)), rejects anything else / empty. Further shape-check:
    `"all" | "land" | /^-?\d+(\.\d+)?-(-?\d+(\.\d+)?)?$/`? Keep it loose — just
    require non-empty string; the generator tolerates `+range.split("-")[0]`
    for plain numbers too. But we _do_ ensure we hand the generator a string.
  - `validateOptionalFiniteNumber(name, raw, fallback)` — undefined/null →
    fallback; non-finite / non-number → error. No hard range cap (generator
    clamps via `lim`), but reject NaN / Infinity.
  - `power` uses `validateOptionalFiniteNumber` with `undefined` fallback (no
    default).
- Identity-check: if `add === 0 && mult === 1 && (power === undefined || power
  === 0 || power === 1)` → error "must specify a non-identity add / mult /
  power".

## Re-exports (IMPORTANT)
Only re-export `modifyHeightmapTool` and `createModifyHeightmapTool` from
`src/ai/index.ts`. Do NOT re-export any `DEFAULT_*` constants — the prior
heightmap tools already re-export their own, and fresh `DEFAULT_*` re-exports
would trip TS2300 (duplicate identifier). Keep all shared-looking constants
module-internal to `modify-heightmap.ts`.

## Registration
Register in `buildDefaultRegistry()` right after `addTroughTool` (the current
last heightmap-mutation tool in the registry).

## Docs
Add a `README_AI.md` row immediately below `add_trough`, following the
`smooth_heightmap` / `add_hill` wording (includes an API-key reminder).
Include 2-3 usage examples covering all three operations.

## Tests
Mirror `smooth-heightmap.test.ts`:
- Tool-level tests with a fake runtime:
  - required `range` — missing/null/undefined/empty/whitespace → error;
  - numeric range coerced to string;
  - defaults: `add: 0`, `mult: 1`, `power: undefined` (but must have at least
    one explicit change — so at minimum pass e.g. `add: 5`);
  - identity inputs rejected (`range: "all"`, `add: 0`, `mult: 1` — no power);
  - non-finite `add` / `mult` / `power` rejected;
  - explicit forwarding (range "20-100", add 5, mult 0.5, power 1.2 → runtime
    receives those exact args);
  - runtime errors surfaced;
  - `modifyHeightmapTool` name + input-schema shape.
- `defaultModifyHeightmapRuntime` integration block (`globalThis as unknown as
  { grid?: unknown; HeightmapGenerator?: unknown }`):
  - missing grid, missing generator → throw;
  - happy path asserts `setGraph → modify → getHeights` call order, correct
    args forwarded, `grid.cells.h` reassigned, `cellsChanged` matches diff;
  - `getHeights()` returning null → throw.

## Verification gates
- `npm run build` (tsc + vite) succeeds.
- `npm test` — expect ~2140 + ~13 tests (new file only).
- `npm run lint` — must still produce exactly `7 warnings / 1 info / 0 errors`.

## Commit
`feat(ai): add modify_heightmap tool` + 1-2 line body. Stage only the new /
modified files.
