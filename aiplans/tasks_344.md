# Tasks 344: `remove_all_burgs` tool

Sequenced implementation tasks for plan 344.

1. **Create the tool file** `src/ai/tools/remove-all-burgs.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `getGlobal`, `getPack`, `okResult`, type `RawBurg`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define exported types:
     ```ts
     export interface RemoveAllBurgsRuntime {
       getBurgs(): RawBurg[] | undefined;
       removeBurg(i: number): void;
       addLines?(): void;
     }
     ```
   - Internal types:
     ```ts
     interface BurgPack {
       burgs?: RawBurg[];
     }
     interface BurgsModule {
       remove?: (id: number) => void;
     }
     ```
   - Implement `defaultRemoveAllBurgsRuntime`:
     ```ts
     export const defaultRemoveAllBurgsRuntime: RemoveAllBurgsRuntime = {
       getBurgs(): RawBurg[] | undefined {
         const pack = getPack<BurgPack>();
         const burgs = pack?.burgs;
         return Array.isArray(burgs) ? burgs : undefined;
       },
       removeBurg(i: number): void {
         const burgsModule = getGlobal<BurgsModule>("Burgs");
         const remove = burgsModule?.remove;
         if (typeof remove !== "function") {
           throw new Error(
             "window.Burgs.remove is not available; the map hasn't finished loading.",
           );
         }
         remove(i);
       },
       addLines(): void {
         const fn = getGlobal<() => void>("burgsOverviewAddLines");
         if (typeof fn !== "function") return;
         try {
           fn();
         } catch {
           // best-effort: refreshing the overview must never fail the tool.
         }
       },
     };
     ```
   - Implement `createRemoveAllBurgsTool(runtime = defaultRemoveAllBurgsRuntime)`:
     - `name: "remove_all_burgs"`.
     - Description: explain it mirrors the Burgs Overview's "Remove
       all" button (`triggerAllBurgsRemove` in
       `public/modules/ui/burgs-overview.js`). Calls `Burgs.remove(i)`
       on every burg with `b.i && !b.removed && !b.capital && !b.lock`,
       leaving capitals and locked burgs untouched. To remove a
       capital, first reassign the state's capital with
       `set_state_capital`, or remove the state via `remove_state`
       (which deletes its burgs as a side effect). Locked burgs can
       be unlocked first via `set_entity_lock` or
       `toggle_lock_all_burgs`. Returns counts and the list of removed
       burg ids (capped at 50, ascending).
     - `input_schema`:
       ```ts
       {
         type: "object",
         properties: {},
       }
       ```
     - `execute(_rawInput)`:
       1. ```ts
          let burgs: RawBurg[] | undefined;
          try {
            burgs = runtime.getBurgs();
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
          ```
       2. ```ts
          if (!Array.isArray(burgs)) {
            return errorResult(
              "window.pack.burgs is not available; the map hasn't finished loading.",
            );
          }
          ```
       3. Walk the array once:
          ```ts
          let previous_count = 0;
          let skipped_capital = 0;
          let skipped_locked = 0;
          const targets: number[] = [];
          for (const burg of burgs) {
            if (!burg) continue;
            if (!burg.i) continue;       // skip burg 0 placeholder
            if (burg.removed) continue;  // tombstones don't count
            previous_count++;
            if (burg.capital) {
              skipped_capital++;          // capital wins over locked
              continue;
            }
            if (burg.lock) {
              skipped_locked++;
              continue;
            }
            targets.push(burg.i);
          }
          ```
       4. Apply removals in id-ascending iteration order
          (`pack.burgs[i].i === i` by convention, so the array IS
          ascending; defensive sort below):
          ```ts
          const processedIds: number[] = [];
          try {
            for (const id of targets) {
              runtime.removeBurg(id);
              processedIds.push(id);
            }
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
          ```
       5. Best-effort overview refresh:
          ```ts
          if (typeof runtime.addLines === "function") {
            try {
              runtime.addLines();
            } catch {
              // best-effort.
            }
          }
          ```
       6. Compute capped result:
          ```ts
          const sorted = [...processedIds].sort((a, b) => a - b);
          const truncated = sorted.length > 50;
          const removed_burg_ids = truncated ? sorted.slice(0, 50) : sorted;
          ```
       7. Return:
          ```ts
          return okResult({
            previous_count,
            removed_count: processedIds.length,
            skipped_capital,
            skipped_locked,
            removed_burg_ids,
            removed_burg_ids_truncated: truncated,
          });
          ```
   - Export:
     - `export const removeAllBurgsTool = createRemoveAllBurgsTool();`

2. **Create the test file** `src/ai/tools/remove-all-burgs.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawBurg } from "./_shared";
     import { ToolRegistry } from "./index";
     import {
       createRemoveAllBurgsTool,
       type RemoveAllBurgsRuntime,
       removeAllBurgsTool,
     } from "./remove-all-burgs";
     ```
   - Helper:
     ```ts
     interface MakeRuntimeOpts {
       burgs?: RawBurg[] | undefined | unknown;
       getBurgsThrows?: Error;
       removeBurg?: (i: number) => void;
       addLines?: () => void;
       includeAddLines?: boolean; // default true
     }

     function makeRuntime(opts: MakeRuntimeOpts = {}) {
       const burgsRef = opts.burgs as RawBurg[] | undefined;
       const getBurgs = vi.fn(() => {
         if (opts.getBurgsThrows) throw opts.getBurgsThrows;
         return burgsRef;
       });
       const defaultRemoveBurg = (i: number) => {
         const arr = burgsRef as RawBurg[] | undefined;
         if (!Array.isArray(arr)) return;
         const burg = arr[i];
         if (!burg) return;
         burg.removed = true;
       };
       const removeBurg = vi.fn(opts.removeBurg ?? defaultRemoveBurg);
       const addLines = vi.fn(opts.addLines ?? (() => {}));
       const runtime: RemoveAllBurgsRuntime = {
         getBurgs,
         removeBurg,
         ...(opts.includeAddLines === false ? {} : { addLines }),
       };
       return { runtime, getBurgs, removeBurg, addLines };
     }
     ```
   - `describe("remove_all_burgs tool", () => { ... })`:
     - **§1 Happy path: 6 active burgs (2 capitals, 1 locked, 1
       locked+capital, 2 normal) → 2 removed.**
       - As detailed in plan §1. Assert body deep-equals; assert
         `removeBurg.mock.calls.flat()` deep-equals `[5, 6]`.
       - Explicit negative assertions: `removeBurg` not called with
         `0, 1, 2, 3, 4`.
     - **§2 Skip precedence: capital wins over locked.**
       - `burgs = [{ i: 0 }, { i: 1, capital: 1, lock: true }];`
       - Body counts: `skipped_capital:1, skipped_locked:0`.
     - **§3 Invariant via it.each (5 configs).**
       - `previous_count === removed_count + skipped_capital + skipped_locked`.
     - **§4 Burg 0 untouched.**
       - `burgs = [{ i: 0, name: "Placeholder" }, { i: 1, name: "A" }];`
       - `removeBurg.mock.calls.flat()` deep-equals `[1]`. Not called
         with `0`.
     - **§5 Already-removed burgs not re-removed.**
       - `burgs = [{ i: 0 }, { i: 1, removed: true, name: "Gone" }, { i: 2, name: "Norm" }];`
       - Body: `previous_count:1, removed_count:1`.
       - `removeBurg.mock.calls.flat()` deep-equals `[2]`. Not called
         with `1`.
     - **§6 All capitals → no removal.**
       - Body: `removed_count:0, skipped_capital:N, skipped_locked:0`.
       - `removeBurg` not called.
     - **§7 All locked → no removal.**
       - Body: `removed_count:0, skipped_capital:0, skipped_locked:N`.
     - **§8 Empty active set.**
       - All-zero counts; `removed_burg_ids === []`;
         `removed_burg_ids_truncated === false`.
     - **§9 Call ORDER: per-burg in id-ascending.**
       - `burgs = [{ i: 0 }, { i: 1, name:"A" }, { i: 2, capital:1 }, { i: 3, name:"C" }, { i: 4, lock:true }, { i: 5, name:"E" }];`
       - `removeBurg.mock.calls.flat()` deep-equals `[1, 3, 5]`.
     - **§10 Missing pack.burgs → exact error; no calls.**
       - `getBurgs: () => undefined`.
       - Error string deep-equals
         `"window.pack.burgs is not available; the map hasn't finished loading."`.
       - `removeBurg` and `addLines` NEVER called.
     - **§11 Non-array pack.burgs → same error.**
       - `getBurgs: () => "oops" as unknown as RawBurg[]`.
       - Same error.
     - **§12 Missing Burgs.remove → exact verbatim error; addLines
       not called.**
       - `removeBurg: () => { throw new Error("window.Burgs.remove is not available; the map hasn't finished loading."); }`.
       - `burgs = [{ i: 0 }, { i: 1, name: "A" }];`
       - Error string deep-equals
         `"window.Burgs.remove is not available; the map hasn't finished loading."`.
       - `addLines` NOT called.
     - **§13 removeBurg throws on second burg → error; partial state.**
       - Custom `removeBurg` that mutates burg[1].removed=true on
         first call, throws on second:
         ```ts
         let calls = 0;
         const removeBurg = (i: number) => {
           calls++;
           if (calls === 2) throw new Error("dom!");
           burgs[i].removed = true;
         };
         ```
       - `burgs = [{ i: 0 }, { i: 1, name: "A" }, { i: 2, name: "B" }, { i: 3, name: "C" }];`
       - Result `isError: true`; error matches `/dom!/`.
       - `burgs[1].removed === true` (work that completed stays).
       - `burgs[2].removed` is undefined (the throwing call's
         mock didn't mutate).
       - `burgs[3].removed` is undefined (never reached).
       - `addLines` NOT called.
     - **§14 removed_burg_ids capped at 50; truncated=true for 70.**
       - `burgs = [{ i: 0 }, ...Array.from({length:70}, (_,k) => ({ i: k+1, name: \`B${k+1}\` }))];`
       - Body: `removed_burg_ids.length === 50`, first=1, last=50,
         `removed_burg_ids_truncated === true`.
     - **§15 Boundary: exactly 50 → not truncated.**
       - 50 normal burgs (plus burg 0).
     - **§16 removed_burg_ids ascending regardless of input order.**
       - Use a non-canonical layout where some `pack.burgs[i].i !== i`:
         ```ts
         burgs = [{ i: 0 }, { i: 5, name: "E" }, { i: 1, name: "A" }, { i: 9, name: "I" }, { i: 3, name: "C" }];
         ```
         (Per legacy convention this is uncommon, but the sort step
         must guarantee ordering.)
       - Body: `removed_burg_ids === [1, 3, 5, 9]`.
     - **§17 addLines absent → no error.**
       - `includeAddLines: false`.
       - `burgs = [{ i: 0 }, { i: 1 }];`
       - Result `isError` falsy.
     - **§18 addLines throws → swallowed; mutation applied.**
       - `addLines: () => { throw new Error("svg!"); }`.
       - `burgs = [{ i: 0 }, { i: 1 }];`
       - Result `isError` falsy. `removeBurg` called with `1`.
     - **§19 getBurgs throws → error propagated.**
       - `getBurgsThrows: new Error("boom")`.
       - Error matches `/boom/`. `removeBurg` not called.
     - **§20 Tool name + schema + registry round-trip.**
       - `expect(removeAllBurgsTool.name).toBe("remove_all_burgs");`
       - `expect(removeAllBurgsTool.input_schema).toEqual({ type:"object", properties:{} });`
       - Fresh `ToolRegistry`, register, list contains
         `"remove_all_burgs"`.
     - **§21 Tolerates extraneous / null / undefined input.**
       - `tool.execute({ bogus: "x" })`, `tool.execute(null)`,
         `tool.execute(undefined)` — all succeed.

   - `describe("defaultRemoveAllBurgsRuntime (integration)", () => { ... })`:
     - Save/restore globals per test:
       ```ts
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalBurgs = (globalThis as { Burgs?: unknown }).Burgs;
       const originalAddLines = (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines;
       beforeEach(() => {
         (globalThis as { pack?: unknown }).pack = undefined;
         (globalThis as { Burgs?: unknown }).Burgs = undefined;
         (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines = undefined;
       });
       afterEach(() => {
         (globalThis as { pack?: unknown }).pack = originalPack;
         (globalThis as { Burgs?: unknown }).Burgs = originalBurgs;
         (globalThis as { burgsOverviewAddLines?: unknown }).burgsOverviewAddLines = originalAddLines;
       });
       ```
     - **§22 End-to-end with populated globals.**
       - As detailed in plan §22.
     - **§23 Missing pack → error.**
       - `globalThis.pack = undefined;`
       - Error matches `/window\.pack\.burgs is not available/`.
     - **§24 pack.burgs missing.**
       - `globalThis.pack = {};` — same error.
     - **§25 Burgs missing → exact remove-validation error.**
       - `globalThis.pack = { burgs: [{ i: 0 }, { i: 1, name: "A" }] };`
       - `globalThis.Burgs = undefined;`
       - Error matches `/window\.Burgs\.remove is not available/`.
       - `pack.burgs[1].removed` falsy.
     - **§26 Burgs.remove not a function.**
       - `globalThis.Burgs = { remove: "nope" };`
       - Same error as §25.
     - **§27 burgsOverviewAddLines absent → tool succeeds.**
       - `globalThis.burgsOverviewAddLines = undefined;`
       - Result `isError` falsy. `pack.burgs[1].removed === true`.
     - **§28 burgsOverviewAddLines throws → swallowed.**
       - `globalThis.burgsOverviewAddLines = vi.fn(() => { throw new Error("ui!"); });`
       - Result `isError` falsy. `pack.burgs[1].removed === true`.

3. **Modify `src/ai/index.ts`**:
   - Add import slotted alphabetically: `remove-all-burgs` <
     `remove-all-markers`. Insert IMMEDIATELY BEFORE the
     `removeAllMarkersTool` import (current line 209):
     ```ts
     import { removeAllBurgsTool } from "./tools/remove-all-burgs";
     import { removeAllMarkersTool } from "./tools/remove-all-markers";
     ```
   - Add re-export block immediately before the `remove-all-markers`
     re-export block (current ~line 2018):
     ```ts
     export {
       createRemoveAllBurgsTool,
       defaultRemoveAllBurgsRuntime,
       type RemoveAllBurgsRuntime,
       removeAllBurgsTool,
     } from "./tools/remove-all-burgs";
     ```
     (Biome will normalize internal ordering.)
   - Add `registry.register(removeAllBurgsTool);` IMMEDIATELY BEFORE
     `registry.register(removeAllMarkersTool);` (current line 3075).

4. **Run verification**:
   - `npm test` (must be green; new tests pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -10` (must report 0 errors / 0
     warnings, matching baseline).

5. **Commit on `plan-344-remove-all-burgs` branch** with the message
   specified in the prompt. Do NOT push.
