# Tasks 142 — `add_state`

- [ ] T1 Create `src/ai/tools/add-state.ts` with:
  - Interfaces: `AddStateBurgInfo`, `AddStateCultureInfo`, `NewStateInput`, `AddStateResult`, `AddStateRuntime` (seams: `findBurg`, `findCulture`, `cellLand`, `cultureFor`, `randomColor`, `generateName`, `generateCoa`, `apply`, `redraw`).
  - `defaultAddStateRuntime`:
    - `findBurg(ref)` uses `findEntityByRef(pack.burgs, ref)`; returns null for id 0 / removed. Returns `isCapital: burg.capital === 1`.
    - `findCulture(ref)` uses `findEntityByRef(pack.cultures, ref)`; returns null for removed / missing. Returns `{i, name, type}`.
    - `cellLand(cellId)` reads `pack.cells.h[cellId] >= 20`.
    - `cultureFor(id)` reads `pack.cultures[id]` directly (keeps id 0 — since a burg's culture could be 0 for Wildlands).
    - `randomColor()` tries `window.getRandomColor`; falls back to `"#888888"`.
    - `generateName(cultureId, burgName)` tries `Names.getState(Names.getCultureShort(cultureId), cultureId)`; falls back to `burgName || "New State"`.
    - `generateCoa(parentCoa, cultureType, cultureId)` tries `COA.generate(parentCoa, 0.4, null, cultureType) + COA.getShield(cultureId, null)`; returns `undefined` on any failure.
    - `apply(input, capitalBurgI)`:
      - Asserts `pack.states` is an array, capital burg exists.
      - Builds full `RawState` object (i = states.length, name, fullName, form, formName, type, color, culture, capital, center, expansionism: 0.5, burgs: 1, cells: 1, area: 0, rural: 0, urban: 0, provinces: [], neighbors: [], military: [], alert: 1, diplomacy, coa if provided).
      - Builds `diplomacy` array of length states.length + 1: `"x"` for Neutrals (0), `"Neutral"` for every other existing state, `"x"` for the new state's own slot.
      - Pushes onto `pack.states`.
      - Mutates the capital burg: sets `capital = 1`, `state = newI`.
      - Mutates `pack.cells.state[center] = newI`.
      - Returns `AddStateResult` shape.
    - `redraw()`:
      - Best-effort try/catch around `drawStates()`, `drawStateLabels([newI])`, `drawBorders()`.
      - No-op if any global is missing.
    - Use `getGlobal` / `getPack` from `_shared`.
  - `createAddStateTool(runtime?)` exports the tool; `addStateTool` default instance.
  - `input_schema`: required `capital`; optional `name`, `color`, `type`, `culture`, `form`.
  - `execute`:
    - Parses `capital` ref via `parseEntityRef`.
    - Validates each optional string field (when provided): non-empty after trim.
    - Validates `culture` ref via `parseEntityRef` when provided.
    - Resolves burg via runtime; error with the `JSON.stringify(ref)` pattern used elsewhere.
    - Rejects removed burg / burg 0 / already-capital burg.
    - Land check via `runtime.cellLand(burg.cell)`.
    - Resolves culture (explicit ref → runtime.findCulture; else pick up from `runtime.cultureFor(burg.culture)`). If explicit ref doesn't resolve → error.
    - Computes defaults: name via `runtime.generateName`, color via `runtime.randomColor`, coa via `runtime.generateCoa`.
    - Assembles `NewStateInput` (name, form ?? "Monarchy", formName = form, fullName = `"${form} of ${name}"`, type ?? "Generic", color, culture, capital = burg.i, center = burg.cell, expansionism: 0.5, coa).
    - Calls `runtime.apply` inside try/catch.
    - Calls `runtime.redraw()` after successful apply (wrapped in runtime, so no try here).
    - Returns `okResult(result)`.

- [ ] T2 Create `src/ai/tools/add-state.test.ts`:
  - Injected-runtime tests:
    1. Happy path: all seams called, result shape correct, defaults applied.
    2. Explicit `name` / `color` / `type` / `form` passed through; `fullName` recomposed.
    3. Explicit `culture` ref resolves via `runtime.findCulture`.
    4. `capital` missing / non-integer / empty string → error, no runtime.apply.
    5. `name` empty / whitespace / non-string → error.
    6. `color` empty / non-string → error.
    7. `type` empty → error.
    8. `form` empty → error.
    9. `culture` invalid ref → error.
    10. `findBurg` returns null → error with the ref string.
    11. burg is removed → error (`findBurg` returns info with `removed: true`).
    12. burg is already capital → error.
    13. burg cell is water → error.
    14. `runtime.apply` throwing → surfaces error message.
    15. `runtime.redraw` called after successful apply.
  - `defaultAddStateRuntime` (integration) block:
    - Install pack with burgs (0 placeholder + 1 burg), cultures (0 + 1 test culture), states ([Neutrals]), cells.h with land at burg's cell, cells.state / cells.burg arrays.
    - Install `Names`, `COA`, `getRandomColor` globals as mocks.
    - Install `drawStates`, `drawStateLabels`, `drawBorders` mocks.
    - Verify:
      - Minimal call (just capital id) pushes state at id 1, `burg.capital = 1`, `burg.state = 1`, `cells.state[42] = 1`, drawStates called.
      - Call with `culture: 2` uses that culture (when culture 2 exists).
      - Rejects removed burg.
      - Rejects already-capital burg.
      - Redraw errors swallowed (state still pushed).
      - `getRandomColor` absent → fallback color used.
    - Use `as unknown as { ... }` casts for globalThis reassignment.

- [ ] T3 Register in `src/ai/index.ts`:
  - `import { addStateTool } from "./tools/add-state";` (alphabetically after addRegiment / addReligion).
  - Re-export block `createAddStateTool` / `addStateTool` near the other `add_*` exports.
  - `registry.register(addStateTool);` in `buildDefaultRegistry` near the other `add*Tool` registrations.

- [ ] T4 Add `README_AI.md` row right after `add_regiment`, before `add_marker` / other add_* entries. Include:
  - Brief: creates a single-cell state around an existing burg as capital.
  - Defaults and scope caveat (no territory expansion; use `regenerate_domain(domain="states")` for full regen).
  - Example prompts.

- [ ] T5 Verify:
  - `npm run build` succeeds.
  - `npm test` all pass (baseline 1824 tests → expected 1824 + new test count).
  - `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors).

- [ ] T6 Commit `feat(ai): add add_state tool`, staging only the four touched files.
