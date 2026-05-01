# Tasks 334: `recalculate_cultures` tool

Sequenced implementation tasks for plan 334.

1. **Create the tool file** `src/ai/tools/recalculate-cultures.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `getPack`,
     `okResult`, `type Pack`, `type RawBurg`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define `interface RecalculateCulturesRuntime { getPack(): Pack |
     undefined; expandCultures(): void; drawCultures(): void; }`.
   - Implement `defaultRecalculateCulturesRuntime`:
     - `getPack()`: `getPack<Pack>()`.
     - `expandCultures()`:
       ```ts
       const module = getGlobal<{ expand?: () => void }>("Cultures");
       if (!module || typeof module.expand !== "function") {
         throw new Error(
           "Cultures.expand is not available; the map hasn't finished loading.",
         );
       }
       module.expand();
       ```
     - `drawCultures()`:
       ```ts
       const fn = getGlobal<() => void>("drawCultures");
       if (typeof fn !== "function") {
         throw new Error("window.drawCultures is not available.");
       }
       fn();
       ```
   - Implement `createRecalculateCulturesTool(runtime = default)`:
     - `name: "recalculate_cultures"`.
     - Description mentions the Cultures Editor's Recalculate button,
       that it calls `Cultures.expand()`, redraws the cultures layer,
       and re-syncs `burg.culture` from `pack.cells.culture[burg.cell]`.
       No input.
     - `input_schema: { type: "object", properties: {} }` — no
       `required`.
     - `execute(_rawInput)`:
       1. `const pack = runtime.getPack();`
       2. Validate pack and pack.cells and pack.cells.culture and
          pack.burgs are all present:
          ```ts
          const cellsCulture = pack?.cells?.culture as
            | { length: number; [i: number]: number }
            | undefined;
          const burgs = pack?.burgs;
          if (!pack || !cellsCulture || !Array.isArray(burgs)) {
            return errorResult(
              "window.pack is not available; the map hasn't finished loading.",
            );
          }
          ```
       3. Snapshot pre-expand state BEFORE running expand:
          - `previousCells` — `number[]` of length `cellsCulture.length`,
            `previousCells[i] = cellsCulture[i]`.
          - `previousDistribution` — `Record<string, number>` built by
            walking `previousCells` and incrementing `histo[String(c)]`.
          - `previousBurgCulture` — `Map<number, number | undefined>` from
            `burg.i` to `burg.culture` for every burg.
       4. `try { runtime.expandCultures(); runtime.drawCultures(); }
          catch (err) { return errorResult(err instanceof Error ?
          err.message : String(err)); }`.
       5. Burg-sync walk: for each `burg` in `burgs`, if
          `typeof burg.cell === "number"`, set
          `burg.culture = cellsCulture[burg.cell] as number`.
          Wrap in try/catch — if anything throws, propagate via
          `errorResult`.
       6. Compute `cellsChanged`: walk `cellsCulture` indices,
          increment counter when `previousCells[i] !== cellsCulture[i]`.
       7. Compute `burgsChanged`: walk `burgs`, for each one with a
          defined `cell`, if `previousBurgCulture.get(burg.i) !==
          burg.culture` increment.
       8. Build post-distribution histogram from current `cellsCulture`.
       9. Return:
          ```ts
          okResult({
            cells_changed: cellsChanged,
            burgs_changed: burgsChanged,
            previous_distribution: previousDistribution,
            distribution: distribution,
          });
          ```
   - Export `recalculateCulturesTool = createRecalculateCulturesTool()`.

2. **Create the test file** `src/ai/tools/recalculate-cultures.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `type Pack, type RawBurg` from `./_shared`; default +
     factory + types from `./recalculate-cultures`; `ToolRegistry`
     from `./index`.
   - Helper `makeRuntime(opts)` that builds a runtime with stubbed
     `getPack` / `expandCultures` / `drawCultures` and returns the
     runtime + the spies.
   - `describe("recalculate_cultures tool", …)`:
     - **§1 Happy path — order, counts, distributions.** Pack with
       `cellsCulture = [0, 0, 1, 1, 2, 2, 0, 1]` and burgs as in the
       plan. Stub `expandCultures` mutates the cell array to
       `[0, 1, 1, 2, 2, 2, 0, 0]` (indices 1, 3, 7 differ).
       Assertions:
       - Both `expandCultures` and `drawCultures` called once each.
       - `expandCultures.invocationCallOrder[0]` <
         `drawCultures.invocationCallOrder[0]`.
       - Burg `i:1` (cell 2 → still 1, was 1) — no change.
       - Burg `i:2` (cell 4 → still 2, was 2) — no change.
       - Burg `i:3` (cell 7 → 0, was 1) — changed.
       - Result equals
         ```jsonc
         {
           "ok": true,
           "cells_changed": 3,
           "burgs_changed": 1,
           "previous_distribution": { "0": 3, "1": 3, "2": 2 },
           "distribution":          { "0": 3, "1": 2, "2": 3 }
         }
         ```
     - **§2 previous_distribution captured BEFORE expand**
       (regression test). Pack with `cellsCulture = [0, 0, 0, 0, 1, 1,
       1, 1]`. `expand` stub mutates in place to
       `[1, 1, 1, 0, 1, 1, 1, 1]` — net change: 3 cells flip from 0
       to 1 (indices 0, 1, 2) and 1 cell flips from 0 (index 3
       was 0, stays 0… wait that doesn't change). Recompute:
       indices 0, 1, 2 flip 0→1 (3 changes); index 3 stays 0; indices
       4-7 stay 1. So `cells_changed = 3`. Pre-distribution
       `{ "0": 4, "1": 4 }`; post-distribution `{ "0": 1, "1": 7 }`.
       Burgs empty. Assert exactly these values; the test FAILS if
       implementation snapshotted post-expand (would yield
       `previous_distribution === distribution` and `cells_changed:
       0`).
     - **§3 Idempotent — nothing changes.** `expand` stub is a
       no-op; burgs already point to matching cell cultures. Result
       has `cells_changed: 0`, `burgs_changed: 0`,
       `previous_distribution` deeply equals `distribution`.
       `expand` and `drawCultures` still called exactly once each.
     - **§4 Burg sync uses POST-expand cell culture.** Pack:
       `cellsCulture = [5, 5]`; one burg `{ i: 1, cell: 0,
       culture: 5 }`. `expand` stub flips `cellsCulture[0] = 9`.
       After tool runs, `burg.culture === 9` (not 5).
       `burgs_changed === 1`.
     - **§5 Burgs without `cell` are skipped.** Burgs `[{ i: 0 },
       { i: 1, cell: undefined, culture: 7 }, { i: 2, cell: 0,
       culture: 0 }]`. `cellsCulture = [3]`. `expand` no-op.
       After: burg `i:0` and `i:1` untouched (no `cell`); burg
       `i:2` has `culture` updated to 3 from 0 → `burgs_changed: 1`.
       Burg `i:0`'s undefined `culture` stays undefined; burg
       `i:1`'s culture stays 7.
     - **§6 Missing pack → error.** `getPack` returns `undefined`.
       Verbatim error: `"window.pack is not available; the map
       hasn't finished loading."`. `expandCultures` and
       `drawCultures` never called.
     - **§7 Missing pack.cells → error.** `getPack` returns
       `{ burgs: [] }`. Same message. Neither downstream called.
     - **§8 Missing pack.cells.culture → error.** `getPack` returns
       `{ cells: {}, burgs: [] }`. Same message. Neither downstream
       called.
     - **§9 Missing pack.burgs → error.** `getPack` returns
       `{ cells: { culture: [0, 1] } }`. Same message. Neither
       downstream called.
     - **§10 expandCultures throws verbatim error → propagated.**
       `expand` throws `new Error("Cultures.expand is not available;
       the map hasn't finished loading.")`. Result error matches.
       `drawCultures` NOT called. Cell array unchanged. Burgs
       unchanged.
     - **§11 drawCultures throws verbatim error → propagated.**
       `expand` mutates the cell array (one cell flip); `drawCultures`
       throws `new Error("window.drawCultures is not available.")`.
       Result error matches. Burgs NOT synced (loop short-circuited
       by the catch). Cells ARE mutated (no rollback) — assert
       this for documentation.
     - **§12 Arbitrary expand runtime error → surfaced.** `expand`
       throws `new Error("boom")`. Result error is `"boom"`.
       `drawCultures` NOT called.
     - **§13 Tool name + schema + registry round-trip.**
       `tool.name === "recalculate_cultures"`,
       `input_schema.type === "object"`, `properties === {}`,
       `required === undefined`. Then `new ToolRegistry()`,
       `register(...)`, `list().map(t => t.name)` contains
       `"recalculate_cultures"`.
     - **§14 Empty-input handling.** Parametric over `{}`, `null`,
       `undefined`, `{ extra: "ignored" }`. Each call invokes
       `expand` and `drawCultures` exactly once. Total: 4 calls of
       each.
   - `describe("defaultRecalculateCulturesRuntime (integration)",
     …)`:
     - Save/restore `globalThis.pack`, `globalThis.Cultures`, and
       `globalThis.drawCultures` per test in beforeEach/afterEach.
     - **§15 End-to-end.** Set globals as in plan §15. Execute.
       Assert:
       - `Cultures.expand` called once.
       - `drawCultures` called once.
       - `pack.burgs[1].culture === 1`, `pack.burgs[2].culture === 0`.
       - Result has `cells_changed: 2`, `burgs_changed: 2`,
         `previous_distribution: { "0": 2, "1": 2 }`,
         `distribution: { "0": 2, "1": 2 }`.
     - **§16 Errors when globalThis.Cultures.expand missing.**
       `globalThis.Cultures = undefined`; pack and `drawCultures`
       set. Result error matches `"Cultures.expand is not
       available; the map hasn't finished loading."`. Cell array
       unchanged.
     - **§17 Errors when globalThis.drawCultures missing.** Pack and
       `globalThis.Cultures = { expand: vi.fn() }` set; omit
       `drawCultures`. Result error matches `"window.drawCultures
       is not available."`. `Cultures.expand` was called (it ran
       before drawCultures errored).
     - **§18 Errors when pack missing entirely.**
       `globalThis.pack = undefined`. Result is error with
       pack-missing message. Neither global called.

3. **Wire into `src/ai/index.ts`**:
   - Add `import { recalculateCulturesTool } from "./tools/recalculate-cultures";`
     immediately after the `randomize-states-expansion` import
     (currently line 178). Alphabetical: `randomize-` <
     `recalculate-` < `regenerate-`.
   - Add a re-export block immediately after the
     `randomize-states-expansion` re-export (currently lines
     1824-1830):
     ```ts
     export {
       createRecalculateCulturesTool,
       defaultRecalculateCulturesRuntime,
       type RecalculateCulturesRuntime,
       recalculateCulturesTool,
     } from "./tools/recalculate-cultures";
     ```
   - Add `registry.register(recalculateCulturesTool);` in
     `defaultToolRegistry()` immediately after
     `registry.register(randomizeStatesExpansionTool);` (currently
     line 2992).

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the
   `plan-334-recalculate-cultures` branch:
   - `git add aiplans/plan_334.md aiplans/tasks_334.md
     src/ai/tools/recalculate-cultures.ts
     src/ai/tools/recalculate-cultures.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add recalculate_cultures tool

     Implements plan 334. Adds an AI chat tool that calls
     Cultures.expand() (via recalculateCultures or directly), redraws
     the cultures layer, and re-syncs burg.culture from cell.culture,
     mirroring the "Recalculate" button in the cultures editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
