# Tasks 332: `restore_default_namesbases` tool

Sequenced implementation tasks for plan 332.

1. **Create the tool file** `src/ai/tools/restore-default-namesbases.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define types:
     - `interface NamesbaseLike { name?: unknown }` (only `name` is
       consumed; the global reassignment passes the array through
       opaquely).
     - `interface RestoreDefaultNamesbasesResult { previous_count: number; count: number; names: string[]; }`
     - `interface RestoreDefaultNamesbasesRuntime { countPrevious(): number; clearChains(): void; getNameBases(): unknown[]; setNameBases(arr: unknown[]): void; }`
   - Define internal `interface NamesModuleLike { clearChains?: () => void; getNameBases?: () => unknown; }`
   - Implement `defaultRestoreDefaultNamesbasesRuntime`:
     - `countPrevious()`:
       ```ts
       const current = getGlobal<unknown>("nameBases");
       return Array.isArray(current) ? current.length : 0;
       ```
     - `clearChains()`:
       ```ts
       const mod = getGlobal<NamesModuleLike>("Names");
       if (!mod || typeof mod.clearChains !== "function") {
         throw new Error("Names.clearChains is not available; the map hasn't finished loading.");
       }
       mod.clearChains();
       ```
     - `getNameBases()`:
       ```ts
       const mod = getGlobal<NamesModuleLike>("Names");
       if (!mod || typeof mod.getNameBases !== "function") {
         throw new Error("Names.getNameBases is not available; the map hasn't finished loading.");
       }
       const result = mod.getNameBases();
       if (!Array.isArray(result)) {
         throw new Error("Names.getNameBases did not return an array.");
       }
       return result;
       ```
       Note: returning a checked array here lets the tool body trust
       the type; the non-array error is thrown from inside the runtime
       seam so both the default and any well-behaved test stub get the
       same validation.
     - `setNameBases(arr)`:
       ```ts
       (globalThis as Record<string, unknown>).nameBases = arr;
       ```
       Load-bearing: this is the global REASSIGNMENT seam.
   - Implement `createRestoreDefaultNamesbasesTool(runtime = default)`:
     - `name: "restore_default_namesbases"`.
     - Description (concise, mention legacy button):
       "Wipe any user-edited namesbases and reload the bundled default
       set — same side-effect as the Restore button in the Namesbase
       editor (namesbase-editor.js → namesbaseRestoreDefault). Calls
       Names.clearChains() to drop cached Markov chains, then reassigns
       window.nameBases = Names.getNameBases() (the default 26-entry
       corpus: German, English, French, Italian, …). Takes no
       arguments. Returns the previous count, the new count, and the
       list of restored namesbase names so you can immediately see
       what's available again."
     - `input_schema: { type: "object", properties: {} }` (no
       `required`).
     - `execute(_rawInput)`:
       ```ts
       const previous_count = runtime.countPrevious();
       try {
         runtime.clearChains();
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }
       let bases: unknown[];
       try {
         bases = runtime.getNameBases();
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }
       runtime.setNameBases(bases);
       const names: string[] = [];
       for (const entry of bases) {
         if (entry && typeof entry === "object") {
           const raw = (entry as { name?: unknown }).name;
           names.push(typeof raw === "string" ? raw : "");
         } else {
           names.push("");
         }
       }
       return okResult({
         previous_count,
         count: bases.length,
         names,
       });
       ```
   - Export `restoreDefaultNamesbasesTool = createRestoreDefaultNamesbasesTool()`.

2. **Create the test file** `src/ai/tools/restore-default-namesbases.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `ToolRegistry` from `./index`; default + factory +
     types from `./restore-default-namesbases`.
   - Helper:
     ```ts
     function makeRuntime(opts: {
       previous_count?: number;
       getNameBases?: () => unknown[];
       clearChains?: () => void;
       setNameBases?: (arr: unknown[]) => void;
     } = {}): {
       runtime: RestoreDefaultNamesbasesRuntime;
       countPrevious: ReturnType<typeof vi.fn>;
       clearChains: ReturnType<typeof vi.fn>;
       getNameBases: ReturnType<typeof vi.fn>;
       setNameBases: ReturnType<typeof vi.fn>;
     }
     ```
     defaulting `previous_count` to 0, `getNameBases` to `() => []`,
     `clearChains` to `() => {}`, `setNameBases` to `() => {}`.
     Returns the runtime + each `vi.fn` for assertion.

   - `describe("restore_default_namesbases tool", …)` (stub-runtime tests):

     - **§1 Happy path: pre-existing nameBases get replaced**:
       Build `defaultBases = Array.from({ length: 26 }, (_, i) => ({ name: \`Base${i}\` }))`.
       Stub `previous_count: 7`, `getNameBases: () => defaultBases`.
       Run tool, assert `result.isError` falsy, parsed content equals
       `{ ok: true, previous_count: 7, count: 26, names: ["Base0", "Base1", …, "Base25"] }`.
       Each of `countPrevious`, `clearChains`, `getNameBases`,
       `setNameBases` called exactly once.
       `setNameBases` was called with `defaultBases` (use
       `expect(setNameBases).toHaveBeenCalledWith(defaultBases)`).

     - **§2 Call ORDER (load-bearing)**:
       Use `vi.fn().mock.invocationCallOrder` to assert sequence is
       countPrevious → clearChains → getNameBases → setNameBases.
       ```ts
       const cpOrder = countPrevious.mock.invocationCallOrder[0]!;
       const ccOrder = clearChains.mock.invocationCallOrder[0]!;
       const gnOrder = getNameBases.mock.invocationCallOrder[0]!;
       const snOrder = setNameBases.mock.invocationCallOrder[0]!;
       expect(cpOrder).toBeLessThan(ccOrder);
       expect(ccOrder).toBeLessThan(gnOrder);
       expect(gnOrder).toBeLessThan(snOrder);
       ```

     - **§3 Identity-passthrough (stub variant)**: stub `getNameBases`
       returns a known reference; assert `setNameBases` was called
       with the SAME reference (`expect(setNameBases.mock.calls[0]?.[0]).toBe(returnedRef)`).
       Pins that the tool does not wrap / clone the array.

     - **§4 Surfaces clearChains errors**: stub `clearChains` throws
       `new Error("Names.clearChains is not available; the map hasn't finished loading.")`.
       Run tool. Assert `result.isError === true`, parsed content
       error matches `/Names\.clearChains/`. Assert `getNameBases`
       NOT called, `setNameBases` NOT called. (`countPrevious` IS
       called — happens before the throw.)

     - **§5 Surfaces getNameBases errors (clearChains still ran)**:
       stub `clearChains: vi.fn()`, `getNameBases: () => { throw new
       Error("Names.getNameBases is not available; the map hasn't finished loading."); }`.
       Run tool. Assert `result.isError === true`, error matches
       `/Names\.getNameBases/`. Assert `clearChains` WAS called once
       (legacy ordering: clears unconditionally before reload).
       Assert `setNameBases` NOT called.

     - **§6 getNameBases returns non-array via stub-thrown
       contract**: simulate the runtime contract by stubbing
       `getNameBases: () => { throw new Error("Names.getNameBases did not return an array."); }`.
       Run tool. Assert `result.isError === true`, error matches
       exactly `"Names.getNameBases did not return an array."`.
       Assert `setNameBases` NOT called. (The stub-runtime layer
       cannot return a non-array since its type is `() => unknown[]`;
       the integration suite §13 covers the actual runtime
       validation.)

     - **§7 Tool name + schema + registry round-trip**:
       - `tool.name === "restore_default_namesbases"`.
       - `tool.input_schema.type === "object"`.
       - `tool.input_schema.properties` deep-equals `{}`.
       - `(tool.input_schema as { required?: unknown }).required` is
         undefined.
       - `new ToolRegistry()`, `registry.register(restoreDefaultNamesbasesTool)`,
         `expect(registry.list().map(t => t.name)).toContain("restore_default_namesbases")`.

     - **§8 Empty-input handling**: passing `{}`, `null`, `undefined`,
       `{ extra: "ignored" }` → all execute identically; assert
       `clearChains` was called 4 times after the loop.

   - `describe("defaultRestoreDefaultNamesbasesRuntime (integration)", …)`:
     - Save originals at module top:
       ```ts
       const originalNames = (globalThis as { Names?: unknown }).Names;
       const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
       ```
     - `beforeEach`: set `globalThis.nameBases = [{ name: "OldA" }, { name: "OldB" }]`;
       set `globalThis.Names = { clearChains: vi.fn(), getNameBases: vi.fn(() => []) }`.
       (Per-test code overrides as needed.)
     - `afterEach`: restore both originals.

     - **§9 Calls Names.clearChains then reassigns nameBases (identity pin)**:
       ```ts
       const defaultBases = [{ name: "German" }, { name: "English" }, { name: "French" }];
       const clearChains = vi.fn();
       const getNameBases = vi.fn(() => defaultBases);
       (globalThis as { Names?: unknown }).Names = { clearChains, getNameBases };
       (globalThis as { nameBases?: unknown }).nameBases = [{ name: "OldA" }, { name: "OldB" }];

       const result = await restoreDefaultNamesbasesTool.execute({});

       expect(result.isError).toBeFalsy();
       expect(JSON.parse(result.content)).toEqual({
         ok: true,
         previous_count: 2,
         count: 3,
         names: ["German", "English", "French"],
       });
       expect(clearChains).toHaveBeenCalledTimes(1);
       expect(clearChains).toHaveBeenCalledWith();
       expect(getNameBases).toHaveBeenCalledTimes(1);
       expect(getNameBases).toHaveBeenCalledWith();
       // Load-bearing: verify global REASSIGNMENT (not in-place mutation).
       expect((globalThis as { nameBases?: unknown }).nameBases).toBe(defaultBases);
       ```

     - **§10 Errors when Names global is missing**:
       `(globalThis as { Names?: unknown }).Names = undefined;`
       Snapshot `previousNameBases = globalThis.nameBases`.
       Run tool. Assert `result.isError === true`, error matches
       `/Names\.clearChains/`. Assert
       `(globalThis as { nameBases?: unknown }).nameBases === previousNameBases`.

     - **§11 Errors when Names.clearChains is not a function**:
       `globalThis.Names = { clearChains: "nope", getNameBases: () => [] }`.
       Snapshot `previousNameBases`. Run tool. Error matches
       `/Names\.clearChains/`. nameBases unchanged (`===` snapshot).

     - **§12 Errors when Names.getNameBases is not a function (clearChains still ran)**:
       ```ts
       const clearChains = vi.fn();
       (globalThis as { Names?: unknown }).Names = { clearChains, getNameBases: "nope" };
       const previousNameBases = (globalThis as { nameBases?: unknown }).nameBases;
       const result = await restoreDefaultNamesbasesTool.execute({});
       expect(result.isError).toBe(true);
       expect(JSON.parse(result.content).error).toMatch(/Names\.getNameBases/);
       expect(clearChains).toHaveBeenCalledTimes(1);
       expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previousNameBases);
       ```

     - **§13 Errors when Names.getNameBases returns non-array**:
       `globalThis.Names = { clearChains: vi.fn(), getNameBases: () => null }`.
       Snapshot `previousNameBases`. Run tool. Error exactly
       `"Names.getNameBases did not return an array."`. nameBases
       unchanged (`===` snapshot).

     - **§14 previous_count handles missing/non-array nameBases**:
       Loop through `[undefined, 42, "nope", null]`:
       ```ts
       for (const bad of [undefined, 42, "nope", null]) {
         (globalThis as { nameBases?: unknown }).nameBases = bad as never;
         const defaultBases = [{ name: "X" }];
         (globalThis as { Names?: unknown }).Names = {
           clearChains: vi.fn(),
           getNameBases: vi.fn(() => defaultBases),
         };
         const result = await restoreDefaultNamesbasesTool.execute({});
         expect(result.isError).toBeFalsy();
         expect(JSON.parse(result.content)).toEqual({
           ok: true,
           previous_count: 0,
           count: 1,
           names: ["X"],
         });
         expect((globalThis as { nameBases?: unknown }).nameBases).toBe(defaultBases);
       }
       ```

     - **§15 Surfaces a thrown runtime error from clearChains**:
       `globalThis.Names = { clearChains: () => { throw new Error("boom"); }, getNameBases: vi.fn() }`.
       Snapshot `previousNameBases`. Run tool. Error exactly
       `"boom"`. `getNameBases` NOT called. nameBases unchanged.

     - **§16 Surfaces a thrown runtime error from getNameBases**:
       `globalThis.Names = { clearChains: vi.fn(), getNameBases: () => { throw new Error("boom2"); } }`.
       Snapshot `previousNameBases`. Run tool. Error exactly
       `"boom2"`. nameBases unchanged.

3. **Wire into `src/ai/index.ts`**:
   - Add `import { restoreDefaultNamesbasesTool } from "./tools/restore-default-namesbases";`
     between line 231 (`import { resetStateDiplomacyTool } from
     "./tools/reset-state-diplomacy";`) and line 232 (`import {
     saveMapTool } from "./tools/save-map";`). Alphabetical: `restore-`
     sorts after `reset-` and before `save-`.
   - Add a re-export block between the `reset-state-diplomacy`
     re-export (currently lines 2094-2102) and the `save-map`
     re-export (currently lines 2103-2107):
     ```ts
     export {
       createRestoreDefaultNamesbasesTool,
       defaultRestoreDefaultNamesbasesRuntime,
       type RestoreDefaultNamesbasesResult,
       type RestoreDefaultNamesbasesRuntime,
       restoreDefaultNamesbasesTool,
     } from "./tools/restore-default-namesbases";
     ```
   - Add `registry.register(restoreDefaultNamesbasesTool);` immediately
     after `registry.register(resetStateDiplomacyTool);` (currently
     line 2958) — keeps the "reset / restore" sequencing intuitive.

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -50`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the `plan-332-restore-default-namesbases` branch:
   - `git add aiplans/plan_332.md aiplans/tasks_332.md
     src/ai/tools/restore-default-namesbases.ts
     src/ai/tools/restore-default-namesbases.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add restore_default_namesbases tool

     Implements plan 332. Adds an AI chat tool that calls Names.clearChains()
     then reassigns window.nameBases = Names.getNameBases() to restore the
     bundled default namesbases, mirroring the "Restore" button in the
     namesbase editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
