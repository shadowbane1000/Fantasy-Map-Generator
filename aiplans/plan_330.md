# Plan 330: `randomize_states_expansion` tool

## Use case

Add an AI chat tool `randomize_states_expansion` that randomizes the
`expansionism` field on every active state and re-runs the state /
province expansion algorithms so borders update. This mirrors the
legacy `randomizeStatesExpansion` function in
`public/modules/dynamic/editors/states-editor.js` (line 862):

```js
function randomizeStatesExpansion() {
  pack.states.forEach(s => {
    if (!s.i || s.removed) return;
    const expansionism = rn(Math.random() * 4 + 1, 1);
    s.expansionism = expansionism;
    $body.querySelector("div.states[data-id='" + s.i + "'] > input.statePower").value = expansionism;
  });
  recalculateStates(true, true);
}
```

`recalculateStates(must, true)` is the legacy helper defined in the same
file at line 846; it calls `States.expandStates()`, `Provinces.generate()`,
`Provinces.getPoles()`, `States.getPoles()`, and redraws the
state/border/province/label layers when those layers are on. The user
can already trigger this via the **Randomize** button in the states
editor; the AI chat had no equivalent until now.

We already have:

- `set_entity_expansionism` (sets expansionism on a single state /
  culture / religion)
- `merge_states`

This plan adds the missing **batch randomize** action.

### Choice of redraw entry point

The legacy editor file is an ES module (`export function open()` at the
top), so its top-level `function recalculateStates(must)` is
**module-scoped**, not on `window`. However, the codebase already has a
precedent for treating it as a global: `set-state-type.ts` line 57
calls `getGlobal<() => void>("recalculateStates")` and the integration
test in `set-state-type.test.ts` line 145 injects it on `globalThis`.
The legacy bootstrap (or some path during editor open) appears to
expose it (or the test relies on injection only — either way the
established AI-tool contract is "look it up via `getGlobal`, surface a
clean error if it isn't there").

This plan follows the same pattern: call
`getGlobal<(must: boolean, randomize: boolean) => void>("recalculateStates")`
and invoke it with `(true, true)`. Recommendation (a) from the
prompt — single global call mirroring the user's UI exactly. Calling
the underlying chain (`States.expandStates()` etc.) ourselves would
duplicate redraw logic and risk drifting from the legacy behavior
when `recalculateStates` is updated.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-330 && npm run lint 2>&1 | tail -50`
on the worktree base (master @ 182fd5c, branch
`plan-330-randomize-states-expansion`, working tree clean) reports:

```
Checked 765 files in 609ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Walk `pack.states`. For each `s` with `s.i > 0 && !s.removed`:
  1. Capture `previous = typeof s.expansionism === "number" ? s.expansionism : 1`
     (the legacy default — see `set-entity-expansionism.ts` line 77).
  2. Compute `next = round1(random() * 4 + 1)` — random in `(1, 5]`,
     rounded to 1 decimal. Matches the legacy formula
     `rn(Math.random() * 4 + 1, 1)`.
  3. Assign `s.expansionism = next`.
  4. Push `{ i, name, previous, expansionism: next }` to the changes
     array.
- After mutating every active state, call
  `recalculateStates(true, true)` exactly once. (The legacy editor
  passes `(true, true)`; the second arg appears to be unused by the
  function body shown but we mirror the call for fidelity.)
- Return a sorted (by `i` ascending) `changes` array.

### Randomness abstraction

Tests need determinism. The runtime exposes
`randomExpansionism(): number` returning a pre-rounded value.
The default implementation reads `globalThis.rn` if present (matching
the legacy `rn()` global helper) and falls back to a manual
`Math.round((Math.random() * 4 + 1) * 10) / 10` if not. Tests inject a
deterministic stub.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input. (Adding a `seed` was
considered and rejected: the legacy UI doesn't expose one, and tests
inject the random function via the runtime instead.)

### Validation

- `pack.states` must exist and be an array. If not, return an error.
- `recalculateStates` must be a function on `globalThis`. If not,
  return an error.
- If zero active states exist (`i > 0 && !removed`), return ok with
  an empty `changes` array and **do not** call `recalculateStates`
  (nothing to recompute; matches the spirit of the legacy behavior
  since the UI only shows the Randomize button when states exist).

### Errors (verbatim)

- `"window.pack.states is not available; the map hasn't finished loading."`
  — when `pack.states` is missing or not an array.
- `"window.recalculateStates is not available."` — when the global
  is missing or not a function.
- Runtime errors thrown by `recalculateStates` are surfaced via
  `errorResult(err instanceof Error ? err.message : String(err))`. The
  state mutations are **NOT** rolled back — they have already been
  written to `pack`. This is a documented limitation; same shape as
  `set-state-type.ts` which best-efforts the recalc.

### Success result

```ts
okResult({
  changes: [
    { i: 1, name: "Rookhold", previous: 1.0, expansionism: 3.4 },
    { i: 2, name: "Ashholm",  previous: 2.5, expansionism: 1.7 },
    ...
  ]
})
```

The summary records every active state's old and new expansionism so
the LLM can describe what changed without a second tool call. Sorted
by `i` ascending for stability.

When zero active states exist:

```json
{ "ok": true, "changes": [] }
```

## Files

- **NEW** `src/ai/tools/randomize-states-expansion.ts` — the tool,
  patterned on `regenerate-diplomacy.ts` + `set-state-type.ts`.
  Exports:
  - `interface RandomizeStatesExpansionChange { i: number; name: string;
    previous: number; expansionism: number; }`
  - `interface RandomizeStatesExpansionRuntime { randomExpansionism(): number;
    getStates(): RawState[] | undefined; recalculate(): void; }`
  - `defaultRandomizeStatesExpansionRuntime` — reads `globalThis.rn`
    (or falls back); reads `getPackCollection<RawState>("states")`;
    looks up `getGlobal<(must: boolean, randomize: boolean) => void>("recalculateStates")`
    and invokes it with `(true, true)`.
  - `createRandomizeStatesExpansionTool(runtime?)` returning `Tool`
    named `randomize_states_expansion`.
  - `randomizeStatesExpansionTool` — default-runtime instance.
- **NEW** `src/ai/tools/randomize-states-expansion.test.ts` — Vitest
  spec (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { randomizeStatesExpansionTool } from "./tools/randomize-states-expansion";`
    immediately after the `randomize-iceberg-shape` import (line
    176) — alphabetical: `iceberg-shape` < `states-expansion`.
  - Add a re-export block immediately after the
    `randomize-iceberg-shape` re-export (around lines 1807-1813).
  - Add `registry.register(randomizeStatesExpansionTool);` in
    `defaultToolRegistry()` adjacent to
    `randomizeIcebergShapeTool` (line 2955).

## Tests (Vitest)

Mirror the layout of `regenerate-diplomacy.test.ts` +
`set-state-type.test.ts`.

### `randomize_states_expansion tool` (unit, runtime stubbed)

1. **Happy path — captures previous BEFORE mutating, randomizes every
   active state, calls recalculate exactly once AFTER all mutations.**
   - Build a `pack`-shape with states `[{ i:0, name:"Neutrals" },
     { i:1, name:"A", expansionism: 1.0 },
     { i:2, name:"B", expansionism: 2.5 },
     { i:3, name:"Gone", removed: true, expansionism: 4.2 },
     { i:4, name:"C", expansionism: 3.0 }]`.
   - Stub `randomExpansionism` to return a sequence
     `[3.4, 1.7, 9.9]` (the 9.9 should never be consumed because it
     would be the 4th call and we expect only 3 — pin via the call
     count assertion).
   - Stub `recalculate` to: when called, snapshot
     `getStates()` and assert each active state already has its
     **new** value (not the previous). Use a closure-captured
     `recalculateSnapshot` array to verify order.
   - Assert the `changes` array equals
     `[{ i:1, name:"A", previous:1.0, expansionism:3.4 },
       { i:2, name:"B", previous:2.5, expansionism:1.7 },
       { i:4, name:"C", previous:3.0, expansionism:9.9 }]`.
     Wait — that contradicts the 9.9 pin. Use a 3-element sequence
     `[3.4, 1.7, 4.0]` instead so each call is consumed exactly once.
   - Assert `randomExpansionism` was called exactly 3 times (once per
     active state).
   - Assert `recalculate` was called exactly 1 time and **after** the
     last `randomExpansionism` call (use `mock.invocationCallOrder`).
   - Assert state 0 and state 3 (removed) were NOT mutated:
     `states[0].expansionism === undefined` and
     `states[3].expansionism === 4.2`.
2. **Captures previous BEFORE mutating** (regression test).
   - Snapshot `previous` values in a `seenPrevious` array via the
     `randomExpansionism` mock — each call inspects the corresponding
     state and records its current `expansionism`. After the tool
     runs, assert all snapshots equal the original values, not the
     post-randomize values. This is the load-bearing test for
     "previous reflects pre-mutation state".
3. **Empty active states → ok with empty changes; recalculate NOT
   called.**
   - Pack has only `{ i:0 }` and `{ i:1, removed: true }`.
   - Tool returns `{ ok: true, changes: [] }`. `recalculate` never
     called. `randomExpansionism` never called. (Documented behavior
     per Validation section.)
4. **Missing pack.states → error.**
   - Stub `getStates()` returns `undefined`. Result is
     `isError: true` with the verbatim error
     `"window.pack.states is not available; the map hasn't finished loading."`.
5. **Missing recalculateStates → error.**
   - Stub `recalculate()` throws
     `"window.recalculateStates is not available."`. Result is
     `isError: true` with that message. Mutations have already
     happened — assert the active state's expansionism is the new
     value, documenting the no-rollback behavior.
6. **Runtime error inside recalculate is surfaced; mutations not
   rolled back.**
   - Stub `recalculate()` throws `"boom"`. Result is `isError: true`
     with error `"boom"`. Active state's expansionism is already
     mutated — assert this, documenting the limitation.
7. **Tool name + schema + registry round-trip.**
   - `tool.name === "randomize_states_expansion"`.
   - `input_schema.type === "object"`, `input_schema.properties ===
     {}`, `input_schema.required === undefined`.
   - Register in fresh `ToolRegistry`, list contains
     `"randomize_states_expansion"`.
8. **Empty-input handling.** Parametric over `{}`, `null`,
   `undefined`, `{ extra: "ignored" }` — all succeed identically.
9. **Sort order.** Build a pack with active states `[{i:5}, {i:2},
   {i:7}, {i:1}]` (yes, can the array have arbitrary order? In
   practice `pack.states` is dense and indexed by `i`, but defensive
   sorting still matters for the documented contract). The result's
   `changes` array is `i` ascending: 1, 2, 5, 7. Use
   `randomExpansionism` to return distinct values per call so the
   ordering test is unambiguous.

### `defaultRandomizeStatesExpansionRuntime (integration)`

10. **End-to-end with populated globals + stubbed `globalThis.rn`.**
    - Save/restore `globalThis.pack`, `globalThis.recalculateStates`,
      and `globalThis.rn` per test.
    - Set `globalThis.rn = (n, p) => Math.round(n * 10 ** p) / 10 ** p;`
      (the legacy helper).
    - Stub `Math.random` to return a deterministic value (use
      `vi.spyOn(Math, "random").mockReturnValue(0.25)` so each call
      returns the same value; expansionism =
      `Math.round((0.25 * 4 + 1) * 10) / 10 = 2.0`).
    - Set `globalThis.pack = { states: [{ i:0 }, { i:1, name:"A",
      expansionism: 1.0 }, { i:2, name:"B", expansionism: 2.5 }] }`.
    - Set `globalThis.recalculateStates = vi.fn()`.
    - Execute the tool. Assert:
      - `recalculateStates` was called once with arguments
        `(true, true)`.
      - `pack.states[1].expansionism === 2.0`,
        `pack.states[2].expansionism === 2.0`.
      - Result `changes` array contains both states with
        `previous: 1.0` and `previous: 2.5` respectively.
    - `Math.random` spy is restored in `afterEach`.
11. **Fallback when globalThis.rn is missing.**
    - Same setup as §10 but **omit** `globalThis.rn`. Same expected
      result — proves the manual `Math.round(... * 10) / 10`
      fallback works.
12. **Errors when globalThis.recalculateStates missing.**
    - Set pack with active states; leave `recalculateStates`
      undefined. Result is `isError: true` with the verbatim error
      `"window.recalculateStates is not available."`.
    - **But mutations should still have happened** — assert
      `pack.states[1].expansionism` is the new value, documenting
      the limitation.
13. **Errors when pack missing entirely.**
    - `globalThis.pack = undefined`. Result is `isError: true` with
      `"window.pack.states is not available; the map hasn't finished loading."`.
      Nothing was mutated (nothing to mutate).

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `randomizeStatesExpansion` does
  exactly two things: (1) mutate every active state's `expansionism`
  to a fresh `rn(Math.random() * 4 + 1, 1)` value, and (2) call
  `recalculateStates(true, true)`. The DOM input update is a UI-only
  affordance (the editor keeps its visible inputs in sync) and is
  intentionally skipped — the AI doesn't own the editor DOM, and
  `recalculateStates` itself calls `refreshStatesEditor()` at the
  end of its body (see line 859), which re-reads `pack.states` and
  rebuilds those inputs from scratch if the editor is open. So our
  tool achieves the same end state without poking the DOM directly.
- **`pack.states` filter.** The legacy walk uses `if (!s.i || s.removed) return;`
  which is `s.i === 0` or `s.removed === true`. Our active filter
  `s.i > 0 && !s.removed` is the same condition (assuming no negative
  `i`, which would be invariant-breaking elsewhere).
- **Random formula.** `rn(Math.random() * 4 + 1, 1)` produces a value
  in `(1, 5]` rounded to 1 decimal. Manual fallback
  `Math.round(x * 10) / 10` is the same identity for `p=1`. Test §10
  pins both paths.
- **Captures previous BEFORE mutating.** Test §2 is load-bearing for
  this exact concern raised in the prompt. The implementation reads
  `s.expansionism` into `previous` BEFORE the assignment to
  `s.expansionism = next`, so this is correct by construction. The
  test pins it via the random-stub introspection technique so a
  regression that read `previous` post-assignment would fail.
- **`recalculate` called exactly once AFTER all mutations.** Test §1
  uses `vi.fn().mock.invocationCallOrder` to assert the final
  `randomExpansionism` call's order is less than the `recalculate`
  call's order. A regression that called `recalculate` per-state
  would fail both the order check and the call-count check.
- **Recalculate args `(true, true)`.** Test §10 asserts
  `recalculateStates` was called with `(true, true)`. The legacy
  function ignores the second arg in its visible body, but mirroring
  the call shape is the right thing — the legacy function's
  signature is the source of truth.
- **Empty active states behavior.** Plan documents we skip
  `recalculate` in this case. Rationale: the only operations
  `recalculate` performs (`States.expandStates`, `Provinces.generate`,
  redraws) are no-ops or worse on empty input. Test §3 pins this.
- **No rollback.** Tests §5, §6, §12 explicitly assert mutations
  persist when recalculate fails. Plan documents this as a known
  limitation. Adding rollback would require snapshotting all
  expansionism values up front and restoring on error — feasible
  but adds complexity for a marginal benefit (the user can re-run
  the tool, or re-set values via `set_entity_expansionism`).
- **Sort order.** Test §9 ensures the `changes` array is sorted by
  `i` ascending regardless of pack order. Implementation: collect
  changes during the walk, then `changes.sort((a, b) => a.i - b.i)`
  before returning. This is the documented contract.
- **Empty-input schema.** `properties: {}`, no `required` — matches
  `regenerate_diplomacy` exactly. Test §7 pins the schema shape and
  the registry round-trip.
- **Error wording matches neighbours.** "is not available; the map
  hasn't finished loading" mirrors `regenerate_diplomacy`'s wording.
  The shorter `"window.recalculateStates is not available."` is
  warranted because `recalculateStates` is a UI helper, not a model
  generator — the failure mode is "global not exposed", not "map
  not yet generated", so the wording differs deliberately.
- **Alphabetical insertion.** `randomize-states-expansion` slots
  immediately after `randomize-iceberg-shape` alphabetically (`iceberg-shape`
  < `states-expansion`) and the tasks file pins exact line numbers
  to insert the import / re-export / registration.
- **No skipping of state 0 in the legacy random check.** The legacy
  uses `if (!s.i)` which evaluates `0` as falsy. We use `s.i > 0`
  which is equivalent for the always-non-negative-integer state ids
  that the codebase enforces.
- **Default expansionism fallback.** When `s.expansionism` is missing
  (data-load edge case), `previous` is reported as `1` per
  `set-entity-expansionism.ts` precedent. Test §1 doesn't exercise
  this path — added as a one-liner check within §1 by setting one
  state without `expansionism` and asserting `previous: 1`.
  (Updated test §1 below to incorporate this.)
- **Regression protection: capture-before-mutate.** Test §2 is the
  explicit guard the prompt called out. Verified present.
