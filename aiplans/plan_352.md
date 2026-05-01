# Plan 352 — `set_distance_scale` AI tool

## Use case

The Units Editor's "Distance scale" slider is bound to
`changeDistanceScale` (`public/modules/ui/units-editor.js:52`):

```js
function changeDistanceScale() {
  distanceScale = +this.value;
  renderScaleBar();
  calculateFriendlyGridSize();
}
```

It reassigns the global `distanceScale` (the multiplier converting
internal grid units to real-world distance units like miles or
kilometres), then refreshes the on-map ruler (`renderScaleBar` →
`drawScaleBar` + `fitScaleBar`) and the displayed friendly grid spacing
(`calculateFriendlyGridSize`).

The user can already trigger this via the slider in the Units editor.
The AI cannot. We already have `set_measurement_units` (which sets unit
*names* like mi/km but NOT the numeric scale), `get_measurement_units`,
and `measure_distance` (which uses `distanceScale` internally). This
plan adds the missing **distance scale (multiplier)** setter.

`distanceScale` is declared at `public/main.js:241` as
`var distanceScale = +byId("distanceScaleInput").value;` — `var`
attaches to `globalThis`, so no DOM-shadow fix is required (verified;
the slider element has `id="distanceScaleInput"`, NOT `id="distanceScale"`).
The `id="lock_distanceScale"` icon next to the slider is unrelated.

## Lint baseline (before any changes)

`npm run lint` on plan-352 base (`master @ 5e1617c`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 809 files in 648ms. No fixes applied.
```

Clean. No warnings, no errors. Post-implementation lint must remain
clean.

## Tool name

`set_distance_scale`

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "scale": {
      "type": "number",
      "exclusiveMinimum": 0,
      "maximum": 1000,
      "description": "Distance scale multiplier (kilometres/miles per internal grid unit). Must be > 0; recommended range 0.5 – 50."
    }
  },
  "required": ["scale"]
}
```

The slider in `src/index.html:5265` is
`min=".01" max="20" step=".1" value="3"`. The legacy `restoreDefaultUnits`
resets to `3`. We accept a wider range (0, 1000] to allow:

- Bigger maps where the user wants very large per-cell distances.
- Smaller-than-slider values (the tool isn't bound by the UI).

We document `0.5 – 50` as the recommended range in the description so
the LLM doesn't routinely pick wild values, but accept up to 1000 as a
sane absolute hard cap (above this, `measure_distance` results would
overflow most user expectations).

## Behavior

1. Validate `scale` is a finite number `> 0` and `<= 1000`.
   - Reject NaN, Infinity, negatives, zero, strings, missing.
2. Capture `previous = getDistanceScale()` BEFORE mutation.
3. Call `runtime.setDistanceScale(scale)` — default impl writes
   `globalThis.distanceScale = scale` (CRITICAL: through `globalThis`
   to defeat any DOM-shadow risk; in this case there is none, but
   we follow the plan-349 convention defensively).
4. Best-effort: call `runtime.setDomInputValue("distanceScaleInput", scale)`
   so the editor's text input shows the new value if it's open.
5. Best-effort: call `runtime.renderScaleBar()` if the global is
   available. (The legacy `renderScaleBar` is a closure inside
   `editUnits()`, NOT global; instead we call `drawScaleBar` +
   `fitScaleBar` directly — both are exposed via
   `src/renderers/draw-scalebar.ts:144-145`.)
6. Best-effort: call `runtime.calculateFriendlyGridSize()` if the
   global is available. (`public/modules/ui/style.js:534` is a
   top-level `function` so it's globally available.)
7. Return summary.

## Validation / error catalog

- `scale` missing / non-number / not finite / `<= 0` / `> 1000` →
  `"scale must be a finite number > 0 and <= 1000."`
- Runtime errors (e.g. `setDistanceScale` throws) propagate verbatim
  via `errorResult(err.message)`.
- DOM input update / scale-bar render / friendly-grid-size compute
  are best-effort: missing globals → silent skip; throws → silent skip.
  Only the actual reassignment of `globalThis.distanceScale` is
  load-bearing for success.

## Success result

```jsonc
{
  "ok": true,
  "previous": 3,
  "scale": 5.5
}
```

`previous` is captured BEFORE the mutation. If the runtime cannot read
the previous value (e.g. `globalThis.distanceScale` is undefined), it
returns `undefined` and the `previous` field is omitted from the result.

## Files to add

- `src/ai/tools/set-distance-scale.ts` — tool implementation.
- `src/ai/tools/set-distance-scale.test.ts` — Vitest tests.

## Files to edit

- `public/main.js`:
  - Convert `let scaleBar = svg.select("#scaleBar");` →
    `var scaleBar = ...` so the D3 selection attaches to `globalThis`
    AND overwrites the DOM-id shadow from `<g id="scaleBar">` in
    `src/index.html:393`. Same fix pattern as plan 349 for `coastline`.
  - Convert `let scale = 1;` (zoom-behavior block, line 171) →
    `var scale = 1;` so the current zoom factor attaches to
    `globalThis`. No DOM-shadow on this name.
- `src/ai/index.ts`:
  - Import alphabetically — slot under `set-d`, between
    `setDiplomacyTool` and `setEmblemPositionTool` (alphabetically
    `set-d-i-p` < `set-d-i-s` < `set-e`):
    `import { setDistanceScaleTool } from "./tools/set-distance-scale";`
  - Add re-export block alphabetically (between `set-diplomacy`
    and `set-emblem-position`):
    ```
    export {
      createSetDistanceScaleTool,
      defaultDistanceScaleRuntime,
      type DistanceScaleRuntime,
      MAX_DISTANCE_SCALE,
      MIN_DISTANCE_SCALE_EXCLUSIVE,
      setDistanceScaleTool,
    } from "./tools/set-distance-scale";
    ```
  - Add `registry.register(setDistanceScaleTool);` next to
    `setDiplomacyTool` registration.

## Runtime-injection seam

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const MIN_DISTANCE_SCALE_EXCLUSIVE = 0;
export const MAX_DISTANCE_SCALE = 1000;

export interface DistanceScaleRuntime {
  getDistanceScale(): number | undefined;
  setDistanceScale(value: number): void;
  setDomInputValue?(id: string, value: number): void;
  renderScaleBar?(): void;
  calculateFriendlyGridSize?(): void;
}

export const defaultDistanceScaleRuntime: DistanceScaleRuntime;
export function createSetDistanceScaleTool(runtime?): Tool;
export const setDistanceScaleTool: Tool;
```

Default runtime:

- `getDistanceScale()` returns `getGlobal<number>("distanceScale")`.
- `setDistanceScale(v)` writes `(globalThis as any).distanceScale = v`.
- `setDomInputValue(id, v)` if `document` is defined and
  `getElementById(id)` exists, sets `el.value = String(v)`. Silent
  no-op otherwise.
- `renderScaleBar()` — calls `globalThis.drawScaleBar(globalThis.scaleBar, globalThis.scale)`
  then `globalThis.fitScaleBar(globalThis.scaleBar, globalThis.svgWidth, globalThis.svgHeight)`,
  silently skipping if any are missing or throws. (Mirrors the
  closure in `units-editor.js:14-17`.)
- `calculateFriendlyGridSize()` — calls
  `globalThis.calculateFriendlyGridSize()` if it's a function;
  swallows throws.

## Tests (Vitest)

Mocked-runtime unit tests:

1. **Happy path**: `getDistanceScale → 3`, call with `scale: 5` →
   `setDistanceScale` invoked with 5, `previous === 3`, `scale === 5`.
2. **Boundary low (0.001)**: just above 0 → accepted.
3. **Boundary high (1000)**: max value → accepted.
4. **Reject 0**: `scale: 0` → error
   `"scale must be a finite number > 0 and <= 1000."`,
   `setDistanceScale` not called.
5. **Reject negative**: `scale: -1` → error.
6. **Reject NaN**: `scale: NaN` → error.
7. **Reject Infinity**: `scale: Infinity` → error.
8. **Reject string**: `scale: "3"` → error.
9. **Reject above max**: `scale: 1001` → error.
10. **Missing scale**: `{}` → error.
11. **previous captured BEFORE mutation**: arrange a runtime where
    `getDistanceScale` returns `7` only on the FIRST call, then
    `999`; verify the result's `previous` is `7` (proving we read
    once before mutating, not after).
12. **previous omitted when undefined**: runtime returns `undefined` →
    result is `{ ok: true, scale: 5 }` (no `previous` key).
13. **Side-effects called when present**: with all three optional
    callbacks injected, all three are invoked exactly once with the
    right args.
14. **Side-effects all-missing**: omit all three optional callbacks
    → no error, mutation still applied.
15. **renderScaleBar throws → no error surfaced**: best-effort —
    success is reported, mutation still applied. (Matches plan-351's
    best-effort discipline.)
16. **calculateFriendlyGridSize throws → no error surfaced**.
17. **setDomInputValue throws → no error surfaced**.
18. **setDistanceScale throws → error propagated**: the load-bearing
    setter must not be swallowed.
19. **Tool shape**: name is `"set_distance_scale"`,
    `input_schema.required === ["scale"]`,
    `input_schema.properties.scale.exclusiveMinimum === 0`,
    `input_schema.properties.scale.maximum === 1000`.
20. **Registry round-trip**: `register(setDistanceScaleTool)` then
    `registry.list()` includes it.

Default-runtime integration tests (using `globalThis.distanceScale`):

21. **Reassigns `globalThis.distanceScale`**: pre-set to 3, run with
    `scale: 5.5`; verify `globalThis.distanceScale === 5.5` AFTER and
    `previous === 3` in the result. This is the plan-349-style
    REASSIGNMENT verification.
22. **DOM input updated when present**: stub `document.getElementById`
    so `#distanceScaleInput` returns a fake input; verify
    `el.value === "5"`.
23. **DOM input update tolerated when absent**: stub
    `getElementById` to return `null`; verify no error.
24. **renderScaleBar best-effort**: stub `drawScaleBar` +
    `fitScaleBar` as `vi.fn`s; verify both called.
25. **calculateFriendlyGridSize best-effort**: stub
    `globalThis.calculateFriendlyGridSize` as `vi.fn`; verify called.
26. **All side-effects missing — still ok**: clear all globals,
    confirm `globalThis.distanceScale` still gets reassigned.
27. **Both renderScaleBar AND calculateFriendlyGridSize called**:
    when both are present, both are invoked exactly once.

## Verification

- `npm test` — full suite, all tests pass.
- `npm run lint` — clean (matches baseline: 0 warnings, 0 errors).
- `npx tsc --noEmit` — clean.
- `src/ai/tools/_shared/global-exposure.test.ts` seam test still
  passes — adding `getGlobal("distanceScale")` is fine because
  `var distanceScale` at top of `public/main.js:241` exposes it.

## Self-review

Re-read pass after drafting this plan and the tasks file:

- DURING IMPLEMENTATION: the `getGlobal` seam test caught two latent
  globals my default runtime needed (`scaleBar`, `scale`), both of
  which were declared with `let` in `public/main.js` and never
  attached to `globalThis`. `scaleBar` was additionally DOM-shadowed
  by `<g id="scaleBar">` in `src/index.html:393`. Fix mirrors plan
  349's `coastline` fix: convert both to `var`. The `var` reassignment
  during script execution overwrites the DOM-shadow slot for
  `scaleBar`. Documented in "Files to edit".
- The REASSIGNMENT semantic is tested (test 21 in integration:
  `globalThis.distanceScale === 5.5` AFTER call, AND `previous === 3`
  captured pre-mutation).
- Both side-effect callbacks tested individually (24, 25) AND
  together (27); both can be missing without erroring (14, 26);
  each can throw without surfacing (15, 16, 17).
- previous captured BEFORE mutation explicitly tested (test 11 uses
  a runtime that returns different values on consecutive calls).
- previous omitted when undefined tested (12).
- DOM-shadow check: searched `public/main.js` —
  `var distanceScale = +byId("distanceScaleInput").value;` is `var`
  (not `let` / `const`), so it attaches to `globalThis` correctly.
  Searched `src/index.html` — `id="distanceScaleInput"` (input
  element) and `id="lock_distanceScale"` (lock icon) exist, but
  NEITHER matches the bare name `distanceScale`, so there is no
  DOM-shadow on `globalThis.distanceScale`. No fix needed in main.js.
- Default runtime defensively writes via `globalThis.distanceScale = v`
  (not via a let-shadowed local) per the plan-349 convention even
  though there's no DOM shadow today.
- The legacy `renderScaleBar()` is a CLOSURE inside `editUnits()` —
  not on `globalThis`. Default runtime calls the underlying
  `drawScaleBar` + `fitScaleBar` globals directly (exposed in
  `src/renderers/draw-scalebar.ts:144-145`) instead. Documented.
- `calculateFriendlyGridSize` is top-level in
  `public/modules/ui/style.js:534`, available globally.
- Error message wording matches the constraint exactly:
  `"scale must be a finite number > 0 and <= 1000."`.
- Registry registration adjacent to peer setter `setDiplomacyTool`.
- No edits outside the listed files.
- Commit message: `feat(ai): add set_distance_scale tool`.
