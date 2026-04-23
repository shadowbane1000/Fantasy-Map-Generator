# Tasks 128 — regenerate_state_coa AI tool

- [ ] Create `src/ai/tools/regenerate-state-coa.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPack, getPackCollection,
    okResult, parseEntityRef, type RawCoa, type RawState.
  - Imports from `./index`: type Tool, type ToolResult.
  - Exports:
    - `RegenerateStateCoaRef { i, name, coa }`.
    - `RegenerateStateCoaRuntime { find, generate, apply }`.
    - `defaultRegenerateStateCoaRuntime`:
      - `find(ref)` — `findEntityByRef` on
        `getPackCollection<RawState>("states")`; return
        null when entry is null, `entry.i <= 0`,
        `entry.removed`, or `entry.lock`. Else return
        `{ i, name: entry.name ?? "", coa: entry.coa }`.
      - `generate(i, shield?)`:
        - `pack = getPack()`; throw "pack is not available
          yet; the map hasn't finished loading." when missing.
        - `state = pack.states?.[i]`; throw
          `State ${i} not found.` when missing.
        - `coaMod = getGlobal<CoaModule>("COA")`; throw
          "COA.generate is not available yet; the map
          hasn't finished loading." when `coaMod?.generate`
          is not a function.
        - `newCoa = coaMod.generate(null, 0.3, 0.1, null)`
          (parent is null — states are top-level in the
          heraldry hierarchy).
        - Resolve shield:
          - `shield` input (if non-empty string).
          - else `state.coa?.shield` if truthy string.
          - else `coaMod.getShield(state.culture || 0,
            state.i)` when `getShield` is a function.
        - If resolvedShield is set, `newCoa.shield = resolvedShield`.
        - return newCoa.
      - `apply(i, coa)`:
        - `states = getPackCollection<RawState>("states")`.
        - `state = states?.[i]`; throw `State ${i} not
          found.` when missing.
        - `state.coa = coa`.
        - try/catch (best-effort):
          - `id = \`stateCOA${i}\``.
          - `document.getElementById(id)?.remove()` when
            document exists.
          - `renderer = getGlobal<CoaRendererModule>("COArenderer")`;
            call `renderer.trigger(id, coa)` when available.
  - `createRegenerateStateCoaTool(runtime =
    defaultRegenerateStateCoaRuntime)`:
    - name: `regenerate_state_coa`.
    - description: parallels regenerate_burg_coa. Mentions:
      - same side effect as Regenerate button in Emblem
        Editor for a selected state.
      - `COA.generate(null, 0.3, 0.1, null)` — states are
        top-level; no parent coa.
      - shield precedence: explicit override > existing >
        `COA.getShield(culture, state)`.
      - writes `state.coa` and best-effort refreshes the
        `#stateCOA{i}` DOM node via `COArenderer.trigger`.
      - refuses Neutrals (state 0), removed, locked states.
      - suggests `regenerate_emblems` for whole-map rebuild
        and `regenerate_burg_coa` for burg-level parallel.
    - Schema:
      - `state` (integer | string, required) — "Numeric
        state id (> 0) or case-insensitive name. State 0
        (Neutrals) is refused."
      - `shield` (string, optional) — "Optional shield
        shape override (e.g. 'heater', 'swiss'). Defaults
        to the state's existing shield or a
        culture-appropriate default."
    - Validation order:
      1. Early reject `typeof input.state === "number" &&
         Number.isInteger(input.state) && input.state <= 0`
         → "Cannot regenerate coa for state 0 (the
         Neutrals placeholder)."
      2. `parseEntityRef(input.state, "state")` — error on
         failure.
      3. Shield override: when provided, must be a
         non-empty trimmed string.
      4. `runtime.find(ref)` null → "No state found
         matching ..." (covers unknown id, removed state,
         locked state — runtime.find returns null for all).
      5. `current.i === 0` guard (belt + braces).
    - Call `runtime.generate(current.i, shield)`, catch and
      surface errors.
    - If returned coa is null / non-object → error
      "COA.generate returned no emblem.".
    - Call `runtime.apply(current.i, newCoa)`, catch and
      surface errors.
    - Return `okResult({ i: current.i, previousCoa:
      current.coa ?? null, coa: newCoa })`.
  - Export `regenerateStateCoaTool = createRegenerateStateCoaTool()`.

- [ ] Register in `src/ai/index.ts`:
  - Import `regenerateStateCoaTool` next to
    `regenerateBurgCoaTool`.
  - Barrel re-export `createRegenerateStateCoaTool,
    regenerateStateCoaTool`.
  - `registry.register(regenerateStateCoaTool)` adjacent
    to `regenerateBurgCoaTool`.

- [ ] Write `src/ai/tools/regenerate-state-coa.test.ts`:
  - makeRuntime helper mirroring the burg-coa test.
  - Unit block `describe("regenerate_state_coa tool")`:
    - regenerates by numeric id (generate called with
      (5, undefined); apply called with (5, newCoa);
      payload has ok/i/previousCoa/coa).
    - case-insensitive name resolves through find.
    - passes shield override through to generate.
    - trims shield override.
    - returns null previousCoa when state had no coa.
    - rejects unknown state.
    - rejects invalid refs (null, undefined, 0, -1, 1.5,
      "") — all isError, apply not called.
    - rejects empty-string / whitespace shield override.
    - rejects non-string shield override.
    - surfaces generator errors.
    - surfaces apply errors.
    - errors when generator returns non-object.
  - Integration block `describe("defaultRegenerateStateCoaRuntime (integration)")`:
    - beforeEach: stub globalThis.pack with
      `states[0] = { i: 0, name: "Neutrals" }`,
      `states[2] = { i: 2, name: "Altaria", culture: 3,
      coa: { t1: "gules", shield: "swiss" } }`, etc.
    - Stub `globalThis.COA = { generate, getShield }`,
      `globalThis.COArenderer = { trigger }`,
      `globalThis.document = { getElementById }`.
    - afterEach: restore all originals.
    - **IMPORTANT**: when casting `globalThis` in tests,
      use `globalThis as unknown as { pack: {...} }`
      (double cast) to satisfy tsc vs the real
      PackedGraph type.
    - Tests:
      - regenerates with explicit shield; state.coa is
        updated; generate called with (null, 0.3, 0.1, null);
        existing `#stateCOA2` removed; trigger called with
        "stateCOA2" + new coa.
      - preserves existing state.coa.shield when no
        override (getShield not called).
      - falls back to COA.getShield when no existing shield
        and no override (called with state.culture, state.i).
      - errors when pack is missing.
      - errors when COA is missing.
      - errors when state is unknown (id 999).
      - rejects locked states.
      - rejects removed states.
      - rejects state 0 (Neutrals) with a clear message.
      - succeeds even when COArenderer is missing.
      - does not throw when #stateCOA{i} DOM node is missing.

- [ ] Update `README_AI.md`:
  - Add row directly after `regenerate_burg_coa`.
  - Description mirrors the tool description + example
    prompt. Include shield override example.
  - API key setup is the page-level prerequisite, already
    documented at the top of README_AI.md. This tool
    inherits it; no new setup.

- [ ] Verification:
  - `cd /workspace && npx biome check src/ 2>&1 | tail -5`
    → 7 warnings / 1 info / 0 errors (baseline match).
  - `cd /workspace && npm run build` → succeeds (catches
    tsc errors that biome does not).
  - `cd /workspace && npm test 2>&1 | tail -6` → all
    passing (1586 → ~1607 with ~21 new tests).

- [ ] Commit staging specific files only:
  - `src/ai/tools/regenerate-state-coa.ts`
  - `src/ai/tools/regenerate-state-coa.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_128.md`
  - `aiplans/tasks_128.md`
  - Message: `feat(ai): add regenerate_state_coa tool`
    with 1-2 line body citing parity with the Emblem
    Editor per-state Regenerate handler.

## Verification: tasks → plan

- Runtime seam shape (`find`, `generate`, `apply`) matches
  `regenerate-burg-coa.ts` exactly for consistency.
- Validation order + early Neutrals guard match
  `rename-state.ts`'s pattern so error messages are clear.
- README row placement next to `regenerate_burg_coa` keeps
  related tools grouped.

## Verification: plan → use case

- Emblem Editor state handler (emblems-editor.js 206-223):
  parent null, kinship 0.3, dominion 0.1, type null →
  matches tool's `COA.generate(null, 0.3, 0.1, null)`.
- Shield fallback `el.coa.shield || COA.getShield(el.culture || 0, el.state)`
  → matches tool's precedence chain.
- DOM refresh `document.getElementById(id)?.remove()` +
  `COArenderer.trigger(id, el.coa)` → matches
  apply() try/catch block.

## Verification: tests → regressions

- If generate is called with a non-null parent, the
  integration test asserting
  `generateCoa.mock.calls[0]?.[0]` === null fails.
- If shield precedence is wrong, the
  "preserves existing state.coa.shield" or
  "falls back to COA.getShield" tests fail.
- If Neutrals / removed / locked aren't rejected, the
  matching rejection tests fail.
- If DOM cleanup isn't best-effort, the "succeeds when
  COArenderer is missing" / "does not throw when
  #stateCOA{i} is missing" tests fail.
- If the early state===0 guard is missing, the "rejects
  state 0" test fails with the wrong error message.
