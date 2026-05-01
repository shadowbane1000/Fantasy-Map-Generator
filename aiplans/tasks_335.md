# Tasks 335: `recalculate_religions` tool

Sequenced implementation tasks for plan 335.

1. **Create the tool file** `src/ai/tools/recalculate-religions.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define `interface RecalculateReligionsRuntime { snapshot(): number[] | null; recalculate(): void; drawReligions(): void; drawReligionCenters(): void; }`.
   - Define internal helper `interface ReligionsModule { recalculate?: () => void; }` (narrow shape so we don't import the full generator class).
   - Define internal helper `interface PackShape { cells?: { religion?: ArrayLike<number> }; }`.
   - Implement `defaultRecalculateReligionsRuntime`:
     - `snapshot()`:
       - `const pack = getGlobal<PackShape>("pack");`
       - `const religion = pack?.cells?.religion;`
       - If `religion` is missing or `typeof religion.length !== "number"`, return `null`.
       - Otherwise return `Array.from(religion as ArrayLike<number>)`.
     - `recalculate()`:
       - `const module = getGlobal<ReligionsModule>("Religions");`
       - If `!module || typeof module.recalculate !== "function"`,
         throw `new Error("Religions.recalculate is not available; the map hasn't finished loading.");`.
       - Otherwise call `module.recalculate()`.
     - `drawReligions()`:
       - `const fn = getGlobal<() => void>("drawReligions");`
       - If `typeof fn === "function"` then `try { fn(); } catch { /* best-effort */ }`.
     - `drawReligionCenters()`:
       - `const fn = getGlobal<() => void>("drawReligionCenters");`
       - If `typeof fn === "function"` then `try { fn(); } catch { /* best-effort */ }`.
   - Implement `createRecalculateReligionsTool(runtime = default)`:
     - `name: "recalculate_religions"`.
     - Description mentions the Religions Editor's Recalculate button,
       that it calls `Religions.recalculate()` (which rewrites
       `pack.cells.religion` via the religion expansion algorithm),
       then best-effort `drawReligions()` and `drawReligionCenters()`.
       Mention it returns the before/after distributions and a
       cells_changed count. Mention takes no input.
     - `input_schema: { type: "object", properties: {} }` — no
       `required`.
     - `execute(_rawInput)`:
       1. `const previous = runtime.snapshot();`
          - If `previous === null`, return
            `errorResult("window.pack is not available; the map hasn't finished loading.");`.
       2. `try { runtime.recalculate(); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`.
       3. `const current = runtime.snapshot();`
          - If `current === null`, return
            `errorResult("window.pack is not available; the map hasn't finished loading.");`
            (defensive — recalc shouldn't drop the array, but safe).
       4. Compute `cells_changed`:
          - `const len = Math.max(previous.length, current.length);`
          - Walk i = 0..len-1; if `previous[i] !== current[i]`,
            increment a counter. Use `previous[i] ?? -1` and
            `current[i] ?? -1` so missing trailing entries count as
            changed.
       5. Compute histograms:
          - `function histogram(arr: number[]): Record<string, number> { const out: Record<string, number> = {}; for (const v of arr) { const k = String(v); out[k] = (out[k] ?? 0) + 1; } return out; }`.
       6. Best-effort draws (each in its own try/catch — runtime
          methods already swallow but tool also wraps so a custom
          runtime that rethrows still doesn't break the result):
          - `try { runtime.drawReligions(); } catch { /* best-effort */ }`.
          - `try { runtime.drawReligionCenters(); } catch { /* best-effort */ }`.
       7. `return okResult({ cells_changed, previous_distribution: histogram(previous), distribution: histogram(current) });`.
   - Export `recalculateReligionsTool = createRecalculateReligionsTool();`.

2. **Create the test file** `src/ai/tools/recalculate-religions.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; default + factory + types from `./recalculate-religions`;
     `ToolRegistry` from `./index`.
   - Helper `makeRuntime(opts)` that builds a runtime with stubbed
     `snapshot` (sequence-based array returning) / `recalculate` /
     `drawReligions` / `drawReligionCenters` fns and returns the
     runtime + the spies.
   - `describe("recalculate_religions tool", …)`:
     - **§1 Happy path — snapshot before recalc, cells_changed
       correct, draw funcs called once each in order.**
       - `snapshot` returns `[0, 0, 1, 1, 2, 2]` then `[0, 1, 1, 2, 2, 2]`.
       - `recalculate` is `vi.fn` (no-op).
       - `drawReligions` and `drawReligionCenters` are `vi.fn`.
       - Execute. Assertions:
         - `recalculate` called exactly once.
         - `drawReligions` called exactly once.
         - `drawReligionCenters` called exactly once.
         - `snapshot` called exactly twice.
         - Call ORDER via `mock.invocationCallOrder`:
           snapshot[0] < recalculate[0] < snapshot[1] < drawReligions[0] < drawReligionCenters[0].
         - Result equals `{ ok: true, cells_changed: 2, previous_distribution: { "0": 2, "1": 2, "2": 2 }, distribution: { "0": 1, "1": 2, "2": 3 } }`. (Indices 1 and 3 differ; index 5 stayed `2`.)
     - **§2 previous_distribution captured BEFORE recalc**
       (regression test for the prompt's mandatory check).
       - `snapshot` returns `[0, 0, 1]` then `[1, 1, 1]`.
       - Execute. Result's `previous_distribution` MUST equal
         `{ "0": 2, "1": 1 }` (the BEFORE shape), NOT `{ "1": 3 }`.
         `distribution` MUST equal `{ "1": 3 }`. `cells_changed` is 2
         (indices 0 and 1 changed; index 2 stayed 1).
     - **§3 No-op recalc → cells_changed = 0.**
       - Both snapshots return `[0, 0, 1, 1]`.
       - Result: `{ ok: true, cells_changed: 0, previous_distribution: { "0": 2, "1": 2 }, distribution: { "0": 2, "1": 2 } }`.
       - Draw funcs still each called once.
     - **§4 Missing pack/cells/religion → error.**
       - `snapshot` returns `null` on first call.
       - Result: `isError: true`, error verbatim
         `"window.pack is not available; the map hasn't finished loading."`.
       - `recalculate`, `drawReligions`, `drawReligionCenters` NOT
         called.
     - **§5 Religions.recalculate missing → error from runtime.**
       - `recalculate` throws `new Error("Religions.recalculate is not available; the map hasn't finished loading.")`.
       - First snapshot returns valid `[0, 1]`.
       - Result: `isError: true` with that message.
       - `drawReligions` and `drawReligionCenters` NOT called.
       - Second `snapshot` NOT called.
     - **§6 Runtime error inside recalculate is surfaced.**
       - `recalculate` throws `new Error("boom")`.
       - First snapshot returns valid array.
       - Result: `isError: true` with `"boom"`. Draw funcs NOT
         called.
     - **§7 drawReligions failure swallowed.**
       - `drawReligions` throws `new Error("draw exploded")`.
       - Tool returns `ok: true` with correct cells_changed /
         distributions.
       - `drawReligionCenters` IS still called (the next
         best-effort step shouldn't be skipped because the previous
         one threw).
     - **§8 drawReligionCenters failure swallowed.**
       - `drawReligionCenters` throws `new Error("centers exploded")`.
       - Tool returns `ok: true`.
     - **§9 Tool name + schema + registry round-trip.**
       - `tool.name === "recalculate_religions"`,
         `input_schema.type === "object"`, `properties === {}`,
         `required === undefined`. Then `new ToolRegistry()`,
         `register(...)`, `list().map(t => t.name)` contains
         `"recalculate_religions"`.
     - **§10 Empty-input handling.** Parametric over `{}`, `null`,
       `undefined`, `{ extra: "ignored" }` — all behave identically.
       (Use a runtime that returns the same snapshots each call by
       resetting between iterations.)
     - **§11 Empty cells.religion → cells_changed = 0, empty
       histograms.**
       - Both snapshots return `[]`.
       - Result: `{ ok: true, cells_changed: 0, previous_distribution: {}, distribution: {} }`.
   - `describe("defaultRecalculateReligionsRuntime (integration)", …)`:
     - Save/restore `globalThis.pack`, `globalThis.Religions`,
       `globalThis.drawReligions`, `globalThis.drawReligionCenters`
       per test.
     - **§12 End-to-end with populated globals.**
       - `globalThis.pack = { cells: { religion: new Uint16Array([0, 0, 1, 1, 2]) } }`.
       - `Religions.recalculate = vi.fn(() => { (globalThis.pack as { cells: { religion: Uint16Array } }).cells.religion = new Uint16Array([0, 1, 1, 2, 2]); });`.
       - `globalThis.drawReligions = vi.fn();`
       - `globalThis.drawReligionCenters = vi.fn();`
       - Execute. Assertions:
         - `Religions.recalculate` called once.
         - `drawReligions` called once.
         - `drawReligionCenters` called once.
         - Result `cells_changed === 2` (indices 1 and 3 changed).
         - `previous_distribution === { "0": 2, "1": 2, "2": 1 }`.
         - `distribution === { "0": 1, "1": 2, "2": 2 }`.
     - **§13 Missing Religions global → error.**
       - `globalThis.Religions = undefined`. Pack populated. Result
         is `isError: true` with
         `"Religions.recalculate is not available; the map hasn't finished loading."`.
     - **§14 Missing pack → error.**
       - `globalThis.pack = undefined`. Result is `isError: true` with
         `"window.pack is not available; the map hasn't finished loading."`.
     - **§15 drawReligions / drawReligionCenters missing → still ok.**
       - Pack + Religions populated, draw functions undefined. Tool
         returns ok with correct distributions / cells_changed.

3. **Wire into `src/ai/index.ts`**:
   - Add `import { recalculateReligionsTool } from "./tools/recalculate-religions";`
     immediately after the `randomize-states-expansion` import
     (currently line 178). Order check: `randomize-states-expansion`
     (`ran`) < `recalculate-religions` (`rec`) <
     `regenerate-all-burg-names` (`reg`).
   - Add a re-export block immediately after the
     `randomize-states-expansion` re-export (currently lines 1824-1830):
     ```ts
     export {
       createRecalculateReligionsTool,
       defaultRecalculateReligionsRuntime,
       type RecalculateReligionsRuntime,
       recalculateReligionsTool,
     } from "./tools/recalculate-religions";
     ```
   - Add `registry.register(recalculateReligionsTool);` in
     `defaultToolRegistry()` immediately after
     `registry.register(randomizeStatesExpansionTool);` (currently
     line 2992).

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the
   `plan-335-recalculate-religions` branch:
   - `git add aiplans/plan_335.md aiplans/tasks_335.md src/ai/tools/recalculate-religions.ts src/ai/tools/recalculate-religions.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add recalculate_religions tool

     Implements plan 335. Adds an AI chat tool that calls
     Religions.recalculate() (via recalculateReligions or directly), then
     redraws the religions layer and centers, mirroring the "Recalculate"
     button in the religions editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
