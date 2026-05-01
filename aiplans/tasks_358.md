# Tasks 358: `restore_default_biomes` tool

Sequenced implementation tasks for plan 358.

1. **Create the tool file** `src/ai/tools/restore-default-biomes.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `getPack`,
     `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define types:
     - `interface BiomesDataLike { name?: unknown }` (only `name` is
       consumed for the count; the rest of the data is passed through
       opaquely via the global reassignment).
     - `interface RestoreDefaultBiomesResult { biomes_count: number;
       cells_changed: number; drew: boolean; recalculated_population:
       boolean; }`
     - `interface RestoreDefaultBiomesRuntime { countPrevious(): number;
       getDefault(): unknown; setBiomesData(data: unknown): void;
       define(): void; getCellBiomes(): ArrayLike<number>; drawBiomes():
       boolean; recalculatePopulation(): boolean; }`
   - Define internal interfaces:
     - `interface BiomesModuleLike { getDefault?: () => unknown; define?: () => void; }`
     - `interface PackLike { cells?: { biome?: ArrayLike<number> } }`
   - Implement `defaultRestoreDefaultBiomesRuntime`:
     - `countPrevious()`:
       ```ts
       const data = getGlobal<BiomesDataLike>("biomesData");
       const name = (data as { name?: unknown } | undefined)?.name;
       return Array.isArray(name) ? name.length : 0;
       ```
     - `getDefault()`:
       ```ts
       const mod = getGlobal<BiomesModuleLike>("Biomes");
       if (!mod || typeof mod.getDefault !== "function") {
         throw new Error("Biomes.getDefault is not available; the map hasn't finished loading.");
       }
       return mod.getDefault();
       ```
     - `setBiomesData(data)`:
       ```ts
       (globalThis as Record<string, unknown>).biomesData = data;
       ```
       Load-bearing global REASSIGNMENT seam.
     - `define()`:
       ```ts
       const mod = getGlobal<BiomesModuleLike>("Biomes");
       if (!mod || typeof mod.define !== "function") {
         throw new Error("Biomes.define is not available; the map hasn't finished loading.");
       }
       mod.define();
       ```
     - `getCellBiomes()`:
       ```ts
       const pack = getPack<PackLike>();
       const biome = pack?.cells?.biome;
       if (!biome || typeof biome.length !== "number") {
         throw new Error("window.pack.cells.biome is not available; the map hasn't finished loading.");
       }
       return biome;
       ```
     - `drawBiomes()`:
       ```ts
       const fn = getGlobal<() => void>("drawBiomes");
       if (typeof fn !== "function") return false;
       try { fn(); return true; } catch { return false; }
       ```
     - `recalculatePopulation()`: same shape as drawBiomes for
       `getGlobal<() => void>("recalculatePopulation")`.
   - Implement `createRestoreDefaultBiomesTool(runtime = default)`:
     - `name: "restore_default_biomes"`.
     - Description (concise, mention legacy button):
       "Wipe any user-edited biomes and reload the bundled default
       set, then re-assign every cell's biome from the defaults'
       temperature/precipitation matrix — same side-effect as the
       Restore button in the Biomes editor (biomes-editor.js →
       restoreInitialBiomes). Reassigns window.biomesData =
       Biomes.getDefault() (the default 13-entry pack: Marine, Hot
       desert, Cold desert, Savanna, Grassland, …, Wetland), then
       calls Biomes.define() to walk every cell and write
       pack.cells.biome[i] from the new matrix, then best-effort calls
       drawBiomes() and recalculatePopulation(). Takes no arguments.
       Returns the new biome count, the number of cells whose biome
       assignment actually changed, and whether the layer redraw and
       population recalc each succeeded."
     - `input_schema: { type: "object", properties: {} }` (no
       `required`).
     - `execute(_rawInput)`:
       ```ts
       const _previousBiomeCount = runtime.countPrevious(); // currently unused in result; kept for symmetry with plan 332. Drop if unused warns.

       // Snapshot cell biomes BEFORE define runs.
       let snapshot: number[];
       try {
         const before = runtime.getCellBiomes();
         snapshot = Array.from(before, (v) => v);
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }

       let defaults: unknown;
       try {
         defaults = runtime.getDefault();
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }
       runtime.setBiomesData(defaults);

       try {
         runtime.define();
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }

       // Compute cells_changed.
       const after = runtime.getCellBiomes();
       const len = Math.min(snapshot.length, after.length);
       let cells_changed = 0;
       for (let i = 0; i < len; i++) {
         if (snapshot[i] !== after[i]) cells_changed++;
       }

       const drew = runtime.drawBiomes();
       const recalculated_population = runtime.recalculatePopulation();

       const biomes_count = (() => {
         const name = (defaults as { name?: unknown } | undefined)?.name;
         return Array.isArray(name) ? name.length : 0;
       })();

       return okResult({
         biomes_count,
         cells_changed,
         drew,
         recalculated_population,
       });
       ```
       Note: `_previousBiomeCount` is computed for symmetry with
       plan 332 but the result schema doesn't currently surface it.
       If `noUnusedLocals` complains, prefix with `_` or drop the
       call. (Strict TS; the leading underscore suppresses the
       warning per project convention.) **Decision: drop the
       `countPrevious` call entirely from the execute body since it's
       not in the result. Keep it in the runtime interface so future
       extensions can use it. Update tests accordingly — drop the
       `countPrevious` invocation-order assertion.** ← this
       simplification is reflected below in the test list (§2 only
       asserts seven seams: snapshot, getDefault, setBiomesData,
       define, post-define snapshot, drawBiomes,
       recalculatePopulation).
   - Export `restoreDefaultBiomesTool = createRestoreDefaultBiomesTool()`.

   **CORRECTION (added during review)**: per the plan §11, the
   `countPrevious` runtime seam IS still defined on the interface for
   future use, but the tool body does NOT call it (the result schema
   does not surface a "previous_count" — `biomes_count` is the
   AFTER count derived from the returned defaults). Tests should
   verify `countPrevious` exists on the interface but is not asserted
   in the call-order test. **Final simplification: remove
   `countPrevious` from the runtime interface entirely** since
   nothing calls it. Drop from interface, drop default impl, drop
   from test helper. Aligns with YAGNI.

2. **Create the test file** `src/ai/tools/restore-default-biomes.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `ToolRegistry` from `./index`; default + factory +
     types from `./restore-default-biomes`.
   - Helper:
     ```ts
     function makeRuntime(opts: {
       getDefault?: () => unknown;
       setBiomesData?: (data: unknown) => void;
       define?: () => void;
       cellBiomesSequence?: ArrayLike<number>[];
       drawBiomes?: () => boolean;
       recalculatePopulation?: () => boolean;
     } = {}): {
       runtime: RestoreDefaultBiomesRuntime;
       getDefault: ReturnType<typeof vi.fn>;
       setBiomesData: ReturnType<typeof vi.fn>;
       define: ReturnType<typeof vi.fn>;
       getCellBiomes: ReturnType<typeof vi.fn>;
       drawBiomes: ReturnType<typeof vi.fn>;
       recalculatePopulation: ReturnType<typeof vi.fn>;
     }
     ```
     `cellBiomesSequence` defaults to `[[]]` (returns `[]` every
     call). The mock `getCellBiomes` consumes the sequence by index;
     once exhausted, it returns the LAST entry. This lets a test
     simulate "first call returns A, second returns B" or single-
     value semantics.

   - `describe("restore_default_biomes tool", …)` (stub-runtime tests):

     - **§1 Happy path**: build `defaultData = { name: Array.from({
       length: 13 }, (_, i) => \`B${i}\`) }`. Stub `cellBiomesSequence:
       [Uint8Array.of(0, 1, 2, 3, 4), Uint8Array.of(0, 1, 9, 9, 4)]`
       (2 cells differ). Expect parsed result to equal `{ ok: true,
       biomes_count: 13, cells_changed: 2, drew: true,
       recalculated_population: true }`. Each seam called expected
       times.

     - **§2 Call ORDER (load-bearing)**:
       ```ts
       // Order: getCellBiomes-snapshot → getDefault → setBiomesData
       //   → define → getCellBiomes-postdefine → drawBiomes → recalculatePopulation
       const orders = [
         getCellBiomes.mock.invocationCallOrder[0]!,
         getDefault.mock.invocationCallOrder[0]!,
         setBiomesData.mock.invocationCallOrder[0]!,
         define.mock.invocationCallOrder[0]!,
         getCellBiomes.mock.invocationCallOrder[1]!,
         drawBiomes.mock.invocationCallOrder[0]!,
         recalculatePopulation.mock.invocationCallOrder[0]!,
       ];
       for (let i = 1; i < orders.length; i++) {
         expect(orders[i - 1]).toBeLessThan(orders[i]);
       }
       ```
       Critical sub-orderings (asserted by the chain): snapshot
       BEFORE getDefault, setBiomesData BEFORE define, define BEFORE
       post-define snapshot, drawBiomes BEFORE recalc.

     - **§3 cells_changed reflects the snapshot taken BEFORE define
       (load-bearing)**: stub `cellBiomesSequence: [[0, 1, 2, 3], [0,
       5, 6, 3]]`. Run tool. Assert `cells_changed: 2` (indices 1, 2
       differ). Pins that the snapshot was taken from the FIRST
       getCellBiomes call (pre-define). If the tool snapshotted post-
       define instead, cells_changed would be 0.

     - **§4 Identity-passthrough (stub variant)**: stub `getDefault`
       returns a known reference; assert `setBiomesData` was called
       with the SAME reference (`expect(setBiomesData.mock.calls[0]?.[0]).toBe(returnedRef)`).
       Pins that the tool does not wrap / clone the data.

     - **§5 Surfaces getDefault errors**: stub `getDefault: () => {
       throw new Error("Biomes.getDefault is not available; the map
       hasn't finished loading."); }`. Run tool. Assert
       `result.isError === true`, error matches `/Biomes\.getDefault/`.
       `setBiomesData`, `define`, `drawBiomes`,
       `recalculatePopulation` NOT called. The pre-define
       `getCellBiomes` (snapshot) IS called once.

     - **§6 Surfaces define errors (biomesData WAS swapped)**: stub
       `getDefault: () => ({ name: ["X"] })`, `define: () => { throw
       new Error("Biomes.define is not available; the map hasn't
       finished loading."); }`. Run tool. Assert `result.isError ===
       true`, error matches `/Biomes\.define/`. `setBiomesData` WAS
       called once (legacy ordering: replace global before define).
       `drawBiomes`, `recalculatePopulation` NOT called.

     - **§7 Surfaces snapshot getCellBiomes error**: stub
       `getCellBiomes` to throw on FIRST call:
       ```ts
       getCellBiomes: () => { throw new Error(
         "window.pack.cells.biome is not available; the map hasn't finished loading.",
       ); }
       ```
       (override the default sequence handler). Run tool. Assert
       `result.isError === true`, error matches `/pack\.cells\.biome/`.
       `getDefault`, `setBiomesData`, `define`, `drawBiomes`,
       `recalculatePopulation` NOT called.

     - **§8 drawBiomes returns false → drew: false; no error**: stub
       `drawBiomes: () => false`. Run tool. Assert `drew: false`,
       `recalculated_population: true`. No error. (The seam already
       handled the missing/throwing case internally.)

     - **§9 recalculatePopulation returns false → recalculated_population:
       false; no error**: stub `recalculatePopulation: () => false`.
       Run tool. Assert `drew: true`, `recalculated_population: false`.
       No error.

     - **§10 biomes_count: 0 when getDefault returns
       { name: undefined }**: stub `getDefault: () => ({ name:
       undefined })`. Run tool. Assert `biomes_count: 0`. Defensive.

     - **§11 Tool name + schema + registry round-trip**:
       - `tool.name === "restore_default_biomes"`.
       - `tool.input_schema.type === "object"`.
       - `tool.input_schema.properties` deep-equals `{}`.
       - `(tool.input_schema as { required?: unknown }).required` is
         undefined.
       - `new ToolRegistry()`,
         `registry.register(restoreDefaultBiomesTool)`,
         `expect(registry.list().map(t => t.name)).toContain(
         "restore_default_biomes")`.

     - **§12 Empty-input handling**: passing `{}`, `null`, `undefined`,
       `{ extra: "ignored" }` → all execute identically; assert
       `define` was called 4 times after the loop.

   - `describe("defaultRestoreDefaultBiomesRuntime (integration)", …)`:
     - Save originals at module top:
       ```ts
       const originalBiomes = (globalThis as { Biomes?: unknown }).Biomes;
       const originalBiomesData = (globalThis as { biomesData?: unknown }).biomesData;
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalDrawBiomes = (globalThis as { drawBiomes?: unknown }).drawBiomes;
       const originalRecalc = (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation;
       ```
     - `beforeEach`: set sane defaults for all five (working `Biomes`
       with `getDefault: vi.fn(() => ({ name: ["X"] }))` and
       `define: vi.fn()`; `biomesData = { name: ["A", "B"] }`;
       `pack = { cells: { biome: new Uint8Array([0, 1, 2, 3, 4]) } }`;
       `drawBiomes = vi.fn()`; `recalculatePopulation = vi.fn()`).
     - `afterEach`: restore all five originals.

     - **§13 Calls Biomes.getDefault then Biomes.define and reassigns
       biomesData (identity pin)**:
       ```ts
       const defaultData = { i: [0, 1, 2], name: ["X", "Y", "Z"] };
       const cellBiome = new Uint8Array([0, 1, 2, 3, 4]);
       const defineFn = vi.fn(() => { cellBiome[1] = 7; }); // 1 cell changes
       (globalThis as { biomesData?: unknown }).biomesData = { name: ["A", "B"] };
       (globalThis as { Biomes?: unknown }).Biomes = {
         getDefault: vi.fn(() => defaultData),
         define: defineFn,
       };
       (globalThis as { pack?: unknown }).pack = { cells: { biome: cellBiome } };
       const drawBiomes = vi.fn();
       const recalc = vi.fn();
       (globalThis as { drawBiomes?: unknown }).drawBiomes = drawBiomes;
       (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation = recalc;

       const result = await restoreDefaultBiomesTool.execute({});

       expect(result.isError).toBeFalsy();
       expect(JSON.parse(result.content)).toEqual({
         ok: true,
         biomes_count: 3,
         cells_changed: 1,
         drew: true,
         recalculated_population: true,
       });
       // Load-bearing identity pin.
       expect((globalThis as { biomesData?: unknown }).biomesData).toBe(defaultData);
       expect(defineFn).toHaveBeenCalledTimes(1);
       expect(drawBiomes).toHaveBeenCalledTimes(1);
       expect(recalc).toHaveBeenCalledTimes(1);
       ```

     - **§14 Errors when Biomes is missing**:
       `(globalThis as { Biomes?: unknown }).Biomes = undefined`.
       Snapshot `previousBiomesData = globalThis.biomesData`.
       Snapshot `previousCellBiomes = Array.from(pack.cells.biome)`.
       Run tool. Assert `result.isError === true`, error matches
       `/Biomes\.getDefault/`. Assert
       `globalThis.biomesData === previousBiomesData` (UNCHANGED).
       Assert `Array.from(pack.cells.biome)` deep-equals
       `previousCellBiomes`.

     - **§15 Errors when Biomes.define is not callable**:
       ```ts
       const defaultData = { name: ["X"] };
       (globalThis as { Biomes?: unknown }).Biomes = {
         getDefault: vi.fn(() => defaultData),
         define: undefined,
       };
       const result = await restoreDefaultBiomesTool.execute({});
       expect(result.isError).toBe(true);
       expect(JSON.parse(result.content).error).toMatch(/Biomes\.define/);
       // Documented partial-state limitation:
       expect((globalThis as { biomesData?: unknown }).biomesData).toBe(defaultData);
       ```

     - **§16 Errors when pack.cells.biome is missing**:
       `(globalThis as { pack?: unknown }).pack = { cells: {} };`.
       Snapshot `previousBiomesData = globalThis.biomesData`. Run
       tool. Error matches `/pack\.cells\.biome/`. Assert
       `globalThis.biomesData === previousBiomesData` (UNCHANGED — the
       error happens during the snapshot, before getDefault).

     - **§17 drawBiomes missing → drew: false**:
       `(globalThis as { drawBiomes?: unknown }).drawBiomes = undefined`.
       Run tool. Result `drew: false`,
       `recalculated_population: true`.

     - **§18 drawBiomes throws → drew: false**:
       `(globalThis as { drawBiomes?: unknown }).drawBiomes = () => {
       throw new Error("x"); }`. Run tool. Result `drew: false`,
       `recalculated_population: true`. No error result.

     - **§19 recalculatePopulation missing →
       recalculated_population: false**:
       `(globalThis as { recalculatePopulation?: unknown }).recalculatePopulation = undefined`.
       Run tool. Result `drew: true`,
       `recalculated_population: false`.

     - **§20 recalculatePopulation throws →
       recalculated_population: false**:
       `(globalThis as { recalculatePopulation?: unknown }).recalculatePopulation = () => { throw new Error("y"); }`.
       Run tool. Result `drew: true`,
       `recalculated_population: false`. No error.

     - **§21 Surfaces a thrown runtime error from getDefault**:
       `(globalThis as { Biomes?: unknown }).Biomes = {
       getDefault: () => { throw new Error("boom"); },
       define: vi.fn() }`. Snapshot. Run tool. Error exactly
       `"boom"`. `Biomes.define` NOT called. `biomesData`
       UNCHANGED.

     - **§22 Surfaces a thrown runtime error from define
       (biomesData IS swapped)**:
       ```ts
       const defaultData = { name: ["X"] };
       const drawBiomes = vi.fn();
       const recalc = vi.fn();
       (globalThis as { Biomes?: unknown }).Biomes = {
         getDefault: vi.fn(() => defaultData),
         define: () => { throw new Error("boom2"); },
       };
       (globalThis as { drawBiomes?: unknown }).drawBiomes = drawBiomes;
       (globalThis as { recalculatePopulation?: unknown }).recalculatePopulation = recalc;
       const result = await restoreDefaultBiomesTool.execute({});
       expect(result.isError).toBe(true);
       expect(JSON.parse(result.content).error).toBe("boom2");
       expect((globalThis as { biomesData?: unknown }).biomesData).toBe(defaultData);
       expect(drawBiomes).not.toHaveBeenCalled();
       expect(recalc).not.toHaveBeenCalled();
       ```

3. **Wire into `src/ai/index.ts`**:
   - Add
     `import { restoreDefaultBiomesTool } from "./tools/restore-default-biomes";`
     immediately BEFORE the existing
     `restoreDefaultNamesbasesTool` import at line 249. Alphabetical:
     `restore-default-b…` < `restore-default-n…`.
   - Add a re-export block immediately BEFORE the existing
     `restore-default-namesbases` re-export at line 2247:
     ```ts
     export {
       type BiomesDataLike,
       createRestoreDefaultBiomesTool,
       defaultRestoreDefaultBiomesRuntime,
       type RestoreDefaultBiomesResult,
       type RestoreDefaultBiomesRuntime,
       restoreDefaultBiomesTool,
     } from "./tools/restore-default-biomes";
     ```
     If `BiomesDataLike` clashes with an existing export name from
     another biomes tool, omit it from the re-export (it's an
     internal-only interface).
   - Add `registry.register(restoreDefaultBiomesTool);` immediately
     BEFORE `registry.register(restoreDefaultNamesbasesTool);` at
     line 3188.

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -10`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the `plan-358-restore-default-biomes`
   branch:
   - `git add aiplans/plan_358.md aiplans/tasks_358.md
     src/ai/tools/restore-default-biomes.ts
     src/ai/tools/restore-default-biomes.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add restore_default_biomes tool

     Implements plan 358. Adds an AI chat tool that calls Biomes.getDefault()
     to reassign window.biomesData and Biomes.define() to re-assign cell
     biomes from the defaults, then redraws and recalculates population —
     mirroring the "Restore" button in the biomes editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
