# Tasks 173 — `add_ruler`

- [ ] Create `src/ai/tools/add-ruler.ts`
  - `RULER_TYPES` table mapping lowercase + PascalCase aliases to the
    canonical global class name: `"ruler"` / `"Ruler"` → `"Ruler"`,
    `"opisometer"` / `"Opisometer"` → `"Opisometer"`,
    `"planimeter"` / `"Planimeter"` → `"Planimeter"`.
  - `RulerAddInput` interface: `{ type: "Ruler"|"Opisometer"|"Planimeter"; points: number[][] }`.
  - `NewRuler` interface: `{ id: number; type: string; points: number[][] }`.
  - `RulerAddRuntime` interface with `add(input): NewRuler`.
  - `defaultRulerAddRuntime.add`:
    - Reads `window.rulers` via `getGlobal`. Throws if missing or if
      `create` / `data` are not present.
    - Reads `window[type]` class via `getGlobal`. Throws if missing.
    - Calls `rulers.create(Type, input.points)` and captures the
      returned instance.
    - Best-effort `instance.draw?.()` inside a try/catch.
    - Returns `{ id, type, points }` from the instance.
  - `createAddRulerTool(runtime)` factory:
    - Validate `type` (optional, default `"ruler"`; must resolve to a
      canonical class via `RULER_TYPES`).
    - For `Ruler` / `Opisometer`: require `x1`, `y1`, `x2`, `y2`
      finite numbers; optionally range-check against `graphWidth` /
      `graphHeight` when both are finite (inclusive bounds); build
      `points = [[x1, y1], [x2, y2]]`.
    - For `Planimeter`: require `points` array of length ≥ 3, each
      element a `[x, y]` pair of finite numbers (optionally
      range-checked). Build the cleaned `points` array.
    - Call `runtime.add({ type, points })` inside a try/catch;
      surface throws via `errorResult`.
    - Return `okResult({ id, type, points })`.
  - Export `addRulerTool = createAddRulerTool()`.

- [ ] Create `src/ai/tools/add-ruler.test.ts`
  - Mocked runtime via `vi.fn`:
    - Default `type` is `"Ruler"` when not supplied.
    - Explicit `"ruler"` / `"Ruler"` / `"RULER"` all resolve the same.
    - `"opisometer"` / `"Opisometer"` resolve to `"Opisometer"`.
    - `"planimeter"` / `"Planimeter"` resolve to `"Planimeter"`.
    - `Ruler`/`Opisometer` path calls runtime with `[[x1,y1],[x2,y2]]`.
    - Planimeter path calls runtime with the validated polygon.
  - Input validation errors:
    - Non-finite `x1`/`y1`/`x2`/`y2` → `isError`.
    - Missing coordinate (undefined) on a Ruler → `isError`.
    - Out-of-bounds coordinate (when `graphWidth`/`graphHeight`
      globals are set in the test) → `isError`.
    - `type` not a string / empty string / unknown alias → `isError`.
    - Planimeter with `< 3` points → `isError`.
    - Planimeter `points` not an array / contains non-pair /
      non-finite entries → `isError`.
  - Runtime failure surfaced as `errorResult` (mock throws).
  - Schema assertions: `name === "add_ruler"`,
    `required === ["x1", "y1", "x2", "y2"]` at the top level (with
    `type` and `points` optional — the handler dispatches).
  - `defaultRulerAddRuntime` integration block:
    - Install `globalThis.rulers = { data: [], create(T, pts) {
        const inst = new T(pts); this.data.push(inst); return inst;
      } }` and stub classes `Ruler`, `Opisometer`, `Planimeter` as
      constructors that record `this.points` / `this.id = rulers.data.length`
      and provide `draw = vi.fn()`.
    - Use `as unknown as { ... }` casts per conventions.
    - Test: Ruler create pushes to `rulers.data`, returns incremented id,
      points echoed back, `draw` invoked.
    - Test: second create increments the id.
    - Test: Planimeter create with 3 points works; `draw` invoked.
    - Test: errors when `rulers` is missing.
    - Test: errors when the type's class is missing.
    - Test: best-effort `draw` failure does not fail the tool call
      (mutation still happened; returned `ok: true`).

- [ ] Register + re-export in `src/ai/index.ts`
  - `import { addRulerTool } from "./tools/add-ruler";`
  - `registry.register(addRulerTool);` near the other `add_*`
    registrations (alongside `addMarkerTool`, `addBurgTool`, etc.).
  - Re-export `{ addRulerTool, createAddRulerTool }` plus types
    (`RulerAddRuntime`) from the top-level barrel.

- [ ] Update `README_AI.md`
  - Add a row near the existing `add_marker` / future `clear_rulers`
    slot (after `add_zone` works fine — grouped with the other `add_*`
    tools). Include: Rulers API citation, default type, coordinate
    bounds, return shape, "Requires an Anthropic API key" footer, and
    two example prompts.

- [ ] Verify
  - `npm run build` passes.
  - `npm test` — all tests pass. New file adds ~12-15 tests.
  - `npm run lint 2>&1 | tail -5` matches baseline:
    `7 warnings / 1 info / 0 errors`.

- [ ] Commit with message `feat(ai): add add_ruler tool` + short body.
