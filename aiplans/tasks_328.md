# Tasks 328: `regenerate_diplomacy` tool

Sequenced implementation tasks for plan 328.

1. **Create the tool file** `src/ai/tools/regenerate-diplomacy.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`,
     `getPackCollection`, `okResult`, `type RawState`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define `interface RegenerateDiplomacyResult { states_count: number;
     histogram: Record<string, number>; }`.
   - Define `interface RegenerateDiplomacyRuntime { regenerate(): void;
     summarize(): RegenerateDiplomacyResult; }`.
   - Define internal `interface StatesModule { generateDiplomacy?: () => void; }`.
   - Implement `defaultRegenerateDiplomacyRuntime`:
     - `regenerate()`: `const m = getGlobal<StatesModule>("States");
       if (!m || typeof m.generateDiplomacy !== "function") throw new
       Error("States.generateDiplomacy is not available; the map hasn't
       finished loading."); m.generateDiplomacy();`
     - `summarize()`: read `getPackCollection<RawState>("states")`. If
       not an array, return `{ states_count: 0, histogram: {} }`. Walk
       active states (`s.i > 0 && !s.removed`) building an `actives`
       array. For `i < j` over actives, read `actives[i].diplomacy?.[actives[j].i]`;
       skip null/undefined; otherwise increment `histogram[relation]`.
       Return `{ states_count: actives.length, histogram }`.
   - Implement `createRegenerateDiplomacyTool(runtime = default)`:
     - `name: "regenerate_diplomacy"`.
     - Description mentions Diplomacy editor's Regenerate button,
       delegation to `States.generateDiplomacy`, no input, returns
       `states_count` + relation histogram.
     - `input_schema: { type: "object", properties: {} }` — no
       `required`.
     - `execute(_rawInput)`: try `runtime.regenerate()` in try/catch;
       on throw return `errorResult(...)`. On success call
       `runtime.summarize()` and return
       `okResult({ states_count, histogram })`.
   - Export `regenerateDiplomacyTool = createRegenerateDiplomacyTool()`.

2. **Create the test file** `src/ai/tools/regenerate-diplomacy.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `type RawState` from `./_shared`; default + factory +
     types from `./regenerate-diplomacy`; `ToolRegistry` (or whatever
     the registry export is — verify in step 3) from `./index`.
   - `describe("regenerate_diplomacy tool", …)`:
     - **§1 Happy path**: `regenerate` and `summarize` are
       `vi.fn()`s; tool returns the histogram from `summarize`.
       Assert call counts (1 each), assert
       `regenerate.mock.invocationCallOrder[0] <
       summarize.mock.invocationCallOrder[0]`.
     - **§2 Surfaces runtime errors**: `regenerate` throws; result is
       error; `summarize` not called.
     - **§3 Tool name + registry round-trip**: assert `tool.name`,
       `input_schema`. Register in a fresh registry, dispatch by name.
     - **§4 Empty-input handling**: parametric over `{}`, `null`,
       `undefined`, `{ extra: "ignored" }` — all succeed identically.
   - `describe("defaultRegenerateDiplomacyRuntime (integration)", …)`:
     - Save/restore `globalThis.States` and `globalThis.pack` per
       test (mirror `regenerate-emblems.test.ts`).
     - **§5 Calls States.generateDiplomacy and reports histogram**:
       3 active states; mock writes diplomacy arrays; assert
       histogram and `states_count: 3`.
     - **§6 Skips removed states / state 0**: 4 states, one removed;
       only one valid pair; histogram has one entry.
     - **§7 Empty histogram when < 2 active states**: only state 0 + 1
       active state; mock is a no-op; tool returns `{ states_count: 1,
       histogram: {} }`.
     - **§8 Errors when States missing**: `globalThis.States =
       undefined` → error matching `/States\.generateDiplomacy/`.
     - **§9 Errors when generateDiplomacy is not a function**.
     - **§10 Surfaces a thrown runtime error**: `generateDiplomacy`
       throws `"boom"` → error `"boom"`.

3. **Registry round-trip pattern** — neighbouring regenerate-* tests
   (`regenerate-emblems.test.ts`, `regenerate-zones.test.ts`,
   `regenerate-domain.test.ts`) do NOT actually round-trip through
   `ToolRegistry`; they just assert `tool.name` and exercise
   `tool.execute()` directly. To match the precedent of those
   neighbours, the new test will:
   - Assert `tool.name === "regenerate_diplomacy"`.
   - Assert `tool.input_schema.type === "object"` and
     `tool.input_schema.properties` is `{}`.
   - Assert `tool.input_schema.required` is `undefined` (no required
     fields).
   For full registry coverage, also import `ToolRegistry` from
   `./index` (mirroring `add-burg-group.test.ts`), register the tool,
   and assert `registry.list().map(t => t.name).includes("regenerate_diplomacy")`.
   This is a one-liner extra and gives genuine round-trip confidence
   without requiring registry-level dispatch wiring.

4. **Wire into `src/ai/index.ts`**:
   - Add `import { regenerateDiplomacyTool } from "./tools/regenerate-diplomacy";`
     between line 182 (`regenerate-burg-name`) and line 183
     (`regenerate-domain`).
   - Add a re-export block (createTool + types + default tool) between
     the `regenerate-burg-name` re-export (line 1834-1839) and the
     `regenerate-domain` re-export (line 1840-1846):
     ```ts
     export {
       createRegenerateDiplomacyTool,
       defaultRegenerateDiplomacyRuntime,
       type RegenerateDiplomacyResult,
       type RegenerateDiplomacyRuntime,
       regenerateDiplomacyTool,
     } from "./tools/regenerate-diplomacy";
     ```
   - Add `registry.register(regenerateDiplomacyTool);` in
     `defaultToolRegistry()` between `regenerateRouteNameTool` (line
     2923) and `regenerateZonesTool` (line 2924).

5. **Run `npm test`.** Fix any failures. Iterate until green.

6. **Run `npx tsc --noEmit`.** Fix any type errors.

7. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

8. **Stage and commit** on the `plan-328-regenerate-diplomacy` branch:
   - `git add aiplans/plan_328.md aiplans/tasks_328.md
     src/ai/tools/regenerate-diplomacy.ts
     src/ai/tools/regenerate-diplomacy.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add regenerate_diplomacy tool

     Implements plan 328. Adds an AI chat tool that calls
     States.generateDiplomacy() to re-randomize all inter-state
     diplomatic relations, mirroring the "Regenerate" button in the
     diplomacy editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
