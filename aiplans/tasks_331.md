# Tasks 331: `reset_state_diplomacy` tool

Sequenced implementation tasks for plan 331.

1. **Create the tool file** `src/ai/tools/reset-state-diplomacy.ts`:
   - Imports from `./_shared`: `errorResult`, `getPack`, `isActive`,
     `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Import `type BurgPackLike, resolveStateRefInPack` from
     `./list-burgs` (same pattern as `set-diplomacy.ts`).
   - Define types:
     - `interface ResetStateDiplomacyChange { other_state: { i: number; name: string }; previous: string; new: "Neutral"; }`
     - `interface ResetStateDiplomacyResult { state: { i: number; name: string }; changes: ResetStateDiplomacyChange[]; }`
     - `interface ResetStateDiplomacyError { error: string }` (returned
       internally; tool wraps in `errorResult`).
     - `interface ResetStateDiplomacyRuntime { reset(ref: number | string): ResetStateDiplomacyResult | ResetStateDiplomacyError; }`
   - Local helper `isValidRef(value: unknown): boolean` mirroring the
     one in `set-diplomacy.ts`: `typeof === "number" && Number.isInteger
     && >= 1` OR `typeof === "string" && trimmed length > 0`.
   - Implement `defaultResetStateDiplomacyRuntime`:
     - `reset(ref)`:
       - `const pack = getPack<BurgPackLike>();`
       - `const id = resolveStateRefInPack(pack, ref);`
       - If `id === null` → `{ error: \`State ${JSON.stringify(ref)} not found.\` }`.
       - If `id === 0` → `{ error: "Cannot reset diplomacy for state 0 (the Neutrals placeholder)." }`.
       - `const state = pack?.states?.[id];`
       - If `!state` or `!isActive(state)` → defensive
         `{ error: \`Cannot reset diplomacy for removed state ${id}.\` }`.
       - `const dip = (state as { diplomacy?: unknown }).diplomacy;`
         If `!Array.isArray(dip)` → return
         `{ state: { i: id, name: state.name ?? "" }, changes: [] }`
         (graceful no-op).
       - Build `changes: ResetStateDiplomacyChange[] = []`.
       - Loop `for (let j = 0; j < dip.length; j++)`:
         - `if (dip[j] === "x") continue;`
         - `if (j === id) continue;` (defensive)
         - `if (j <= 0) continue;` (skip state 0 slot)
         - `const other = pack?.states?.[j];`
         - `if (!other || other.removed) continue;`
         - `const otherDip = (other as { diplomacy?: unknown }).diplomacy;`
           `if (!Array.isArray(otherDip)) continue;`
         - `const previous = dip[j];`
         - `if (previous === "Neutral") continue;`
         - `dip[j] = "Neutral";`
         - `otherDip[id] = "Neutral";`
         - `changes.push({ other_state: { i: j, name: other.name ?? "" }, previous: String(previous), new: "Neutral" });`
       - Return `{ state: { i: id, name: state.name ?? "" }, changes }`.
   - Implement `createResetStateDiplomacyTool(runtime = default)`:
     - `name: "reset_state_diplomacy"`.
     - Description (concise): "Reset a single state's diplomatic
       relations with every other state to Neutral — same as the Reset
       button in the Diplomacy editor. Mirrors the change on the
       counterpart side. The `\"x\"` diagonal and slots involving
       state 0 / removed states are preserved. Returns the per-pair
       changes that were actually applied."
     - `input_schema: { type: "object", properties: { state: { type:
       ["integer", "string"], description: "Numeric state id (> 0) or
       the state's current name." } }, required: ["state"] }`.
     - `execute(rawInput)`:
       - `const input = (rawInput ?? {}) as { state?: unknown };`
       - If `!isValidRef(input.state)` → `errorResult("state must be a
         positive integer id or a non-empty name string.")`.
       - `const ref = input.state as number | string;`
       - `const out = runtime.reset(ref);`
       - If `"error" in out` → `errorResult(out.error)`.
       - Otherwise `okResult({ state: out.state, changes: out.changes })`.
   - Export `resetStateDiplomacyTool = createResetStateDiplomacyTool()`.

2. **Create the test file** `src/ai/tools/reset-state-diplomacy.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `type RawState` from `./_shared`; `ToolRegistry` from
     `./index`; default + factory + types from
     `./reset-state-diplomacy`.
   - Helper `makeRuntime(reset: ResetStateDiplomacyRuntime["reset"])
     → { runtime, reset }` returning a `vi.fn`-wrapped reset.

   - `describe("reset_state_diplomacy tool", …)` (stub-runtime tests):
     - **§1 Happy path: mixed relations** — runtime returns 3 changes;
       tool returns `{ ok: true, state: {...}, changes: [...] }`;
       `reset` called once with `1`.
     - **§2 Happy path: all already Neutral** — runtime returns
       `{ state: {...}, changes: [] }`; tool returns `ok` with empty
       `changes`.
     - **§3 State ref by name (case-insensitive)** — pass `"rookhold"`,
       runtime asserts received argument unchanged.
     - **§4 State ref by id** — pass `5`.
     - **§5 Invalid input shape** — parametric `null`, `undefined`,
       `0`, `-1`, `1.5`, `""`, `"   "`, `[]`, `{}` for `state`. All
       `isError`. `reset` not called.
     - **§6 Runtime returns error** — runtime returns `{ error: "State
       99 not found." }`; tool returns `errorResult` with that
       message.
     - **§7 Tool name + schema + registry round-trip** — assert
       `tool.name === "reset_state_diplomacy"`,
       `tool.input_schema.type === "object"`,
       `tool.input_schema.required` deep-equals `["state"]`,
       `tool.input_schema.properties.state.type` deep-equals `["integer",
       "string"]`. Then `new ToolRegistry()`, `registry.register(
       resetStateDiplomacyTool)`, `expect(registry.list().map(t =>
       t.name)).toContain("reset_state_diplomacy")`.

   - `describe("defaultResetStateDiplomacyRuntime (integration)", …)`:
     - `beforeEach` sets `globalThis.pack` to a 6-entry states array
       (Neutrals 0, Rookhold 1, Ashholm 2, Greycliff 3 with
       `removed: true`, Marrowmere 4, Tideford 5). Each state has a
       diplomacy array of length 6 (set per-test as needed).
       `afterEach` restores the saved `originalPack`.
     - **§8 Happy path mutates both sides and tracks previous values**:
       Set `pack.states[1].diplomacy = ["x", "x", "Friendly", "x",
       "Enemy", "Vassal"]`. Initialise mirror sides too: `states[2]
       .diplomacy[1] = "Friendly"`, `states[4].diplomacy[1] = "Enemy"`,
       `states[5].diplomacy[1] = "Suzerain"` (the Vassal counterpart).
       Run `resetStateDiplomacyTool.execute({ state: 1 })`. Assert:
       - Result `ok: true`, `state: { i: 1, name: "Rookhold" }`.
       - `changes.length === 3`.
       - Each change has the right `other_state.i` (2, 4, 5) and the
         right `previous` (`"Friendly"`, `"Enemy"`, `"Vassal"`) and
         `new: "Neutral"`.
       - `pack.states[1].diplomacy` deep-equals `["x", "x", "Neutral",
         "x", "Neutral", "Neutral"]` — the `"x"` slots are preserved.
       - **Mirror writes** (load-bearing):
         `pack.states[2].diplomacy[1] === "Neutral"`,
         `pack.states[4].diplomacy[1] === "Neutral"`,
         `pack.states[5].diplomacy[1] === "Neutral"`.
       - `pack.states[3]` (removed) untouched.
       - `pack.states[0].diplomacy` untouched.
     - **§9 Already-Neutral pairs are no-ops, no spurious mirror
       writes**: Set `pack.states[1].diplomacy = ["x", "x", "Neutral",
       "x", "Neutral", "Neutral"]`. Pre-set `pack.states[2].diplomacy[1]
       = "Suspicion"` (intentional pre-existing inconsistency). Run
       reset. Assert:
       - `result.changes` is `[]`.
       - `pack.states[2].diplomacy[1]` is **still** `"Suspicion"` (no
         spurious write — pins idempotence).
       - `pack.states[1].diplomacy` unchanged.
     - **§10 State ref by name (case-insensitive)**: call with
       `{ state: "rOoKhOlD" }`. Pre-set Self diplomacy with one
       Friendly. Verify the change is recorded and mirror written.
     - **§11 Sparse states list — undefined slots are skipped**:
       `pack.states[3] = undefined`. Set `pack.states[1].diplomacy =
       ["x", "x", "Friendly", "Enemy", "Neutral", "x"]`. Run reset.
       Assert:
       - `pack.states[1].diplomacy[3]` is **still** `"Enemy"` (we
         skipped because `pack.states[3]` is undefined).
       - `changes` contains the slot-2 change only (`Friendly` →
         `Neutral` for state 2).
       - `pack.states[2].diplomacy[1] === "Neutral"`.
     - **§12 State 0 rejected** — `{ state: 0 }` → `isError: true`,
       error matches `/positive integer id/` (input-shape check
       triggers first).
     - **§13 Removed state rejected** — `{ state: 3 }` → `isError:
       true`, error matches `/not found/` (`resolveStateRefInPack`
       returns null for removed states).
     - **§14 State not found**:
       - `{ state: 999 }` → error `/not found/`.
       - `{ state: "Atlantis" }` → error `/not found/`.
     - **§15 No diplomacy array — graceful no-op**: set
       `pack.states[1].diplomacy = undefined`. Run reset. Result is
       `ok: true`, `state: { i: 1, name: "Rookhold" }`, `changes: []`.
     - **§16 Diplomacy is not an array** — set
       `pack.states[1].diplomacy = ("nope" as unknown as string[])`.
       Run reset. `ok: true`, `changes: []`.
     - **§17 pack missing entirely**: `globalThis.pack = undefined`.
       Result is `isError: true` with `/not found/` (resolver returns
       null when pack missing).

3. **Wire into `src/ai/index.ts`**:
   - Add `import { resetStateDiplomacyTool } from "./tools/reset-state-diplomacy";`
     between line 217 (`import { removeZoneTool } from
     "./tools/remove-zone";`) and line 218 (`import { renameBiomeTool }
     from "./tools/rename-biome";`). Alphabetical: `reset-` sorts after
     `remove-zone` and before `rename-`.
   - Add a re-export block between the `remove-zone` re-export
     (line 2025-2028) and the `rename-biome` re-export (line 2029-2033):
     ```ts
     export {
       createResetStateDiplomacyTool,
       defaultResetStateDiplomacyRuntime,
       type ResetStateDiplomacyChange,
       type ResetStateDiplomacyResult,
       type ResetStateDiplomacyRuntime,
       resetStateDiplomacyTool,
     } from "./tools/reset-state-diplomacy";
     ```
   - Add `registry.register(resetStateDiplomacyTool);` immediately
     after `registry.register(regenerateDiplomacyTool);` (line 2939) —
     keeps the diplomacy actions grouped together in the registry
     listing.

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the `plan-331-reset-state-diplomacy` branch:
   - `git add aiplans/plan_331.md aiplans/tasks_331.md
     src/ai/tools/reset-state-diplomacy.ts
     src/ai/tools/reset-state-diplomacy.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add reset_state_diplomacy tool

     Implements plan 331. Adds an AI chat tool that resets a single
     state's relations with every other state to Neutral (mirrored on
     both sides), matching the "Reset" button in the diplomacy editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
