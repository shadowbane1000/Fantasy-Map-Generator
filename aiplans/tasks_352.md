# Tasks 352 — `set_distance_scale`

Plan ref: `aiplans/plan_352.md`. Worktree:
`/workspace/.claude/worktrees/plan-352` on branch
`plan-352-set-distance-scale`, based on master @ 5e1617c.

## Setup

- [x] Verify worktree on branch `plan-352-set-distance-scale`.
- [x] Capture lint baseline → `aiplans/plan_352.md` (clean: 809 files
  checked, no fixes / warnings / errors).
- [x] Verify `var distanceScale` (NOT `let`) at `public/main.js:241`
  — no DOM-shadow fix needed.
- [x] Verify `id="distanceScaleInput"` (input) and `id="lock_distanceScale"`
  (lock icon) exist in `src/index.html`; bare `id="distanceScale"`
  does NOT — no DOM-shadow on the bare name.

## Plan + tasks + self-review

- [x] Write `aiplans/plan_352.md`.
- [x] Write `aiplans/tasks_352.md`.
- [x] Self-review: re-read both, verify
  - REASSIGNMENT identity test is present (`globalThis.distanceScale === scale`),
  - `previous` captured BEFORE mutation tested,
  - both side-effect callbacks (`renderScaleBar`,
    `calculateFriendlyGridSize`) tested individually AND together,
  - both can be missing without erroring,
  - DOM-shadow check on `public/main.js` performed.
  Document corrections in `plan_352.md` "## Self-review".

## Implementation

- [ ] `public/main.js`:
  - Convert `let scaleBar` → `var scaleBar` (line 38) — exposes to
    globalThis AND overwrites the DOM-id shadow from
    `<g id="scaleBar">` in `src/index.html:393`.
  - Convert `let scale = 1;` (line 171, zoom-behavior block) →
    `var scale = 1;` — exposes the current zoom factor.
- [ ] Create `src/ai/tools/set-distance-scale.ts`:
  - Imports from `./_shared` (`errorResult`, `getGlobal`, `okResult`)
    and `./index` (`Tool`, `ToolResult`).
  - Constants: `MIN_DISTANCE_SCALE_EXCLUSIVE = 0`,
    `MAX_DISTANCE_SCALE = 1000`.
  - `DistanceScaleRuntime` interface:
    `getDistanceScale()`, `setDistanceScale(value)`,
    optional `setDomInputValue(id, value)`,
    optional `renderScaleBar()`,
    optional `calculateFriendlyGridSize()`.
  - `defaultDistanceScaleRuntime`:
    - `getDistanceScale()` → `getGlobal<number>("distanceScale")`.
    - `setDistanceScale(v)` → `(globalThis as any).distanceScale = v;`
    - `setDomInputValue(id, v)`: if `typeof document !== "undefined"`,
      set `document.getElementById(id)?.value = String(v)`.
    - `renderScaleBar()`: best-effort call to `drawScaleBar` +
      `fitScaleBar` globals (silent on missing / throws).
    - `calculateFriendlyGridSize()`: best-effort call to global
      function (silent on missing / throws).
  - `createSetDistanceScaleTool(runtime?)` factory:
    - Validate `scale` is a finite number > 0 and ≤ 1000.
      Otherwise return `errorResult("scale must be a finite number > 0 and <= 1000.")`.
    - Capture `previous = runtime.getDistanceScale()` BEFORE mutation.
    - Try `runtime.setDistanceScale(scale)` — propagate any throw
      via `errorResult(err.message)` (load-bearing).
    - Best-effort: `runtime.setDomInputValue?.("distanceScaleInput", scale)`,
      `runtime.renderScaleBar?.()`, `runtime.calculateFriendlyGridSize?.()`
      — wrap each in its own try/catch and swallow.
    - Return `okResult({ previous, scale })` if `previous !== undefined`,
      else `okResult({ scale })`.
  - Exported `setDistanceScaleTool` instance (no-arg factory).
  - Tool description references the editor's "Distance scale"
    slider (`changeDistanceScale` in `units-editor.js:52`), the
    multiplier semantics ("kilometres/miles per internal grid unit"),
    and the recommended range.
- [ ] Create `src/ai/tools/set-distance-scale.test.ts` with all 27
  test cases enumerated in plan section "Tests".
- [ ] Wire into `src/ai/index.ts`:
  - Add import alphabetically (between `setDiplomacyTool` and
    `setEmblemPositionTool`):
    `import { setDistanceScaleTool } from "./tools/set-distance-scale";`
  - Add re-export block alphabetically (between `set-diplomacy`
    and `set-emblem-position`).
  - Add `registry.register(setDistanceScaleTool);` next to
    `setDiplomacyTool` registration.

## Verification

- [ ] `npm test` — all green, no regressions.
- [ ] `npm run lint` — clean (matches baseline exactly).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `src/ai/tools/_shared/global-exposure.test.ts` seam test still
  passes — `getGlobal("distanceScale")` is satisfied by
  `var distanceScale` at `public/main.js:241`.

## Commit

- [ ] Stage only:
  - `src/ai/tools/set-distance-scale.ts`
  - `src/ai/tools/set-distance-scale.test.ts`
  - `src/ai/index.ts`
  - `public/main.js` (let → var fixes for `scaleBar`, `scale`)
  - `aiplans/plan_352.md`
  - `aiplans/tasks_352.md`
- [ ] Commit message:
  ```
  feat(ai): add set_distance_scale tool

  Implements plan 352. Adds an AI chat tool that sets the global
  distanceScale and refreshes the scale bar + friendly grid size,
  mirroring the "Distance scale" input in the units editor.
  ```
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  other pre-existing dirty file outside the worktree.

## Caveats / open questions

- `renderScaleBar` in `units-editor.js:14-17` is a CLOSURE inside
  `editUnits()`, not a global. Default runtime calls the underlying
  `drawScaleBar` + `fitScaleBar` globals directly, which is
  semantically equivalent.
- `var distanceScale` in `public/main.js:241` correctly attaches to
  `globalThis`. There is no DOM element with bare `id="distanceScale"`,
  so no shadow. We still write through `globalThis.distanceScale`
  defensively per plan-349 convention.
- Hard cap of 1000 is judgemental — the slider only goes to 20, but
  saved maps and tool callers shouldn't be artificially limited to
  the slider range. 1000 is generous enough for any plausible map
  and small enough to flag clearly bogus values.
