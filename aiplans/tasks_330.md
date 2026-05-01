# Tasks 330: `randomize_states_expansion` tool

Sequenced implementation tasks for plan 330.

1. **Create the tool file** `src/ai/tools/randomize-states-expansion.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`,
     `getPackCollection`, `okResult`, `type RawState`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define `interface RandomizeStatesExpansionChange { i: number;
     name: string; previous: number; expansionism: number; }`.
   - Define `interface RandomizeStatesExpansionRuntime {
     randomExpansionism(): number; getStates(): RawState[] | undefined;
     recalculate(): void; }`.
   - Implement `defaultRandomizeStatesExpansionRuntime`:
     - `randomExpansionism()`: try
       `const rn = getGlobal<(n: number, p: number) => number>("rn");`
       and use `rn(Math.random() * 4 + 1, 1)` if it's a function;
       otherwise `Math.round((Math.random() * 4 + 1) * 10) / 10`.
     - `getStates()`: `getPackCollection<RawState>("states")`.
     - `recalculate()`: `const fn = getGlobal<(must: boolean,
       randomize: boolean) => void>("recalculateStates"); if (typeof
       fn !== "function") throw new Error("window.recalculateStates is
       not available."); fn(true, true);`.
   - Implement `createRandomizeStatesExpansionTool(runtime = default)`:
     - `name: "randomize_states_expansion"`.
     - Description mentions the States Editor's Randomize button,
       formula `random in (1,5] rounded to 1 decimal`, mentions
       `recalculateStates(true, true)` is invoked once after all
       mutations, no input.
     - `input_schema: { type: "object", properties: {} }` — no
       `required`.
     - `execute(_rawInput)`:
       1. `const states = runtime.getStates(); if (!Array.isArray(states))
          return errorResult("window.pack.states is not available; the
          map hasn't finished loading.");`
       2. Walk states. For each `s` with `s.i > 0 && !s.removed`:
          - Capture `previous = typeof s.expansionism === "number" ?
            s.expansionism : 1` BEFORE mutation.
          - Compute `next = runtime.randomExpansionism()`.
          - Assign `s.expansionism = next`.
          - Push `{ i: s.i, name: s.name ?? "", previous, expansionism:
            next }` into `changes`.
       3. Sort `changes` by `i` ascending.
       4. If `changes.length === 0`, return
          `okResult({ changes: [] })` (do NOT call recalculate).
       5. Otherwise try `runtime.recalculate()` in try/catch; on throw
          return `errorResult(err instanceof Error ? err.message :
          String(err))` (mutations remain in place — documented
          limitation).
       6. Return `okResult({ changes })`.
   - Export `randomizeStatesExpansionTool =
     createRandomizeStatesExpansionTool()`.

2. **Create the test file** `src/ai/tools/randomize-states-expansion.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `type RawState` from `./_shared`; default + factory +
     types from `./randomize-states-expansion`; `ToolRegistry` from
     `./index`.
   - Helper `makeRuntime(opts)` that builds a runtime with stubbed
     `randomExpansionism` (sequence-based) / `getStates` / `recalculate`
     fns and returns the runtime + the spies.
   - `describe("randomize_states_expansion tool", …)`:
     - **§1 Happy path**: states `[{i:0,name:"Neutrals"},
       {i:1,name:"A",expansionism:1.0}, {i:2,name:"B",expansionism:2.5},
       {i:3,name:"Gone",removed:true,expansionism:4.2},
       {i:4,name:"NoExp"}, {i:5,name:"C",expansionism:3.0}]`.
       `randomExpansionism` sequence `[3.4, 1.7, 9.2, 4.0]` (4 active
       states: 1, 2, 4, 5 — note state 4 has no `expansionism` so
       `previous: 1`).
       Assertions:
       - `randomExpansionism` called exactly 4 times.
       - `recalculate` called exactly once.
       - `recalculate.mock.invocationCallOrder[0]` >
         last `randomExpansionism.mock.invocationCallOrder` entry.
       - State 0 not mutated; state 3 (removed) keeps
         `expansionism: 4.2`.
       - States 1, 2, 4, 5 are mutated in place to `[3.4, 1.7, 9.2,
         4.0]` respectively.
       - `changes` array equals
         `[{ i:1, name:"A", previous:1.0, expansionism:3.4 },
           { i:2, name:"B", previous:2.5, expansionism:1.7 },
           { i:4, name:"NoExp", previous:1, expansionism:9.2 },
           { i:5, name:"C", previous:3.0, expansionism:4.0 }]`.
     - **§2 Captures previous BEFORE mutating** (regression test):
       `randomExpansionism` mock peeks at the corresponding state's
       current `expansionism` and pushes it onto a `seenWhenCalled`
       array; after the run, assert this array equals
       `[1.0, 2.5, 3.0]` for states `[{i:1,exp:1.0}, {i:2,exp:2.5},
       {i:3,exp:3.0}]`. If the implementation mutated before capturing
       previous, the seen values would be the new ones.
     - **§3 Empty active states → ok with empty changes; recalculate
       NOT called.** States `[{i:0}, {i:1, removed:true}]`. Result is
       `{ ok:true, changes:[] }`. `recalculate` and `randomExpansionism`
       both never called.
     - **§4 Missing pack.states → error.** `getStates` returns
       `undefined`. Error: verbatim
       `"window.pack.states is not available; the map hasn't finished loading."`.
       `recalculate` and `randomExpansionism` never called.
     - **§5 recalculate throws "not available" → error; mutations
       persist.** States with one active. `recalculate` throws
       `new Error("window.recalculateStates is not available.")`.
       Result is error with that message. The active state's
       `expansionism` is the new value (no rollback).
     - **§6 recalculate throws "boom" → error; mutations persist.**
       Same shape as §5 but error string is `"boom"`.
     - **§7 Tool name + schema + registry round-trip.**
       `tool.name === "randomize_states_expansion"`,
       `input_schema.type === "object"`, `properties === {}`,
       `required === undefined`. Then
       `new ToolRegistry()`, `register(...)`, `list().map(t => t.name)`
       contains `"randomize_states_expansion"`.
     - **§8 Empty-input handling.** Parametric over `{}`, `null`,
       `undefined`, `{ extra: "ignored" }` — all behave identically.
       Use a 4-element random sequence for an active set of size 1
       repeated 4 times via `mockReset` between iterations. (Or just
       set sequence `[1,2,3,4]` and confirm each tool call uses the
       next entry.) Recalc invoked 4 times total.
     - **§9 Sort order.** States in pack order
       `[{i:0}, {i:5,name:"e"}, {i:2,name:"b"}, {i:7,name:"g"},
       {i:1,name:"a"}]`. Random sequence `[5.5, 2.2, 7.7, 1.1]`
       (matched to pack order). Result `changes` array order is `i`
       ascending: 1, 2, 5, 7. Verify the `expansionism` values in the
       result match what was assigned to each state by `i` (so state
       1 gets `1.1`, state 2 gets `2.2`, state 5 gets `5.5`, state 7
       gets `7.7`).
   - `describe("defaultRandomizeStatesExpansionRuntime (integration)", …)`:
     - Save/restore `globalThis.pack`, `globalThis.recalculateStates`,
       and `globalThis.rn` per test. Restore `Math.random` via
       `vi.restoreAllMocks()` in afterEach.
     - **§10 End-to-end with stubbed rn + Math.random.**
       - `globalThis.rn = (n: number, p: number) => Math.round(n *
         10 ** p) / 10 ** p;`
       - `vi.spyOn(Math, "random").mockReturnValue(0.25);` — yields
         `Math.round((0.25 * 4 + 1) * 10) / 10 = 2.0`.
       - Pack: `{ states: [{i:0}, {i:1,name:"A",expansionism:1.0},
         {i:2,name:"B",expansionism:2.5}] }`.
       - `recalc = vi.fn(); globalThis.recalculateStates = recalc;`
       - Execute. Assert:
         - `recalc` called once with `(true, true)`.
         - `pack.states[1].expansionism === 2.0` and
           `pack.states[2].expansionism === 2.0`.
         - Result content parsed: `changes` length 2, both with
           `expansionism: 2.0`, `previous` of `1.0` and `2.5`.
     - **§11 Fallback when globalThis.rn is missing.**
       - Same as §10 but **omit** `globalThis.rn`. Same expected
         result via the manual fallback.
     - **§12 Errors when globalThis.recalculateStates missing;
       mutations persist.**
       - Pack has active state(s); `globalThis.recalculateStates =
         undefined`. Result is error matching the verbatim message.
         Active state's expansionism IS the new value (no rollback).
     - **§13 Errors when pack missing entirely.**
       - `globalThis.pack = undefined`. Result is error with the
         pack-missing message. (Nothing to mutate.)

3. **Wire into `src/ai/index.ts`**:
   - Add `import { randomizeStatesExpansionTool } from "./tools/randomize-states-expansion";`
     immediately after the `randomize-iceberg-shape` import (currently
     line 176).
   - Add a re-export block immediately after the
     `randomize-iceberg-shape` re-export (currently lines 1807-1813):
     ```ts
     export {
       createRandomizeStatesExpansionTool,
       defaultRandomizeStatesExpansionRuntime,
       type RandomizeStatesExpansionChange,
       type RandomizeStatesExpansionRuntime,
       randomizeStatesExpansionTool,
     } from "./tools/randomize-states-expansion";
     ```
   - Add `registry.register(randomizeStatesExpansionTool);` in
     `defaultToolRegistry()` immediately after
     `registry.register(randomizeIcebergShapeTool);` (currently line
     2955).

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the
   `plan-330-randomize-states-expansion` branch:
   - `git add aiplans/plan_330.md aiplans/tasks_330.md
     src/ai/tools/randomize-states-expansion.ts
     src/ai/tools/randomize-states-expansion.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add randomize_states_expansion tool

     Implements plan 330. Adds an AI chat tool that randomizes every
     active state's expansionism and re-runs the state/province
     expansion to update borders, mirroring the "Randomize" button in
     the states editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
