# Tasks 360 — `set_cell_culture` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/set-cell-culture.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`
        from `./_shared`; `Tool`, `ToolResult` from `./index`.
  - [ ] Types:
    - [ ] `CellCultureArrayLike` —
          `ArrayLike<number> & { [i: number]: number; length: number }`.
    - [ ] `CultureLike` — `{ i?: number; name?: string; removed?: boolean }`.
    - [ ] `PackLike` — `{ cells?: { culture?: CellCultureArrayLike };
          cultures?: (CultureLike | null | undefined)[] }`.
    - [ ] `CellCultureRuntime` interface with:
      - `getCellCultures(): CellCultureArrayLike | null;`
      - `setCellCulture(cell: number, culture: number): void;`
      - `getCultures(): (CultureLike | null | undefined)[] | null;`
      - `drawCultures(): void;`  // best-effort; runtime decides if no-op
  - [ ] `defaultCellCultureRuntime`:
    - [ ] `getCellCultures()`: read `getPack<PackLike>()?.cells?.culture`.
          Return null if missing or `length` is not a number.
    - [ ] `setCellCulture(cell, culture)`: re-read the array via
          `getPack<PackLike>()?.cells?.culture`. If null → throw
          `"window.pack.cells.culture is not available; the map hasn't finished loading."`.
          Write `arr[cell] = culture` IN PLACE.
    - [ ] `getCultures()`: read `getPack<PackLike>()?.cultures`.
          Return `null` if not an array.
    - [ ] `drawCultures()`: read `getGlobal<() => void>("drawCultures")`;
          if function, call inside `try { ... } catch {}`. Otherwise
          no-op.
  - [ ] Validation helper `validateNonNegativeInteger(name, raw): number | string`:
    - Returns the number on success, the error string on failure.
    - Returns `"${name} must be a non-negative integer."` for any
      non-number / non-finite / non-integer / negative input.
    - Used for both `cell` and `culture` so error messages match
      verbatim spec.
  - [ ] `createSetCellCultureTool(runtime = defaultCellCultureRuntime)`:
    - [ ] `name = "set_cell_culture"`.
    - [ ] `description`: explain it sets `pack.cells.culture[cell]`
          for a single cell, mirrors the
          `applyCultureManualAssignent` per-polygon write in the
          Cultures Editor's Manual mode, best-effort calls
          `drawCultures()`. Note that this is the culture
          counterpart to `set_cell_biome` and `set_cell_height`.
          Atomic — does NOT recompute population, does NOT mutate
          the co-located burg's culture, does NOT call
          `Cultures.expand()`. Mention `culture: 0` (Wildlands) is
          allowed.
    - [ ] `input_schema`:
          ```jsonc
          {
            type: "object",
            properties: {
              cell: { type: "integer", minimum: 0, description: "Cell index in pack.cells (0-based)." },
              culture: { type: "integer", minimum: 0, description: "Culture id (0 = Wildlands)." },
            },
            required: ["cell", "culture"],
          }
          ```
    - [ ] `execute(rawInput)`:
      - [ ] Coerce input as `{ cell?: unknown; culture?: unknown }`.
      - [ ] Validate `cell` via helper → on string return errorResult.
      - [ ] Validate `culture` via helper → on string return errorResult.
      - [ ] Call `runtime.getCellCultures()`; null →
            `errorResult("window.pack.cells.culture is not available; the map hasn't finished loading.")`.
      - [ ] Call `runtime.getCultures()`; null →
            `errorResult("window.pack.cultures is not available; the map hasn't finished loading.")`.
      - [ ] If `cell >= cellCultures.length` → errorResult
            `\`cell ${cell} is out of range (max ${cellCultures.length - 1}).\``.
      - [ ] If `culture >= cultures.length` → errorResult
            `\`culture ${culture} is not a valid culture id (max ${cultures.length - 1}).\``.
      - [ ] Look up `entry = cultures[culture]`. If `entry == null`
            OR `entry.removed === true` → errorResult
            `\`Culture ${culture} has been removed.\``.
      - [ ] Capture `previous = cellCultures[cell]` (number).
      - [ ] Lookup
            `previous_culture_name = cultures[previous]?.name ?? ""`
            (defensive guard for out-of-range / null previous slots).
      - [ ] Lookup `culture_name = entry.name ?? ""`.
      - [ ] Try `runtime.setCellCulture(cell, culture)`. Catch and
            convert to `errorResult(err.message)`.
      - [ ] Try `runtime.drawCultures()`. Catch and ignore — best-
            effort only.
      - [ ] Return:
            ```ts
            okResult({
              cell,
              previous_culture: previous,
              previous_culture_name,
              culture,
              culture_name,
            });
            ```
  - [ ] Export `setCellCultureTool = createSetCellCultureTool()`.

- [ ] Create `src/ai/tools/set-cell-culture.test.ts`:
  - [ ] Imports: `afterEach, beforeEach, describe, expect, it, vi`
        from "vitest"; the tool factory plus default runtime and
        registry from sibling modules.
  - [ ] `DEFAULT_CULTURES = [{i:0,name:"Wildlands"}, {i:1,name:"Common"},
        {i:2,name:"Elvish"}, {i:3,name:"Orcish"}, {i:4,name:"Halfling"},
        {i:5,name:"Dwarvish"}]`.
  - [ ] `makeRuntime(opts?)` helper that returns
        `{ runtime, cellCultures, cultures, setCellCulture, drawCultures,
        getCellCultures, getCultures }` with sensible defaults
        (a 5-element typed array `[0,1,2,3,4]`, the `DEFAULT_CULTURES`
        list). Allow each callback to be overridden, including
        `getCellCultures: () => null` etc.
  - [ ] **Stub-runtime suite (tests 1–27):**
    - [ ] Test 1: happy path — cell=7 cellCultures with prev culture=2,
          culture=5; assert success body
          `{ ok: true, cell: 7, previous_culture: 2, previous_culture_name: "Elvish",
             culture: 5, culture_name: "Dwarvish" }`. (Use a length-8
          typed array `[0,1,2,3,4,5,6,2]`.)
    - [ ] Test 2: culture=0 (Wildlands) accepted — cell=7 culture=0
          → success; `culture_name === "Wildlands"`. setCellCulture
          called with (7, 0).
    - [ ] Test 3: same-culture no-op — cell=7 prev=2 culture=2 →
          previous_culture=2, culture=2, both names equal "Elvish";
          setCellCulture still called once with (7, 2).
    - [ ] Test 4: previous_culture captured BEFORE mutation — pass a
          stub `setCellCulture` that mutates the underlying typed
          array; assert `previous_culture` matches snapshot value
          AND that the post-mutation array shows the new value.
    - [ ] Test 5: culture_name lookup uses pack.cultures — pass a
          custom `getCultures` returning
          `[{i:0,name:"A"},{i:1,name:"B"},{i:2,name:"C"},{i:3,name:"D"},
          {i:4,name:"E"},{i:5,name:"F"}]`; cell prev=1 culture=4 →
          names B and E.
    - [ ] Test 6: previous_culture_name defensive "" — cultures list
          length 2 (`[{i:0,name:"X"},{i:1,name:"Y"}]`), but
          cellCultures[0]=99 (stale value). Call with cell=0
          culture=1. Assert `previous_culture === 99`,
          `previous_culture_name === ""`, `culture === 1`,
          `culture_name === "Y"`.
    - [ ] Test 7: previous_culture_name "" when slot is null/undefined
          — cultures `[{i:0,name:"Wildlands"}, null, {i:2,name:"OK"}]`,
          cellCultures = `[0,1,2]`. Call cell=1 culture=2: prev=1 →
          slot is null → `previous_culture_name === ""`; culture_name
          === "OK". (Make sure `cultures[1] = null` doesn't trip the
          target-slot check — target is index 2.)
    - [ ] Test 8: drawCultures called when present — `vi.fn`
          drawCultures; assert called once.
    - [ ] Test 9: drawCultures missing → no error — runtime's
          drawCultures is a no-op (or `vi.fn(() => undefined)`),
          tool succeeds.
    - [ ] Test 10: drawCultures throws → no error — `vi.fn(() => { throw new Error("boom") })`;
          tool still returns success; data already written.
    - [ ] Test 11: rejects missing cell — `[undefined, null]` for
          cell → error `/cell must be a non-negative integer/i`;
          setCellCulture not called.
    - [ ] Test 12: rejects missing culture — same with culture.
    - [ ] Test 13: rejects non-numeric cell — `["1", true, {},
          NaN, +Infinity, -Infinity]` → error.
    - [ ] Test 14: rejects non-integer cell — `[1.5, 2.1, 3.9999]`
          → error.
    - [ ] Test 15: rejects negative cell — `[-1, -100]` → error.
    - [ ] Test 16: rejects non-numeric culture — `["1", true, {},
          NaN, +Infinity]` → error.
    - [ ] Test 17: rejects non-integer culture — `[1.5]` → error.
    - [ ] Test 18: rejects negative culture — `[-1]` → error.
    - [ ] Test 19: cell out of range — `cellCultures` length=5;
          cell=5 → error `"cell 5 is out of range (max 4)."`.
          Also test cell=10 → `"cell 10 is out of range (max 4)."`.
    - [ ] Test 20: culture out of range — `cultures` length=6;
          culture=6 → error `"culture 6 is not a valid culture id (max 5)."`.
          Also test culture=99 → similar.
    - [ ] Test 21: removed culture rejected — cultures list with
          `cultures[3].removed = true`; call culture=3 → error
          `"Culture 3 has been removed."`. setCellCulture NOT called;
          cellCultures untouched.
    - [ ] Test 22: missing pack.cells.culture — `getCellCultures`
          returns null → error
          `"window.pack.cells.culture is not available; the map hasn't finished loading."`.
    - [ ] Test 23: missing pack.cultures — `getCultures`
          returns null → error
          `"window.pack.cultures is not available; the map hasn't finished loading."`.
    - [ ] Test 24: typed-array mutation in-place — runtime's
          `getCellCultures` returns a `Uint8Array` it captured; the
          `setCellCulture` impl writes via `arr[cell] = culture` into
          THAT array; after the call, assert the same array
          reference (via `getCellCultures.mock.results[0]?.value`) and
          that `arr[cell] === culture`.
    - [ ] Test 25: runtime errors propagate — `setCellCulture` throws
          `new Error("custom write failure")` → error result
          containing "custom write failure".
    - [ ] Test 26: registry round-trip — fresh `ToolRegistry`,
          register the tool produced by `createSetCellCultureTool`
          with a controlled stub runtime; dispatch via
          `registry.run("set_cell_culture", { cell: 0, culture: 0 })`;
          assert success and that the stub was called.
    - [ ] Test 27: tool shape sanity — name, schema required.
  - [ ] **Default-runtime integration suite (tests 28–37):**
    - [ ] `globalsRef` typed cast for globalThis with `pack`,
          `drawCultures` keys; capture / restore in `beforeEach` /
          `afterEach`.
    - [ ] In `beforeEach`: set
          `globalsRef.pack = { cells: { culture: new Uint8Array([0,1,2,3,4]) },
          cultures: [...DEFAULT_CULTURES] }` (deep-cloned so mutations
          in one test don't bleed into the next). Delete
          `globalsRef.drawCultures`.
    - [ ] Test 28: default runtime mutates globalThis.pack.cells.culture
          in place — capture `arrBefore = pack.cells.culture`.
          Invoke with `cell: 2, culture: 4`. Assert
          `pack.cells.culture[2] === 4` and `pack.cells.culture === arrBefore`
          (no reassignment).
    - [ ] Test 29: default runtime captures previous_culture BEFORE
          mutation — same fixture, set `cell: 2, culture: 4` →
          result body has `previous_culture: 2`, `culture: 4`,
          `previous_culture_name: "Elvish"`, `culture_name: "Halfling"`.
    - [ ] Test 30: default runtime same-culture no-op — set
          `cell: 2, culture: 2` (current value) → result has
          previous_culture=2, culture=2; succeeds.
    - [ ] Test 31: default runtime culture=0 accepted — set
          `cell: 2, culture: 0` → success;
          `culture_name === "Wildlands"`; `pack.cells.culture[2] === 0`.
    - [ ] Test 32: default runtime missing pack.cells.culture —
          `globalsRef.pack = { cultures: [...DEFAULT_CULTURES] }` →
          error `/pack.cells.culture is not available/`.
    - [ ] Test 33: default runtime missing pack.cultures —
          `globalsRef.pack = { cells: { culture: new Uint8Array([0,1,2,3,4]) } }`
          → error `/pack.cultures is not available/`.
    - [ ] Test 34: default runtime removed culture rejected — set
          `globalsRef.pack.cultures[3].removed = true`. Capture
          `arrBefore = pack.cells.culture` content (e.g.
          `Array.from(...)`). Invoke with `cell: 0, culture: 3` →
          error `"Culture 3 has been removed."`. Assert cells array
          unchanged: `Array.from(pack.cells.culture)` equals
          `arrBefore`.
    - [ ] Test 35: default runtime drawCultures called when present —
          install `globalsRef.drawCultures = vi.fn()`; invoke
          (cell=0 culture=0 — Wildlands self-assign, valid); assert
          called once.
    - [ ] Test 36: default runtime drawCultures missing — delete
          `globalsRef.drawCultures`; tool still succeeds.
    - [ ] Test 37: default runtime drawCultures throws — install
          `globalsRef.drawCultures = vi.fn(() => { throw new Error("boom") })`;
          tool still succeeds; data still mutated.
  - [ ] Sanity assertions on
        `setCellCultureTool.name === "set_cell_culture"` and
        `input_schema.required === ["cell", "culture"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { setCellCultureTool } from "./tools/set-cell-culture";`
        immediately AFTER the `setCellBiomeTool` import line and
        BEFORE the `setCellHeightTool` import line (alphabetical:
        set-cell-biome < set-cell-culture < set-cell-height).
  - [ ] Add re-export block immediately AFTER the `set-cell-biome`
        re-export and BEFORE the `set-cell-height` re-export:
        ```ts
        export {
          createSetCellCultureTool,
          setCellCultureTool,
        } from "./tools/set-cell-culture";
        ```
  - [ ] Add `registry.register(setCellCultureTool);` immediately
        AFTER `registry.register(setCellBiomeTool);` and BEFORE
        `registry.register(setCellHeightTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage:
  - `src/ai/tools/set-cell-culture.ts`
  - `src/ai/tools/set-cell-culture.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_360.md`
  - `aiplans/tasks_360.md`
- [ ] Commit on branch `plan-360-set-cell-culture` with the
      spec-required message:
  ```
  feat(ai): add set_cell_culture tool

  Implements plan 360. Adds an AI chat tool that overrides
  pack.cells.culture[i] for a single cell, mirroring the per-cell write
  in the cultures editor's manual assignment mode. Atomic — does not
  trigger recalculate_cultures.
  ```
  Use a HEREDOC. Do NOT push.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`set-cell-culture.ts`, `set-cell-culture.test.ts`).
- [ ] Stub-runtime tests: 27 (1–27). Integration: 10 (28–37).
      Total: 37 tests.
- [ ] Typed-array IN-PLACE write tested — test 24 (stub) +
      test 28 (default runtime).
- [ ] previous_culture captured BEFORE mutation — test 4 (stub) +
      test 29 (default).
- [ ] culture_name lookup against pack.cultures — test 5 (stub),
      indirectly tests 28/29 use a real cultures list.
- [ ] previous_culture_name defensive "" fallback — test 6 (out of
      range) + test 7 (null slot).
- [ ] Same-culture no-op — test 3 (stub) + test 30 (default).
- [ ] culture=0 (Wildlands) accepted — test 2 (stub) + test 31
      (default).
- [ ] Removed culture rejected — test 21 (stub) + test 34 (default,
      cells unchanged).
- [ ] drawCultures best-effort — tests 8/9/10 (stub) + 35/36/37 (default).
- [ ] Errors-verbatim list matches plan and tests.
- [ ] Index registration alphabetically slotted between
      setCellBiomeTool and setCellHeightTool (set-cell-biome <
      set-cell-culture < set-cell-height).
- [ ] No `recalculatePopulation()` invocation, no `Cultures.expand()`,
      no burg co-write — keep tool atomic.
