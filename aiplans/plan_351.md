# Plan 351 — `disrupt_heightmap` AI tool

## Use case

The Heightmap Editor exposes a "Disrupt all" brush button bound to
`disruptAllHeights` (`public/modules/ui/heightmap-editor.js:795`):

```js
function disruptAllHeights() {
  grid.cells.h = grid.cells.h.map(h => (h < 15 ? h : lim(h + 2.5 - Math.random() * 4)));
  updateHeightmap();
}
```

It walks every cell in `grid.cells.h`, leaves water cells (height < 15)
untouched, and adds a random offset in `(-1.5, +2.5]` to each land
cell, clamped via `lim()` (the global `(v) => minmax(v, 0, 100)` from
`src/utils/numberUtils.ts:28`). The result REASSIGNS `grid.cells.h` to
a brand-new typed array (the typed-array `.map` returns a NEW
`Uint8Array`), then triggers `updateHeightmap()` for the redraw.

The user can already click this in the UI. The AI cannot. We already
have `smooth_heightmap`, `clear_heightmap`, `invert_heightmap`,
`mask_heightmap`, `modify_heightmap`, `set_cell_height`,
`set_heightmap_template`, `set_heightmap_options`, and
`set_height_exponent`. This plan adds the missing **disrupt** action —
useful for breaking up overly smooth terrain after smoothing or for
adding micro-variation before re-running biome / river generation.

## Lint baseline (before any changes)

`npm run lint` on plan-351 base (`master @ ecc80ef`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 805 files in 661ms. No fixes applied.
```

Clean. No warnings, no errors. Post-implementation lint must remain
clean.

## Tool name

`disrupt_heightmap`

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No inputs. The legacy button takes no arguments and we mirror that
exactly. (Configurability — magnitude, water threshold, seed — is
out of scope; follow-up plans can extend.)

## Behavior

1. Verify `grid.cells.h` exists (typed-array-like with `.length` and
   numeric index access). Error if not.
2. For each height value in `grid.cells.h`:
   - If `h < 15`, leave it.
   - Otherwise replace with `clamp(h + 2.5 - random() * 4, 0, 100)`
     — equivalent to `lim(...)` in the legacy code, with `clamp()`
     and `random()` provided by the runtime so tests are deterministic.
3. **Reassign** `grid.cells.h = grid.cells.h.map(...)` — this is the
   exact legacy semantic. `Uint8Array.prototype.map` returns a NEW
   Uint8Array of the same kind, with values truncated to 0-255 (and,
   because the heights are bounded to [0,100] beforehand, stored as
   integers 0-100 — fractional results from `lim(...)` are floored
   when the typed array stores them).
4. Best-effort: call `updateHeightmap()` if it is exposed as a global
   (the editor-internal closure typically isn't, so this is a silent
   no-op in production today; keeps the door open if it ever gets
   exposed). Errors thrown by `updateHeightmap()` are swallowed —
   the disrupt itself succeeded and rendering hiccups must not
   surface as tool failures.
5. Tool takes no input — `properties: {}`, no `required`.

### Statistics returned

To aid the LLM in reasoning about the magnitude of the disruption,
the tool returns:

- `land_cells` — count of cells with `h >= 15` BEFORE the disrupt.
- `water_cells` — count of cells with `h < 15` BEFORE the disrupt.
- `min_delta`, `max_delta` — min/max of `(new_h - old_h)` over land
  cells (post-clamp, post-typed-array-truncation, so these can deviate
  from the theoretical (-1.5, 2.5] when heights hit the 0/100 walls
  or fractional offsets get truncated to integer storage).
- `mean_abs_delta` — average of `|new_h - old_h|` over land cells
  (0 when there are no land cells).

### Note on the water boundary

`lim` clamps to [0, 100], NOT to [15, 100]. A land cell with h=15
plus delta=-1.49 becomes 13.51, stored as 13 in the Uint8Array. So a
land cell CAN cross the water boundary downward as a result of the
disrupt. We document this rather than mask it — it matches the legacy
behavior verbatim.

## Validation / error catalog

- `window.grid` missing or `grid.cells.h` missing →
  `"window.grid.cells.h is not available; the map hasn't finished
  loading."`
- Runtime errors during the actual disrupt (e.g. typed-array `.map`
  throws) are propagated verbatim via `errorResult(err.message)`.
- `lim` global missing → fall back to a local `clamp(v, 0, 100)`. We
  do NOT error in that case, because the local clamp is semantically
  identical and the global only exists when `src/utils/index.ts` has
  loaded (which it does in production but might not in a stripped
  test environment).
- `updateHeightmap()` global missing or throws → no error (best-effort).

## Success result

```jsonc
{
  "ok": true,
  "land_cells": 5,        // cells with h >= 15 before the disrupt
  "water_cells": 3,       // cells with h < 15 before the disrupt
  "min_delta": -1,        // min of (new_h - old_h) across land cells
  "max_delta": 2,         // max of (new_h - old_h) across land cells
  "mean_abs_delta": 0.6   // average |new_h - old_h| across land cells
}
```

When `land_cells` is 0 (entire map is water), `min_delta`,
`max_delta`, and `mean_abs_delta` are all 0.

## Files to add

- `src/ai/tools/disrupt-heightmap.ts` — tool implementation.
- `src/ai/tools/disrupt-heightmap.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Import alphabetically — slot under `d`, between
    `countReliefIconsTool` and `exportMapTool`:
    `import { disruptHeightmapTool } from "./tools/disrupt-heightmap";`
  - Add re-export block alphabetically (between
    `count-relief-icons` and `export-map`):
    ```
    export {
      type DisruptHeightmapRuntime,
      disruptHeightmapTool,
      createDisruptHeightmapTool,
      defaultDisruptHeightmapRuntime,
    } from "./tools/disrupt-heightmap";
    ```
  - Add `registry.register(disruptHeightmapTool);` next to the other
    heightmap-mutator registrations (smooth/mask/invert/clear).

## Runtime-injection seam

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface DisruptHeightmapRuntime {
  getGridHeights(): ArrayLike<number> & {
    map(fn: (h: number, i: number) => number): ArrayLike<number>;
    length: number;
    [i: number]: number;
  };
  setGridHeights(heights: ArrayLike<number>): void;
  random(): number;
  clamp(v: number, min: number, max: number): number;
  updateHeightmap(): void;
}

export const defaultDisruptHeightmapRuntime: DisruptHeightmapRuntime;
export function createDisruptHeightmapTool(runtime?): Tool;
export const disruptHeightmapTool: Tool;
```

The default runtime:

- `getGridHeights()` reads `globalThis.grid.cells.h` and throws
  `"window.grid.cells.h is not available; the map hasn't finished
  loading."` if missing.
- `setGridHeights(arr)` reassigns `globalThis.grid.cells.h = arr`.
- `random()` delegates to `Math.random()`.
- `clamp()` uses the global `lim` if it is a function (the standard
  case), else falls back to `Math.min(Math.max(v, min), max)`. Note:
  the global `lim` always clamps to [0, 100] — we still pass the
  `[min, max]` range so the local fallback can use them, but in the
  global path the min/max parameters are effectively a no-op because
  we always pass [0, 100] anyway.
- `updateHeightmap()` reads `globalThis.updateHeightmap` and calls
  it if it's a function — silently swallows any throw.

## Tests (Vitest)

Mocked-runtime unit tests:

1. **Happy path (deterministic)**: 5 land cells (h=20,30,40,50,60) +
   3 water cells (h=0,5,14). Inject `random() = 0.5` → delta = `2.5
   - 0.5*4 = 0.5`. Expect each land cell incremented by 0.5; result
   stored in a new array (the typed-array semantics aren't exercised
   here because we use a plain Array for unit tests — the typed-array
   integer truncation is verified in the integration tests). Water
   cells unchanged.
2. **Water cells preserved**: cells [0, 5, 14] (all `< 15`) unchanged
   after disrupt.
3. **Clamp UPPER**: cell h=99 + delta=2.5 → 101 → clamped to 100.
4. **Clamp LOWER**: cell h=15 + delta=-1.5 → 13.5 → clamp to [0,100]
   leaves 13.5 (the lower clamp is at 0, NOT at 15 — mirrors the
   legacy `lim` semantics; document this in the test).
5. **REASSIGNMENT identity**: capture original ref of `grid.cells.h`
   before the call; verify after the call that `grid.cells.h` is a
   different reference AND the original array is untouched (its
   contents are still the pre-disrupt values).
6. **Empty grid (h.length = 0)**: ok with `land_cells: 0`,
   `water_cells: 0`, all deltas 0.
7. **All-water grid**: all heights `< 15`. ok with `land_cells: 0`,
   `mean_abs_delta: 0`, `min_delta: 0`, `max_delta: 0`.
8. **Missing `grid.cells.h`**: runtime throws → tool returns error
   with the canonical message.
9. **`updateHeightmap` missing**: no error (best-effort).
10. **`updateHeightmap` throws**: no error (best-effort) — disrupt
    still succeeds.
11. **`lim` missing**: default runtime falls back to local clamp;
    end-to-end clamp behavior verified (cell h=99 + delta=2.5 still
    clamps to 100).
12. **Random injection**: distinct values of `random()` produce the
    expected deltas (verifies that `random` is the injection point —
    no direct `Math.random` inside the disrupt loop).
13. **Tool shape**: name is `"disrupt_heightmap"`,
    `input_schema.type === "object"`, `properties` is `{}`,
    `required` is `undefined`.
14. **Registry round-trip**: `register(disruptHeightmapTool)` then
    `registry.list()` includes it.

Default-runtime integration tests (fake `globalThis.grid`):

15. **Throws when `window.grid` is missing**.
16. **Throws when `grid.cells.h` is missing**.
17. **Reassigns `grid.cells.h` (typed array)**: pre-populate with a
    `Uint8Array`, capture the reference, run, verify
    `grid.cells.h !== originalRef` AND the new value is a `Uint8Array`
    of the same length AND original ref is unchanged.
18. **Stats reflect the BEFORE classification**: a land cell that
    crosses to <15 after disrupt is still counted in `land_cells`;
    its delta is still included in min/max/mean.
19. **Falls back to local clamp when `lim` is missing**.

Also: register the tool with a fresh `ToolRegistry` and call it via
`registry.run("disrupt_heightmap", {})` — verify the result shape.

## Verification

- `npm test` — full suite, all tests pass.
- `npm run lint` — clean (matches baseline: 0 warnings, 0 errors).
- `npx tsc --noEmit` — clean.

## Self-review

Re-read pass after drafting this plan and the tasks file:

- The REASSIGNMENT identity test is present (test 5 in mocked,
  test 17 in integration) — the legacy code uses `grid.cells.h =
  grid.cells.h.map(...)`, NOT in-place mutation, and downstream
  callers may capture references to the array. We mirror this
  exactly via `setGridHeights`.
- Water cell preservation tested (test 2 in unit, also part of
  test 1's expectations).
- BOTH clamp directions tested (test 3 = upper, test 4 = lower).
- Random function abstracted via runtime (`random()`) so tests are
  deterministic — no direct `Math.random` calls inside the disrupt
  loop.
- The water-boundary subtlety (`lim` clamps to [0,100], NOT [15,100],
  so a land cell can downcross to "water" after disrupt) is
  explicitly documented in the test description and the plan.
- The `updateHeightmap()` best-effort is genuinely best-effort:
  missing → silent skip; throws → silent skip. This matches our other
  rendering-side hooks where the data mutation must succeed
  independently of the renderer.
- Stats are computed from the BEFORE classification (a land cell
  that drops below 15 after disrupt is still classified as land for
  stat-counting purposes). This is the most useful semantic for the
  LLM — it tells the LLM "I disrupted N land cells, here's how much
  they moved" — and matches what the legacy `disruptAllHeights`
  conceptually does (it skips the BEFORE-water cells).
- Error wording matches the constraint exactly:
  `"window.grid.cells.h is not available; the map hasn't finished
  loading."`
- No edits outside the listed files.
- Commit message: `feat(ai): add disrupt_heightmap tool`.
