# Tasks 351 — `disrupt_heightmap`

Plan ref: `aiplans/plan_351.md`. Worktree:
`/workspace/.claude/worktrees/plan-351` on branch
`plan-351-disrupt-heightmap`, based on master @ ecc80ef.

## Setup

- [x] Verify worktree on branch `plan-351-disrupt-heightmap`.
- [x] Capture lint baseline → `aiplans/plan_351.md` (clean: 805 files
  checked, no fixes / warnings / errors).

## Plan + tasks + self-review

- [x] Write `aiplans/plan_351.md`.
- [x] Write `aiplans/tasks_351.md`.
- [x] Self-review: re-read both, verify
  - REASSIGNMENT identity test is present (mocked + integration),
  - water-cell preservation tested (h < 15 unchanged),
  - both clamp directions tested (upper + lower),
  - random function abstracted via runtime for deterministic tests.
  Document corrections in `plan_351.md` "## Self-review".

## Implementation

- [ ] Create `src/ai/tools/disrupt-heightmap.ts`:
  - Imports from `./_shared` and `./index`.
  - `DisruptHeightmapRuntime` interface: `getGridHeights`,
    `setGridHeights`, `random`, `clamp`, `updateHeightmap`.
  - `defaultDisruptHeightmapRuntime`:
    - `getGridHeights()` reads `globalThis.grid.cells.h` and throws
      `"window.grid.cells.h is not available; the map hasn't finished
      loading."` if missing.
    - `setGridHeights(arr)` reassigns `globalThis.grid.cells.h = arr`.
    - `random()` → `Math.random()`.
    - `clamp(v, min, max)` → uses global `lim` if available, else
      `Math.min(Math.max(v, min), max)`.
    - `updateHeightmap()` → call global if function; swallow throws.
  - `createDisruptHeightmapTool(runtime?)` factory:
    - Calls `runtime.getGridHeights()` — propagate the throw.
    - Counts `landBefore`, `waterBefore` and captures the `before`
      values for delta tracking.
    - Calls `before.map(...)` (typed-array `.map` returns a new
      typed array of the same kind) using `runtime.random()` and
      `runtime.clamp(...)` for each land cell.
    - Calls `runtime.setGridHeights(next)`.
    - Computes stats:
      - `min_delta` = min of `(next[i] - before[i])` over land cells.
      - `max_delta` = max of `(next[i] - before[i])` over land cells.
      - `mean_abs_delta` = mean of `|next[i] - before[i]|` over land
        cells.
      - All zero when `landBefore === 0`.
    - Calls `runtime.updateHeightmap()` (best-effort).
    - Returns `okResult({ land_cells, water_cells, min_delta,
      max_delta, mean_abs_delta })`.
    - Errors during `getGridHeights` / `setGridHeights` propagate as
      `errorResult(err.message)`.
  - Exported `disruptHeightmapTool` instance (no-arg factory).
  - Tool description references the editor's "Disrupt all" button
    (`disruptAllHeights` in `heightmap-editor.js:795`), the
    `(-1.5, +2.5]` delta range, the water-cell preservation
    (`h < 15` skipped), the `[0, 100]` clamp via `lim`, the
    REASSIGNMENT semantic (typed-array `.map` returns a new array),
    and the "does NOT auto-regenerate downstream" caveat consistent
    with other heightmap mutator tools.
- [ ] Create `src/ai/tools/disrupt-heightmap.test.ts` with all 19
  test cases enumerated in plan section "Tests".
- [ ] Wire into `src/ai/index.ts`:
  - Add import alphabetically (between `countReliefIconsTool` and
    `exportMapTool`).
  - Add re-export block alphabetically (between `count-relief-icons`
    and `export-map`).
  - Add `registry.register(disruptHeightmapTool);` adjacent to
    `smoothHeightmapTool` / `maskHeightmapTool` /
    `invertHeightmapTool` / `clearHeightmapTool` registrations.

## Verification

- [ ] `npm test` — all green, no regressions.
- [ ] `npm run lint` — clean (matches baseline exactly).
- [ ] `npx tsc --noEmit` — clean.

## Commit

- [ ] Stage only:
  - `src/ai/tools/disrupt-heightmap.ts`
  - `src/ai/tools/disrupt-heightmap.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_351.md`
  - `aiplans/tasks_351.md`
- [ ] Commit message:
  ```
  feat(ai): add disrupt_heightmap tool

  Implements plan 351. Adds an AI chat tool that adds (-1.5, 2.5]
  clamped noise to every land cell's height in grid.cells.h, mirroring
  the "Disrupt all" button in the heightmap editor.
  ```
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  other pre-existing dirty file outside the worktree.

## Caveats / open questions

- `updateHeightmap` is editor-internal (a closure inside
  `heightmap-editor.js`) and not exposed on `globalThis` today. The
  best-effort hook is forward-looking: if the editor ever exposes
  it, the tool gains the redraw automatically. In production today
  this is a silent no-op — same as the sibling `smooth_heightmap` /
  `clear_heightmap` / `mask_heightmap` / `invert_heightmap` tools,
  which also do not redraw and document "does NOT auto-regenerate
  downstream" in their descriptions.
- The water-boundary subtlety (`lim` clamps to [0, 100], not
  [15, 100], so a land cell can downcross to "water" after disrupt)
  is preserved verbatim from the legacy code. Documented in plan.
- Stats are computed from the BEFORE classification — a cell that
  starts at h=15 and ends at h=13 still counts as a land cell for
  the min/max/mean stats. This is the most useful framing for the
  LLM ("I disrupted N land cells, here's their movement").
