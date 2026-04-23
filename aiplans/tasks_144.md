# Tasks 144 — `add_province`

- [ ] T1 Create `src/ai/tools/add-province.ts` with:
  - Interfaces: `AddProvinceBurgInfo`, `AddProvinceStateInfo`, `NewProvinceInput`, `AddProvinceResult`, `AddProvinceRuntime` (seams: `findBurg`, `findState`, `stateFor`, `cellLand`, `cellState`, `cellProvince`, `provinceCenter`, `randomColor`, `mixColor`, `generateName`, `generateCoa`, `apply`, `redraw`).
  - `defaultAddProvinceRuntime`:
    - `findBurg(ref)` uses `findEntityByRef(pack.burgs, ref)`; returns null for id 0 / removed. Captures `coa` for COA parenting.
    - `findState(ref)` uses `findEntityByRef(pack.states, ref)`; returns null for missing.
    - `stateFor(id)` reads `pack.states[id]`; returns null if removed/missing.
    - `cellLand(cellId)` reads `pack.cells.h[cellId] >= 20`.
    - `cellState(cellId)` reads `pack.cells.state[cellId]` (default 0).
    - `cellProvince(cellId)` reads `pack.cells.province[cellId]` (default 0).
    - `provinceCenter(i)` reads `pack.provinces[i]?.center` (null if removed / missing / id 0).
    - `randomColor()` tries `window.getRandomColor`; falls back to `"#888888"`.
    - `mixColor(stateColor)` — if `stateColor` starts with `#` and `d3` global has `interpolate` + `color`, mix 20% with random color via `d3.color(d3.interpolate(stateColor, rnd)(0.2)).hex()`; falls back to `randomColor()`.
    - `generateName(cultureId, burgName)` — prefers `burgName` if non-empty (matches editor's "burg ? pack.burgs[burg].name : …" branch); else tries `Names.getState(Names.getCultureShort(cultureId), cultureId)`; final fallback `"New Province"`.
    - `generateCoa(parentCoa, stateForm, cultureId, stateId)` — tries `COA.generate(parentCoa, 0.8, null, stateForm)` + `COA.getShield(cultureId, stateId)`; returns undefined on any failure.
    - `apply(input)`:
      - Asserts `pack.provinces` is an array and capital burg exists.
      - Builds `RawProvince` object (i = provinces.length, state, center, burg, name, formName, fullName, color, coa if provided).
      - Pushes onto `pack.provinces`.
      - Pushes `newI` onto `pack.states[state].provinces` if that array exists.
      - Writes `pack.cells.province[center] = newI`.
      - Returns `AddProvinceResult` shape.
    - `redraw(newI)` — best-effort try/catch around `drawProvinces()`, `drawBorders()`.
    - Use `getGlobal` / `getPack` from `_shared`.
  - `createAddProvinceTool(runtime?)` exports the tool; `addProvinceTool` default instance.
  - `input_schema`: required `capital`; optional `state`, `name`, `color`, `form`.
  - `execute`:
    - Parses `capital` ref via `parseEntityRef`.
    - Validates each optional string field (when provided): non-empty after trim.
    - Validates `state` ref via `parseEntityRef` when provided.
    - Resolves burg via runtime; error when missing with `JSON.stringify(ref)` pattern.
    - Rejects removed burg.
    - Land check via `runtime.cellLand(burg.cell)`.
    - Resolves `cellStateId = runtime.cellState(burg.cell)`. Reject if `cellStateId === 0` ("neutral lands").
    - If explicit `state` ref: resolve via `runtime.findState`; reject on missing; reject if `state.i !== cellStateId` (consistency).
    - Load state info via `runtime.stateFor(cellStateId)` for defaults; fall back to synthesizing `{i, name: "", color: "", form: ""}` if missing.
    - Check the cell isn't already a province center: iterate or use `runtime.cellProvince(burg.cell)` + `runtime.provinceCenter(existing)` — if the existing province's center === burg.cell, reject.
    - Computes defaults: form ?? "Province"; name via `runtime.generateName` (preferring burg name); color via `runtime.mixColor(state.color)`; fullName via `composeProvinceFullName(name, formName)` (reuse from `regenerate-province-name`); coa via `runtime.generateCoa(burg.coa, state.form, burg.culture, state.i)`.
    - Assembles `NewProvinceInput` and calls `runtime.apply` inside try/catch.
    - Calls `runtime.redraw(result.i)` after successful apply.
    - Returns `okResult(result)`.

- [ ] T2 Create `src/ai/tools/add-province.test.ts`:
  - Injected-runtime tests:
    1. Happy path: all seams called, result shape correct, defaults applied. `runtime.apply` receives the expected NewProvinceInput.
    2. Explicit `name` / `color` / `form` passed through; `fullName` recomposed `"{name} {formName}"`.
    3. Explicit `state` ref resolves via `runtime.findState` (and matches cellState).
    4. `capital` missing / non-integer / empty string → error, no runtime.apply.
    5. `name` empty / whitespace / non-string → error.
    6. `color` empty / non-string → error.
    7. `form` empty → error.
    8. `state` invalid ref → error.
    9. `findBurg` returns null → error with the ref string.
    10. Burg is removed → error.
    11. Burg cell is water → error.
    12. Burg cell is in neutral state (cellState = 0) → error.
    13. Cell is already a province center → error.
    14. Explicit state ref doesn't match cellState → error.
    15. `runtime.apply` throwing → surfaces error message.
    16. `runtime.redraw` called after successful apply.
  - `defaultAddProvinceRuntime` (integration) block:
    - Install pack with burgs (0 + 1 burg at cell 42), cultures (0 + 1 test), states ([Neutrals, Altaria]), provinces ([0 placeholder]), cells with h[42]=25, state[42]=1, province[42]=0.
    - Install `Names`, `COA`, `getRandomColor` globals as mocks.
    - Install `drawProvinces`, `drawBorders` mocks.
    - Verify:
      - Minimal call (just capital id) pushes province at id 1, `cells.province[42] === 1`, `states[1].provinces` now includes 1, `burgs[1].capital` stays at 0 (unchanged).
      - Accepts explicit `state` ref by name.
      - Rejects state mismatch.
      - Rejects removed burg.
      - Rejects neutral burg (state = 0).
      - Rejects cell already a province center (seed provinces[1] with center = 42).
      - `getRandomColor` absent → fallback color used.
      - Redraw errors swallowed (province still pushed).
    - Use `as unknown as { ... }` casts for globalThis reassignment.

- [ ] T3 Register in `src/ai/index.ts`:
  - `import { addProvinceTool } from "./tools/add-province";` (alphabetically between `addMarkerTool` and `addRegimentTool`).
  - Re-export block `createAddProvinceTool` / `addProvinceTool` near the other `add_*` exports.
  - `registry.register(addProvinceTool);` in `buildDefaultRegistry` near the other `add*Tool` registrations.

- [ ] T4 Add `README_AI.md` row adjacent to `add_state`. Include:
  - Brief: creates a single-cell province around an existing burg as its capital.
  - Defaults and scope caveat (no territory expansion; does NOT touch `burg.capital` — that flag is for state capitals only).
  - Example prompts.

- [ ] T5 Verify:
  - `npm run build` succeeds.
  - `npm test` all pass.
  - `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors).

- [ ] T6 Commit `feat(ai): add add_province tool`, staging only the four touched files (plus aiplans/plan_144.md + tasks_144.md).
