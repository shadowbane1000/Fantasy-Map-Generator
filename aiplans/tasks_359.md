# Tasks 359 — `set_cell_biome` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/set-cell-biome.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`
        from `./_shared`; `Tool`, `ToolResult` from `./index`.
  - [ ] Types:
    - [ ] `CellBiomeArrayLike` —
          `ArrayLike<number> & { [i: number]: number; length: number }`.
    - [ ] `BiomesDataLike` — `{ name?: ArrayLike<string> & { length: number; [i: number]: string } }`
          (or simply `{ name?: string[] }`; the legacy stores it as a
          plain string array).
    - [ ] `CellBiomeRuntime` interface with:
      - `getCellBiomes(): CellBiomeArrayLike | null;`
      - `setCellBiome(cell: number, biome: number): void;`
      - `getBiomeNames(): string[] | null;`
      - `drawBiomes(): void;`  // best-effort; runtime decides if it's a no-op
  - [ ] `defaultCellBiomeRuntime`:
    - [ ] `getCellBiomes()`: read `getPack<{ cells?: { biome?: CellBiomeArrayLike } }>()?.cells?.biome`.
          Return null if missing or `length` is not a number.
    - [ ] `setCellBiome(cell, biome)`: re-read the array via
          `getCellBiomes()`. If null → throw
          `"window.pack.cells.biome is not available; the map hasn't finished loading."`.
          Write `arr[cell] = biome` IN PLACE.
    - [ ] `getBiomeNames()`: read
          `getGlobal<BiomesDataLike>("biomesData")?.name`. Return
          `null` if not an array.
    - [ ] `drawBiomes()`: read `getGlobal<() => void>("drawBiomes")`;
          if function, call inside `try { ... } catch {}`. Otherwise
          no-op.
  - [ ] Validation helper `validateNonNegativeInteger(name, raw): number | string`:
    - Returns the number on success, the error string on failure.
    - Returns `"${name} must be a non-negative integer."` for any
      non-number / non-finite / non-integer / negative input.
    - Used for both `cell` and `biome` so error messages match
      verbatim spec.
  - [ ] `createSetCellBiomeTool(runtime = defaultCellBiomeRuntime)`:
    - [ ] `name = "set_cell_biome"`.
    - [ ] `description`: explain it sets `pack.cells.biome[cell]`
          for a single cell, mirrors the `applyBiomesChange` per-
          polygon write in the Biomes Editor's customization mode,
          best-effort calls `drawBiomes()`. Note that this is the
          biome counterpart to `set_cell_height`. Atomic — does NOT
          recompute population. Mention that `cell` is a packed-
          grid index (`pack.cells`) not a `grid.cells` index.
    - [ ] `input_schema`:
          ```jsonc
          {
            type: "object",
            properties: {
              cell: { type: "integer", minimum: 0, description: "Cell index in pack.cells (0-based)." },
              biome: { type: "integer", minimum: 0, description: "Biome id (index into biomesData)." },
            },
            required: ["cell", "biome"],
          }
          ```
    - [ ] `execute(rawInput)`:
      - [ ] Coerce input as `{ cell?: unknown; biome?: unknown }`.
      - [ ] Validate `cell` via helper → on string return errorResult.
      - [ ] Validate `biome` via helper → on string return errorResult.
      - [ ] Call `runtime.getCellBiomes()`; null →
            `errorResult("window.pack.cells.biome is not available; the map hasn't finished loading.")`.
      - [ ] Call `runtime.getBiomeNames()`; null →
            `errorResult("window.biomesData.name is not available; the map hasn't finished loading.")`.
      - [ ] If `cell >= cellBiomes.length` → errorResult
            `\`cell ${cell} is out of range (max ${cellBiomes.length - 1}).\``.
      - [ ] If `biome >= biomeNames.length` → errorResult
            `\`biome ${biome} is not a valid biome id (max ${biomeNames.length - 1}).\``.
      - [ ] Capture `previous = cellBiomes[cell]` (number).
      - [ ] Lookup `previous_biome_name = biomeNames[previous] ?? ""`
            (defensive guard for out-of-range previous values).
      - [ ] Lookup `biome_name = biomeNames[biome] ?? ""`.
      - [ ] Try `runtime.setCellBiome(cell, biome)`. Catch and
            convert to `errorResult(err.message)`.
      - [ ] Try `runtime.drawBiomes()`. Catch and ignore — best-
            effort only.
      - [ ] Return:
            ```ts
            okResult({
              cell,
              previous_biome: previous,
              previous_biome_name,
              biome,
              biome_name,
            });
            ```
  - [ ] Export `setCellBiomeTool = createSetCellBiomeTool()`.

- [ ] Create `src/ai/tools/set-cell-biome.test.ts`:
  - [ ] Imports: `afterEach, beforeEach, describe, expect, it, vi`
        from "vitest"; the tool factory plus default runtime and
        registry from sibling modules.
  - [ ] `makeRuntime(opts?)` helper that returns
        `{ runtime, setCellBiome, drawBiomes, getCellBiomes, getBiomeNames }`
        with sensible defaults (a 5-element typed array `[0,1,2,3,4]`,
        a 13-element `biomesData.name` matching the default biomes
        list). Allow each callback to be overridden, including
        `getCellBiomes: () => null` etc.
  - [ ] **Stub-runtime suite (tests 1–24):**
    - [ ] Test 1: happy path — cell=7 array-like with prev biome=2,
          biome=5; assert success body
          `{ ok: true, cell: 7, previous_biome: 2, previous_biome_name: "Hot desert",
             biome: 5, biome_name: "Taiga" }`. (Use a 13-element name
          array indexed: 0=Marine, 1=Hot desert, 2=Cold desert,
          3=Savanna, 4=Grassland, 5=Tropical seasonal forest,
          6=Temperate deciduous forest, 7=Tropical rainforest,
          8=Temperate rainforest, 9=Taiga, 10=Tundra, 11=Glacier,
          12=Wetland.) Adjust expected names to match the chosen
          arrays.
    - [ ] Test 2: same-biome no-op — cell=7 prev=2 biome=2 →
          previous_biome=2, biome=2, both names equal; setCellBiome
          still called once with (7, 2).
    - [ ] Test 3: previous_biome captured BEFORE mutation — pass a
          stub `setCellBiome` that mutates the underlying typed
          array; assert `previous_biome` matches snapshot value.
          Use `vi.fn` order assertions: returned previous value is
          the pre-write number.
    - [ ] Test 4: biome_name lookup uses biomesData.name — pass a
          custom `getBiomeNames` returning
          `["A","B","C","D","E","F"]`; cell prev=1 biome=4 → names
          B and E.
    - [ ] Test 5: previous_biome_name defensive "" — biomesData.name
          is `["X","Y"]` (length 2), but cellBiomes[cell]=99 (the
          previous value, which is invalid in this fixture). To
          set it up, pre-populate the typed array to contain 99 at
          position 0 and call with cell=0 biome=1. Assert
          `previous_biome === 99` and `previous_biome_name === ""`.
          (We must allow the validation step to NOT block — note:
          the validation only checks `biome` against name length,
          not `previous`. Since biome=1 is in range, this proceeds.
          The pre-existing 99 in the cells array is a stale value —
          the test confirms our lookup is defensive.)
    - [ ] Test 6: drawBiomes called when present — `vi.fn`
          drawBiomes; assert called once.
    - [ ] Test 7: drawBiomes missing → no error — runtime's
          drawBiomes is a no-op (or `vi.fn(() => undefined)`),
          tool succeeds.
    - [ ] Test 8: drawBiomes throws → no error — `vi.fn(() => { throw new Error("boom") })`;
          tool still returns success; data already written.
    - [ ] Test 9: rejects missing cell — `[undefined, null]` for
          cell → error `/cell must be a non-negative integer/i`;
          setCellBiome not called.
    - [ ] Test 10: rejects missing biome — same with biome.
    - [ ] Test 11: rejects non-numeric cell — `["1", true, {},
          NaN, +Infinity, -Infinity]` → error.
    - [ ] Test 12: rejects non-integer cell — `[1.5, 2.1, 3.9999]`
          → error.
    - [ ] Test 13: rejects negative cell — `[-1, -100]` → error.
    - [ ] Test 14: rejects non-numeric biome — `["1", true, {},
          NaN, +Infinity]` → error.
    - [ ] Test 15: rejects non-integer biome — `[1.5]` → error.
    - [ ] Test 16: rejects negative biome — `[-1]` → error.
    - [ ] Test 17: cell out of range — `cellBiomes` length=5;
          cell=5 → error `"cell 5 is out of range (max 4)."`.
          Also test cell=10 → `"cell 10 is out of range (max 4)."`.
    - [ ] Test 18: biome out of range — `biomeNames` length=13;
          biome=13 → error `"biome 13 is not a valid biome id (max 12)."`.
          Also test biome=99 → similar.
    - [ ] Test 19: missing pack.cells.biome — `getCellBiomes`
          returns null → error
          `"window.pack.cells.biome is not available; the map hasn't finished loading."`.
    - [ ] Test 20: missing biomesData.name — `getBiomeNames`
          returns null → error
          `"window.biomesData.name is not available; the map hasn't finished loading."`.
    - [ ] Test 21: typed-array mutation in-place — runtime's
          `getCellBiomes` returns a `Uint8Array` it captured; the
          `setCellBiome` impl writes via `arr[cell] = biome` into
          THAT array; after the call, assert the same array
          reference and that `arr[cell] === biome`.
    - [ ] Test 22: runtime errors propagate — `setCellBiome` throws
          `new Error("custom write failure")` → error result
          containing "custom write failure".
    - [ ] Test 23: registry round-trip — fresh `ToolRegistry`,
          register the tool produced by `createSetCellBiomeTool`
          with a controlled stub runtime; dispatch via
          `registry.run("set_cell_biome", { cell: 0, biome: 0 })`;
          assert success and that the stub was called.
    - [ ] Test 24: tool shape sanity — name, schema required.
  - [ ] **Default-runtime integration suite (tests 25–32):**
    - [ ] `globalsRef` typed cast for globalThis with `pack`,
          `biomesData`, `drawBiomes` keys; capture / restore in
          `beforeEach` / `afterEach`.
    - [ ] Test 25: default runtime mutates globalThis.pack.cells.biome
          in place — populate `globalThis.pack = { cells: { biome:
          new Uint8Array([0,1,2,3,4]) } }`; populate
          `globalThis.biomesData = { name: [13 names...] }`. Capture
          the typed-array reference. Invoke the default-runtime tool
          with `cell: 2, biome: 4`. Assert
          `pack.cells.biome[2] === 4` and the captured reference is
          still `===` the current `pack.cells.biome` (no
          reassignment).
    - [ ] Test 26: default runtime captures previous_biome BEFORE
          mutation — same fixture, set `cell: 2, biome: 4` → result
          body has `previous_biome: 2`, `biome: 4`. (The cells
          array initially contained 2 at index 2.)
    - [ ] Test 27: default runtime same-biome no-op — set
          `cell: 2, biome: 2` (current value) → result has
          previous_biome=2, biome=2; succeeds.
    - [ ] Test 28: default runtime missing pack.cells.biome —
          `globalThis.pack = {}` → error
          `/pack.cells.biome is not available/`. (No drawBiomes
          should be called either; test by also tracking
          `globalThis.drawBiomes`.)
    - [ ] Test 29: default runtime missing biomesData.name —
          `globalThis.biomesData = {}` (or undefined) → error
          `/biomesData.name is not available/`.
    - [ ] Test 30: default runtime drawBiomes called when present —
          install `globalThis.drawBiomes = vi.fn()`; invoke;
          assert it was called once.
    - [ ] Test 31: default runtime drawBiomes missing — delete
          `globalThis.drawBiomes`; tool still succeeds.
    - [ ] Test 32: default runtime drawBiomes throws — install
          `globalThis.drawBiomes = vi.fn(() => { throw new Error("boom") })`;
          tool still succeeds; data still mutated.
  - [ ] Sanity assertions on
        `setCellBiomeTool.name === "set_cell_biome"` and
        `input_schema.required === ["cell", "biome"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { setCellBiomeTool } from "./tools/set-cell-biome";`
        immediately BEFORE the `setCellHeightTool` import line
        (alphabetical: set-cell-biome < set-cell-height).
  - [ ] Add re-export block immediately BEFORE the `set-cell-height`
        re-export:
        ```ts
        export {
          createSetCellBiomeTool,
          setCellBiomeTool,
        } from "./tools/set-cell-biome";
        ```
  - [ ] Add `registry.register(setCellBiomeTool);` immediately
        BEFORE `registry.register(setCellHeightTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage:
  - `src/ai/tools/set-cell-biome.ts`
  - `src/ai/tools/set-cell-biome.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_359.md`
  - `aiplans/tasks_359.md`
- [ ] Commit on branch `plan-359-set-cell-biome` with the
      spec-required message:
  ```
  feat(ai): add set_cell_biome tool

  Implements plan 359. Adds an AI chat tool that overrides
  pack.cells.biome[i] for a single cell, mirroring the per-cell write in
  the biomes editor's customization mode.
  ```
  Use a HEREDOC. Do NOT push.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`set-cell-biome.ts`, `set-cell-biome.test.ts`).
- [ ] Stub-runtime tests: 24 (1–24). Integration: 8 (25–32).
      Total: 32 tests.
- [ ] Typed-array IN-PLACE write tested — test 21 (stub) +
      test 25 (default runtime).
- [ ] previous_biome captured BEFORE mutation — test 3 (stub) +
      test 26 (default).
- [ ] biome_name lookup against biomesData.name — test 4 (stub),
      indirectly tests 25/26 use a real names array.
- [ ] previous_biome_name defensive "" fallback — test 5.
- [ ] Same-biome no-op — test 2 (stub) + test 27 (default).
- [ ] drawBiomes best-effort — tests 6/7/8 (stub) + 30/31/32 (default).
- [ ] Errors-verbatim list matches plan and tests.
- [ ] Index registration alphabetically slotted between
      setCellHeightTool and setCellsDensityTool — wait, BEFORE
      `setCellHeightTool` actually (set-cell-biome alphabetises
      before set-cell-height).
- [ ] No `recalculatePopulation()` invocation — keep tool atomic.
