# Tasks 174 — `remove_ruler`

- [ ] Create `src/ai/tools/remove-ruler.ts`
  - `RulerRemovalRuntime` interface with
    `remove(id: number): { id: number }`.
  - `defaultRulerRemovalRuntime.remove`:
    - Reads `window.rulers` via `getGlobal`. Throws
      `"Rulers is not available yet; the map hasn't finished loading."`
      if missing or if `remove` / `data` are not present.
    - Looks up the ruler by id in `rulers.data`. If missing, throw
      `"Ruler <id> not found."`.
    - Calls `rulers.remove(id)` inside a try/catch. If it throws
      (missing SVG element etc.), splice the entry from
      `rulers.data` manually so the data mutation still happens.
    - Best-effort DOM cleanup: `document.getElementById("ruler" + id)?.remove()`
      to mop up any leftover label element.
    - Returns `{ id }`.
  - `createRemoveRulerTool(runtime)` factory:
    - Validate `id` is a finite integer `>= 0`.
    - Call `runtime.remove(id)` inside a try/catch; surface throws
      via `errorResult`.
    - Return `okResult({ id })`.
  - Export `removeRulerTool = createRemoveRulerTool()`.

- [ ] Create `src/ai/tools/remove-ruler.test.ts`
  - Mocked runtime via `vi.fn`:
    - Delegates to runtime with correct `id` (e.g. `3`).
    - Allows `id: 0` (first ruler).
    - Returns `{ ok: true, id }`.
  - Input validation errors:
    - Missing `id` → `isError`.
    - Non-number `id` (string, null) → `isError`.
    - Non-finite `id` (NaN, Infinity) → `isError`.
    - Non-integer `id` (1.5) → `isError`.
    - Negative `id` (-1) → `isError`.
    - Runtime failure surfaced as `errorResult` (mock throws).
    - Runtime non-Error throw is stringified.
  - Schema assertions: `name === "remove_ruler"`,
    `required === ["id"]`.
  - `defaultRulerRemovalRuntime` integration block:
    - Install `globalThis.rulers = { data: [...], remove(id) { ... } }`
      and `globalThis.document = { getElementById(...) {...} }` using
      `as unknown as { ... }` casts per conventions.
    - Test: removes the target ruler from `rulers.data`, calls
      `remove`, and invokes DOM cleanup on the ruler element.
    - Test: errors when `globalThis.rulers` is missing.
    - Test: errors when the rulers shape is invalid (`remove` missing).
    - Test: errors when the rulers shape is invalid (`data` not array).
    - Test: errors when id isn't in `rulers.data`.
    - Test: `rulers.remove` throwing — the tool still splices
      `rulers.data` manually and returns ok.
    - Test: no-ops DOM cleanup when `document.getElementById` returns
      null.
    - Test: no-ops DOM cleanup when `document` is undefined.

- [ ] Register + re-export in `src/ai/index.ts`
  - `import { removeRulerTool } from "./tools/remove-ruler";`
  - `registry.register(removeRulerTool);` near the other `remove_*`
    registrations (alphabetically / alongside `removeBurgTool`,
    `removeMarkerTool`, and near the `clear_rulers` / `add_ruler`
    registrations).
  - Re-export `{ removeRulerTool, createRemoveRulerTool }` plus
    `RulerRemovalRuntime` type from the barrel.

- [ ] Update `README_AI.md`
  - Add a row near `clear_rulers` / `add_ruler`. Include: Rulers API
    citation (`rulers.remove(id)` in `public/modules/ui/measurers.js`),
    return shape, "Requires an Anthropic API key" footer, two
    example prompts.

- [ ] Verify
  - `npm run build` passes.
  - `npm test` — all tests pass. New file adds ~13-15 tests.
  - `npm run lint 2>&1 | tail -5` matches baseline:
    `7 warnings / 1 info / 0 errors`.

- [ ] Commit with message `feat(ai): add remove_ruler tool` + short body.
