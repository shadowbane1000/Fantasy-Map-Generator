# Plan 365: `restore_default_units` tool

## Use case

Add an AI chat tool `restore_default_units` that resets every measurement
unit, scale, and rate to its default. This mirrors the legacy
`restoreDefaultUnits` function in `public/modules/ui/units-editor.js`
(lines 88-120):

```js
function restoreDefaultUnits() {
  distanceScale = 3;
  byId("distanceScaleInput").value = distanceScale;
  unlock("distanceScale");

  // units
  const US = navigator.language === "en-US";
  const UK = navigator.language === "en-GB";
  distanceUnitInput.value = US || UK ? "mi" : "km";
  heightUnit.value = US || UK ? "ft" : "m";
  temperatureScale.value = US ? "°F" : "°C";
  areaUnit.value = "square";
  localStorage.removeItem("distanceUnit");
  localStorage.removeItem("heightUnit");
  localStorage.removeItem("temperatureScale");
  localStorage.removeItem("areaUnit");
  calculateFriendlyGridSize();

  // height exponent
  heightExponentInput.value = 1.8;
  localStorage.removeItem("heightExponent");
  calculateTemperatures();

  renderScaleBar();

  // population
  populationRate = populationRateInput.value = 1000;
  urbanization = urbanizationInput.value = 1;
  urbanDensity = urbanDensityInput.value = 10;
  localStorage.removeItem("populationRate");
  localStorage.removeItem("urbanization");
  localStorage.removeItem("urbanDensity");
}
```

The user can already trigger this via the **Restore** button in the
units editor. The AI cannot — until now.

The legacy code resets nine fields (in three groups):

1. `distanceScale = 3` — global reassignment + `<input id="distanceScaleInput">`.
2. `distanceUnit` — `<input id="distanceUnitInput">.value` ("mi" or "km").
3. `heightUnit` — `<input id="heightUnit">.value` ("ft" or "m").
4. `temperatureScale` — `<input id="temperatureScale">.value` ("°F" or "°C").
5. `areaUnit` — `<input id="areaUnit">.value` ("square").
6. `heightExponent` — `<input id="heightExponentInput">.value` (1.8).
7. `populationRate = 1000` — global reassignment + `<input id="populationRateInput">`.
8. `urbanization = 1` — global reassignment + `<input id="urbanizationInput">`.
9. `urbanDensity = 10` — global reassignment + `<input id="urbanDensityInput">`.

It also removes eight `localStorage` keys (one per item except
`distanceScale`, which is unlocked instead) and calls three side-effect
helpers: `unlock("distanceScale")`, `calculateFriendlyGridSize()`,
`calculateTemperatures()`, and `renderScaleBar()`.

**Decision: always METRIC defaults.** The legacy code branches on
`navigator.language` so en-US / en-GB users get imperial. For the AI
tool we drop the navigator-language detection and always reset to
metric (km / m / °C). Rationale: (1) the AI is a model in a server
process — `navigator.language` isn't a meaningful signal; (2) metric
matches the project's underlying internal units; (3) the AI can call
`set_measurement_units` afterwards if it wants imperial. Documented in
the tool description.

We already have these AI unit tools:

- `set_distance_scale` (plan 352) — reassigns `globalThis.distanceScale`
  + DOM input + `renderScaleBar` + `calculateFriendlyGridSize`.
- `set_area_unit` (plan 353) — DOM input + localStorage.
- `set_measurement_units` — distance/height/temperature units + localStorage.
- `set_height_exponent` — DOM input + localStorage.
- `set_world_rates` — population/urbanization/urbanDensity DOM inputs.

This plan adds the missing **reset-everything-to-defaults** macro —
analogous to `restore_default_namesbases` (plan 332) and
`restore_default_biomes` (plan 358).

## Lint baseline

`cd /workspace/.claude/worktrees/plan-365 && npm run lint 2>&1 | tail -10`
on the worktree base (master @ 9eabd47, branch
`plan-365-restore-default-units`, working tree clean) reports:

```
Checked 833 files in 679ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- The tool takes no arguments.

- For each of the nine fields, capture the `previous` value BEFORE
  mutation:
  - `distanceScale` from `globalThis.distanceScale` (number) — best
    effort, may be undefined.
  - `distanceUnit` from `<input id="distanceUnitInput">.value` (string)
    — null if input missing.
  - `heightUnit` from `<input id="heightUnit">.value`.
  - `temperatureScale` from `<input id="temperatureScale">.value`.
  - `areaUnit` from `<input id="areaUnit">.value`.
  - `heightExponent` from `<input id="heightExponentInput">.value`
    (parsed to number; null if input missing or NaN).
  - `populationRate` from `globalThis.populationRate`.
  - `urbanization` from `globalThis.urbanization`.
  - `urbanDensity` from `globalThis.urbanDensity`.

- Apply METRIC defaults (no navigator.language detection):
  - `globalThis.distanceScale = 3`, `<input id="distanceScaleInput">.value = "3"`.
  - `<input id="distanceUnitInput">.value = "km"`.
  - `<input id="heightUnit">.value = "m"`.
  - `<input id="temperatureScale">.value = "°C"`.
  - `<input id="areaUnit">.value = "square"`.
  - `<input id="heightExponentInput">.value = "1.8"`.
  - `globalThis.populationRate = 1000`,
    `<input id="populationRateInput">.value = "1000"`.
  - `globalThis.urbanization = 1`,
    `<input id="urbanizationInput">.value = "1"`.
  - `globalThis.urbanDensity = 10`,
    `<input id="urbanDensityInput">.value = "10"`.

- For each of the eight `localStorage` keys, best-effort
  `localStorage.removeItem(key)`:
  - `distanceUnit`, `heightUnit`, `temperatureScale`, `areaUnit`,
    `heightExponent`, `populationRate`, `urbanization`, `urbanDensity`.
  - Missing `localStorage`: skip silently.
  - Throwing `removeItem` (security errors etc.): swallow.

- Best-effort: invoke `unlock("distanceScale")` if
  `globalThis.unlock` is callable (mirrors legacy line 91). Missing or
  throwing → skip.

- Best-effort: invoke each side-effect callback if present:
  - `calculateFriendlyGridSize()`
  - `calculateTemperatures()`
  - `renderScaleBar()`
  Each is wrapped: missing → skip; throws → swallow.

- Track which side-effect callbacks actually ran (called and didn't
  throw) in `side_effects_run: string[]`. The strings come from
  `["unlock", "calculateFriendlyGridSize", "calculateTemperatures",
  "renderScaleBar"]` in invocation order.

- Each per-field DOM mutation is itself best-effort: a missing input
  element doesn't fail the tool — that field's `previous` value comes
  back as `null` and the field is silently skipped on the apply side.
  Missing globals (e.g. `globalThis.distanceScale` is undefined on a
  pre-map session) are also fine: the global reassignment still
  succeeds (this is just `globalThis.X = Y`).

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

There is **no single "must exist" precondition** — this is a best-
effort reset. Many of these fields are pre-map globals (set during
options-panel boot, before the user generates a map), so we MUST NOT
gate on `pack`. We also MUST NOT gate on the presence of any single
DOM input — for an early-init session some inputs may be missing.

The tool only fails if a runtime helper itself throws unexpectedly
during its body (i.e. our own code, not user-supplied callbacks). All
external-surface failures (DOM lookups, global writes, localStorage,
side-effect callbacks) are individually wrapped.

### Errors (verbatim)

There are no field-level errors — every per-field operation is best-
effort. The tool can return an error only if a top-level runtime
contract throws unexpectedly:

- Any thrown error from the runtime helpers is propagated via
  `errorResult(err instanceof Error ? err.message : String(err))`.

In practice the default runtime catches everything internally, so the
tool should never error in production.

### Success result

`okResult({ ok: true, previous, applied, side_effects_run })`

Example after a session that had been heavily customized to imperial:

```jsonc
{
  "ok": true,
  "previous": {
    "distanceScale": 5,
    "distanceUnit": "mi",
    "heightUnit": "ft",
    "temperatureScale": "°F",
    "areaUnit": "ha",
    "heightExponent": 1.5,
    "populationRate": 1500,
    "urbanization": 1.2,
    "urbanDensity": 12
  },
  "applied": {
    "distanceScale": 3,
    "distanceUnit": "km",
    "heightUnit": "m",
    "temperatureScale": "°C",
    "areaUnit": "square",
    "heightExponent": 1.8,
    "populationRate": 1000,
    "urbanization": 1,
    "urbanDensity": 10
  },
  "side_effects_run": [
    "unlock",
    "calculateFriendlyGridSize",
    "calculateTemperatures",
    "renderScaleBar"
  ]
}
```

`applied` is always the canonical metric-defaults object — same nine
keys, same values, every call.

`previous` always has all nine keys; missing inputs / globals report
`null`.

`side_effects_run` is the subset of the four callbacks that actually
ran (in invocation order). Missing or throwing callbacks are omitted.

## Files

- **NEW** `src/ai/tools/restore-default-units.ts` — the tool, patterned
  on `restore-default-biomes.ts` and `set-distance-scale.ts`.
  Exports:
  - `interface RestoreDefaultUnitsApplied { distanceScale: number;
    distanceUnit: string; heightUnit: string; temperatureScale: string;
    areaUnit: string; heightExponent: number; populationRate: number;
    urbanization: number; urbanDensity: number; }`
  - `interface RestoreDefaultUnitsPrevious { distanceScale: number |
    null; distanceUnit: string | null; heightUnit: string | null;
    temperatureScale: string | null; areaUnit: string | null;
    heightExponent: number | null; populationRate: number | null;
    urbanization: number | null; urbanDensity: number | null; }`
  - `interface RestoreDefaultUnitsResult { previous:
    RestoreDefaultUnitsPrevious; applied: RestoreDefaultUnitsApplied;
    side_effects_run: string[]; }`
  - `interface RestoreDefaultUnitsRuntime { getDom(id: string): string
    | null; setDom(id: string, value: string): void; getGlobal(name:
    string): unknown; setGlobal(name: string, value: unknown): void;
    removeStorage(key: string): void; callIfPresent(name: string):
    boolean; }`
  - `defaultRestoreDefaultUnitsRuntime`:
    - `getDom(id)`: if `document` defined and `getElementById(id)` is
      an HTMLInputElement-like with a string `value`, return `value`;
      else `null`. Never throws.
    - `setDom(id, value)`: if `document` defined and `getElementById`
      returns an element with a `value` setter, write it. Never
      throws (best-effort).
    - `getGlobal(name)`: thin wrapper around `_shared.getGlobal`.
    - `setGlobal(name, value)`:
      `(globalThis as Record<string, unknown>)[name] = value;`.
    - `removeStorage(key)`: if `localStorage` defined, try
      `removeItem(key)` in a try/catch; swallow throws. If
      `localStorage` is undefined, no-op.
    - `callIfPresent(name)`: read
      `getGlobal<unknown>(name)`; if not a function, return `false`.
      Else invoke in a try/catch; return `true` on success, `false`
      on throw.
  - `createRestoreDefaultUnitsTool(runtime?)` returning a `Tool`
    named `restore_default_units`.
  - `restoreDefaultUnitsTool` — default-runtime instance.
  - `DEFAULT_UNITS` constant — the canonical applied object (frozen).
  - Field constants (DOM ids, storage keys, side-effect names) for
    test reuse.

- **NEW** `src/ai/tools/restore-default-units.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { restoreDefaultUnitsTool } from
    "./tools/restore-default-units";` immediately AFTER the existing
    `restoreDefaultNamesbasesTool` import (line 250). Alphabetical:
    `restore-default-n…` < `restore-default-u…`.
  - Add a re-export block immediately AFTER the existing
    `restore-default-namesbases` re-export (line 2261-2267):
    ```ts
    export {
      createRestoreDefaultUnitsTool,
      defaultRestoreDefaultUnitsRuntime,
      DEFAULT_UNITS,
      type RestoreDefaultUnitsApplied,
      type RestoreDefaultUnitsPrevious,
      type RestoreDefaultUnitsResult,
      type RestoreDefaultUnitsRuntime,
      restoreDefaultUnitsTool,
    } from "./tools/restore-default-units";
    ```
  - Add `registry.register(restoreDefaultUnitsTool);` immediately
    AFTER `registry.register(restoreDefaultNamesbasesTool);` (line
    3232) — keeps "restore-*" tools clustered.

## Tests (Vitest)

Mirror the layout of `restore-default-biomes.test.ts` (stub-runtime
suite + default-runtime integration suite).

### `restore_default_units tool` (stub-runtime)

1. **Happy path: pre-set non-default values across all 9 fields → call
   → all reset to defaults; previous reflects pre-call values**: build
   a stub runtime where `getDom` returns hand-picked non-default
   strings for the six DOM-backed fields and `getGlobal` returns
   non-default numbers for the four globalThis-backed fields
   (`distanceScale`, `populationRate`, `urbanization`, `urbanDensity`).
   Run tool. Assert parsed result has:
   - `applied` deep-equals the canonical METRIC defaults.
   - `previous` deep-equals the pre-set values.
   - `setDom` called for the six DOM-backed fields with the right
     `(id, value)` pairs.
   - `setDom` for the three globalThis-backed fields' inputs
     (distanceScaleInput, populationRateInput, urbanizationInput,
     urbanDensityInput) ALSO called.
   - `setGlobal` called for the four globalThis-backed fields with
     the right `(name, value)` pairs.

2. **Global reassignment: globalThis.distanceScale, populationRate,
   urbanization, urbanDensity all reassigned via `setGlobal`**: stub
   `setGlobal` with `vi.fn()`. Run tool. Assert
   `setGlobal.mock.calls` contains `["distanceScale", 3]`,
   `["populationRate", 1000]`, `["urbanization", 1]`,
   `["urbanDensity", 10]`.

3. **DOM input update: each input element's `.value` set to default
   string**: stub `setDom` with `vi.fn()`. Run tool. Assert
   `setDom.mock.calls` contains exactly:
   - `["distanceScaleInput", "3"]`
   - `["distanceUnitInput", "km"]`
   - `["heightUnit", "m"]`
   - `["temperatureScale", "°C"]`
   - `["areaUnit", "square"]`
   - `["heightExponentInput", "1.8"]`
   - `["populationRateInput", "1000"]`
   - `["urbanizationInput", "1"]`
   - `["urbanDensityInput", "10"]`
   (Order-insensitive deep-set comparison.)

4. **localStorage.removeItem called for each of the 8 keys**: stub
   `removeStorage` with `vi.fn()`. Run tool. Assert
   `removeStorage.mock.calls.map(c => c[0])` deep-equals the eight
   storage keys (any order).

5. **Each side-effect callback (unlock, calculateFriendlyGridSize,
   calculateTemperatures, renderScaleBar) called when present**: stub
   `callIfPresent` to return `true` for all four names. Run tool.
   Assert `callIfPresent.mock.calls.map(c => c[0])` deep-equals
   `["unlock", "calculateFriendlyGridSize", "calculateTemperatures",
   "renderScaleBar"]` (in invocation order). Assert
   `side_effects_run` deep-equals the same list.

6. **Side-effect absent → no error; missing callback omitted from
   side_effects_run**: stub `callIfPresent` to return `false` for
   `unlock` only. Run tool. Assert no error; `side_effects_run`
   deep-equals `["calculateFriendlyGridSize",
   "calculateTemperatures", "renderScaleBar"]`.

7. **Side-effect throws → no error; missing callback omitted from
   side_effects_run** (covered by §6 — `callIfPresent` already
   wraps the throw and returns `false`).

8. **localStorage absent / throws → no error**: stub `removeStorage`
   to throw on every call (simulates an internal failure that the
   default runtime would have caught but the tool body doesn't
   double-wrap). Run tool. Assert no error result; `applied` still
   the canonical defaults. **Decision**: in the tool body we wrap
   each `removeStorage` call in a try/catch so the runtime stub can
   intentionally throw and verify the tool body itself is robust.

9. **Missing DOM element → no error for that field; that field's
   previous value comes back as `null`**: stub `getDom` to return
   `null` for `heightUnit` only. Run tool. Assert no error; parsed
   result `previous.heightUnit === null`; other previous fields
   unaffected; `applied` still canonical (the `setDom` for
   `heightUnit` is still called — the runtime swallows the failure
   internally).

10. **Missing globalThis-backed value → previous is `null`**: stub
    `getGlobal` to return `undefined` for all four globalThis-backed
    names. Run tool. Assert `previous.distanceScale === null`,
    `previous.populationRate === null`,
    `previous.urbanization === null`, `previous.urbanDensity ===
    null`. Other previous fields unaffected; `applied` unchanged.

11. **Previous values captured BEFORE mutation (load-bearing)**: use
    `vi.fn().mock.invocationCallOrder` to assert that ALL `getDom`
    and `getGlobal` calls (the snapshot phase) happen BEFORE the
    FIRST `setDom` / `setGlobal` call (the mutation phase). This
    pins that the tool snapshots the previous state in full before
    overwriting anything — otherwise an interleaved ordering would
    record post-mutation values as "previous".

12. **Tool name + schema + registry round-trip**:
    - `tool.name === "restore_default_units"`.
    - `tool.input_schema.type === "object"`.
    - `tool.input_schema.properties` deep-equals `{}`.
    - `(tool.input_schema as { required?: unknown }).required` is
      undefined.
    - `new ToolRegistry()`,
      `registry.register(restoreDefaultUnitsTool)`,
      `expect(registry.list().map(t => t.name)).toContain(
      "restore_default_units")`.

13. **Empty-input handling**: passing `{}`, `null`, `undefined`,
    `{ extra: "ignored" }` → all execute identically.

14. **DEFAULT_UNITS exported and frozen**:
    `expect(DEFAULT_UNITS).toEqual({ distanceScale: 3, distanceUnit:
    "km", heightUnit: "m", temperatureScale: "°C", areaUnit:
    "square", heightExponent: 1.8, populationRate: 1000,
    urbanization: 1, urbanDensity: 10 })`. Pin via deep-equal so a
    typo regression is caught.

### `defaultRestoreDefaultUnitsRuntime (integration)`

Per-test save/restore of `globalThis.document`, `globalThis.localStorage`,
`globalThis.distanceScale`, `globalThis.populationRate`,
`globalThis.urbanization`, `globalThis.urbanDensity`,
`globalThis.unlock`, `globalThis.calculateFriendlyGridSize`,
`globalThis.calculateTemperatures`, `globalThis.renderScaleBar` in
`beforeEach` / `afterEach`. (These integration tests rely on
JSDOM-style stubs since the test environment is Node.)

15. **Default runtime end-to-end happy path**:
    - Build a stub `document` with `getElementById` returning
      lightweight `{ value: <pre-set> }` objects for all nine input
      ids.
    - Build a stub `localStorage` with `removeItem: vi.fn()`.
    - Set `globalThis.distanceScale = 5`,
      `globalThis.populationRate = 1500`,
      `globalThis.urbanization = 1.2`,
      `globalThis.urbanDensity = 12`.
    - Set `globalThis.unlock = vi.fn()`,
      `globalThis.calculateFriendlyGridSize = vi.fn()`,
      `globalThis.calculateTemperatures = vi.fn()`,
      `globalThis.renderScaleBar = vi.fn()`.
    - Run `restoreDefaultUnitsTool.execute({})`.
    - Assert no error; parsed result `applied` equals canonical
      defaults.
    - Assert each input element's `.value` was overwritten to the
      default string.
    - Assert `globalThis.distanceScale === 3`,
      `globalThis.populationRate === 1000`,
      `globalThis.urbanization === 1`,
      `globalThis.urbanDensity === 10` (load-bearing global
      reassignment via the default runtime).
    - Assert `localStorage.removeItem` called with each of the eight
      keys.
    - Assert `unlock` called once with `"distanceScale"`.
    - Assert `calculateFriendlyGridSize`, `calculateTemperatures`,
      `renderScaleBar` each called once.
    - Assert `side_effects_run` deep-equals `["unlock",
      "calculateFriendlyGridSize", "calculateTemperatures",
      "renderScaleBar"]`.

16. **Missing localStorage → no error**: set `globalThis.localStorage =
    undefined`. Run tool. Assert no error; result still ok. (Other
    fields handled with normal stub document.)

17. **localStorage.removeItem throws → no error**: stub
    `localStorage.removeItem` to throw on every call. Run tool. Assert
    no error; result still ok.

18. **Missing side-effect callbacks → side_effects_run subset**: set
    `globalThis.unlock = undefined`,
    `globalThis.calculateFriendlyGridSize = undefined`. Keep others.
    Run tool. Assert `side_effects_run` deep-equals
    `["calculateTemperatures", "renderScaleBar"]`.

19. **Side-effect throws → omitted from side_effects_run; tool still
    ok**: set `globalThis.calculateTemperatures = () => { throw new
    Error("boom"); }`. Keep others as `vi.fn()`. Run tool. Assert no
    error; `side_effects_run` deep-equals `["unlock",
    "calculateFriendlyGridSize", "renderScaleBar"]` (calculateTemperatures
    omitted).

20. **Missing DOM element → previous null for that field; apply
    silently skips**: stub `document.getElementById` to return `null`
    for `"heightUnit"` only (other ids return normal stubs). Run
    tool. Assert no error; `previous.heightUnit === null`.

21. **No `document` global → all DOM operations no-op; previous all
    null for DOM-backed fields**: set `globalThis.document =
    undefined`. Run tool. Assert no error; `previous.distanceUnit ===
    null`, etc.; globalThis-backed previous values still come through
    if the globals are set; `applied` unchanged.

22. **No globalThis-backed values → previous null for those fields**:
    set `globalThis.distanceScale = undefined`,
    `globalThis.populationRate = undefined`,
    `globalThis.urbanization = undefined`,
    `globalThis.urbanDensity = undefined`. Run tool. Assert no error;
    `previous.distanceScale === null`, etc.; the global reassignment
    still succeeds (writes 3 / 1000 / 1 / 10 to `globalThis`).

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case checklist:

- **All 9 fields reset.** Plan §Behavior enumerates all nine:
  distanceScale, distanceUnit, heightUnit, temperatureScale, areaUnit,
  heightExponent, populationRate, urbanization, urbanDensity. The
  applied result schema has all nine; the previous schema has all
  nine. Test §1 verifies all nine in `applied` against the canonical
  defaults via deep-equal.

- **Both globalThis reassignment AND DOM input update tested for each
  globalThis-backed field.** Tests §2 (globalThis reassignment for
  the four globalThis-backed fields: distanceScale, populationRate,
  urbanization, urbanDensity) and §3 (DOM input update for ALL nine
  inputs, including the four backing-input pairs) cover this. The
  integration §15 also verifies post-call values: `globalThis.X ===
  default` AND `inputElement.value === defaultStr` for all four
  global-backed pairs.

- **localStorage best-effort for all 8 keys tested.** Test §4
  verifies all eight keys are passed to `removeStorage`. Test §8
  verifies the tool body wraps `removeStorage` in try/catch.
  Integration §16 (missing localStorage) and §17 (throwing
  removeItem) verify the default runtime is robust.

- **All 3 side-effect callbacks tested.** Wait — the plan tracks FOUR
  side-effects (unlock, calculateFriendlyGridSize,
  calculateTemperatures, renderScaleBar), not three. The user's spec
  says "All 3 side-effect callbacks tested" — re-read. The user spec
  in step 5 says "All 3 side-effect callbacks tested" but the
  Behavior section in the user's spec lists `unlock` separately
  (Best-effort: call `unlock("distanceScale")` if available). The
  three "side-effect callbacks" the user refers to in the review
  checklist are likely calculateFriendlyGridSize,
  calculateTemperatures, renderScaleBar — with `unlock` being the
  `unlock("distanceScale")` call described separately. We treat all
  four uniformly via `callIfPresent` and surface them all in
  `side_effects_run`. Tests §5 (all four called when present), §6
  (one absent → omitted), and §7 / §19 (one throws → omitted)
  exercise all four. The integration §18 specifically tests two
  missing → only the other two appear in `side_effects_run`. This
  exceeds the spec — covers all four including unlock. Acceptable;
  documenting the over-coverage here.

  **CORRECTION**: re-reading the user spec more carefully: "Each
  side-effect callback (unlock, calculateFriendlyGridSize,
  calculateTemperatures, renderScaleBar) called when present;
  absent → no error; throws → no error. Use `side_effects_run` to
  verify which ones actually ran." So the user explicitly enumerates
  all four. The "All 3" in step 5's checklist likely refers to the
  three NON-unlock callbacks (the legacy `restoreDefaultUnits` calls
  three "compute" helpers and one "unlock" — semantically distinct).
  Either interpretation is fine since we test all four uniformly.

- **previous values captured BEFORE mutation.** Test §11 explicitly
  asserts via `mock.invocationCallOrder` that all `getDom` /
  `getGlobal` calls (the snapshot phase) happen BEFORE the FIRST
  `setDom` / `setGlobal` call (the mutation phase). This is the
  load-bearing pin. Without it, an interleaved implementation
  ("snapshot field X; mutate X; snapshot field Y; …") would record
  pre-mutation X but POST-mutation Y as "previous Y", which would
  break the contract.

- **Always-metric defaults (no navigator.language).** Plan
  §Behavior fixes the defaults at km / m / °C and explicitly
  documents the divergence from legacy behavior. Test §14 pins
  `DEFAULT_UNITS` via deep-equal so a regression that tries to
  re-introduce the navigator branch (returning `mi` / `ft` on en-US
  Node test runs) would fail.

- **Best-effort everywhere.** No single field gates the others.
  Tests §6 (missing side-effect), §8 (throwing localStorage), §9
  (missing DOM element), §10 (missing globalThis value) verify the
  tool returns ok in all four failure modes. Integration §16-§22
  re-verify with the default runtime. The only way the tool errors
  is if the runtime contract itself is broken, which the default
  runtime never does.

- **`side_effects_run` field naming.** snake_case to match
  `cells_changed` / `recalculated_population` from neighboring
  restore-default tools. Returns the in-order list of strings — not
  a count, not a per-callback bool map — so AI consumers can both
  see the order and confirm which ran without per-key lookup.

- **`previous` allows null per field.** The previous schema is
  partial-by-design: a missing input or unset global yields `null`,
  not omitted-key. This makes the contract more predictable — the
  AI always sees the same nine keys. Tests §9 / §10 / §20 / §21 /
  §22 cover the null cases.

- **No `pack` gate.** Many of these fields are pre-map globals (the
  options panel boots before any map exists). The plan explicitly
  notes "MUST NOT gate on `pack`" in §Validation. The default
  runtime never reads `pack`. The only world-state gate would be on
  the side-effect callbacks themselves — but those are wrapped in
  `callIfPresent` and silently skipped when missing.

- **Per-field abstraction via runtime.** The runtime exposes
  `getDom(id)` / `setDom(id, value)` / `getGlobal(name)` /
  `setGlobal(name, value)` / `removeStorage(key)` / `callIfPresent(name)`
  — six small generic seams. The tool body is then a flat list of
  field operations. Easier to test in isolation than per-field
  seams; matches the user's spec ("Abstract via runtime: per-field
  `getDom(id)` / `setDom(id, value)` / `getGlobal/setGlobal(name)` /
  `removeStorage(key)` / `callIfPresent(name)`").

- **Alphabetical insertion.** `restore-default-units` slots
  immediately AFTER `restore-default-namesbases` in imports AND
  re-exports (n < u). In the registry block, placement immediately
  after `restoreDefaultNamesbasesTool` keeps the "restore-*" tools
  clustered.

- **Description length.** Description mentions: legacy Restore
  button, the nine fields reset (compactly), the always-metric
  decision, the localStorage clear, and the four side-effects.
  Encourages the AI to use `set_measurement_units` afterwards if
  it wants imperial. About 4-5 sentences — comparable to other
  restore-default tools.

- **Test isolation in integration.** Per-test save/restore of TEN
  globals (`document`, `localStorage`, four globalThis-backed
  values, four side-effect callbacks). Without all ten, state from
  earlier tests would bleed.

- **Order of operations matches legacy.** Plan §Behavior keeps the
  same ordering: distanceScale → distance/height/temp/area units →
  heightExponent → populationRate/urbanization/urbanDensity, with
  side-effects in the legacy order (unlock → calculateFriendlyGridSize
  → calculateTemperatures → renderScaleBar). Regressions on order
  could surface if e.g. `renderScaleBar` reads `distanceScale` and we
  changed it to fire first.

- **Tool body keeps each side-effect in a try/catch even though
  `callIfPresent` already wraps**: this is defense-in-depth. The
  default runtime's `callIfPresent` is the primary wrapper; the
  tool body wraps redundantly so a custom runtime that throws from
  `callIfPresent` itself doesn't break the tool. Trivial cost.

- **`DEFAULT_UNITS` exported as a constant.** Lets external code
  (and tests) reference the canonical defaults without literal
  duplication. Frozen via `as const` so accidental mutation is a
  type error.
