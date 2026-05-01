# Tasks 361 — `set_cell_religion` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/set-cell-religion.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
        `RawReligion` from `./_shared`; `Tool`, `ToolResult` from
        `./index`.
  - [ ] Types:
    - [ ] `CellReligionArrayLike` —
          `ArrayLike<number> & { [i: number]: number; length: number }`.
    - [ ] `PackLike` — `{ cells?: { religion?: CellReligionArrayLike };
          religions?: RawReligion[] }`.
    - [ ] `CellReligionRuntime` interface with:
      - `getCellReligions(): CellReligionArrayLike | null;`
      - `setCellReligion(cell: number, religion: number): void;`
      - `getReligions(): RawReligion[] | null;`
      - `drawReligions(): void;`  // best-effort
  - [ ] `defaultCellReligionRuntime`:
    - [ ] `getCellReligions()`: read
          `getPack<PackLike>()?.cells?.religion`. Return null if
          missing or `length` is not a number.
    - [ ] `setCellReligion(cell, religion)`: re-read the array via
          `getPack<PackLike>()?.cells?.religion`. If missing → throw
          `"window.pack.cells.religion is not available; the map hasn't finished loading."`.
          Write `arr[cell] = religion` IN PLACE.
    - [ ] `getReligions()`: read `getPack<PackLike>()?.religions`.
          Return null if not an array.
    - [ ] `drawReligions()`: read `getGlobal<() => void>("drawReligions")`;
          if function, call inside `try { ... } catch {}`. Otherwise
          no-op.
  - [ ] Validation helper `validateNonNegativeInteger(name, raw): number | string`:
    - Returns the number on success, the error string on failure.
    - Returns `"${name} must be a non-negative integer."` for any
      non-number / non-finite / non-integer / negative input.
    - Used for both `cell` and `religion` so error messages match
      verbatim spec.
  - [ ] `createSetCellReligionTool(runtime = defaultCellReligionRuntime)`:
    - [ ] `name = "set_cell_religion"`.
    - [ ] `description`: explain it sets `pack.cells.religion[cell]`
          for a single cell, mirrors the per-cell write inside
          `applyReligionsManualAssignent` in the Religions Editor's
          Manual mode, best-effort calls `drawReligions()`. Note that
          this is the religion counterpart to `set_cell_biome` /
          `set_cell_culture` / `set_cell_height`. Atomic — does NOT
          trigger `recalculate_religions`. Mention that `cell` is a
          packed-grid index (`pack.cells`). Mention `religion: 0`
          (No-religion placeholder) is allowed.
    - [ ] `input_schema`:
          ```jsonc
          {
            type: "object",
            properties: {
              cell:     { type: "integer", minimum: 0, description: "Cell index in pack.cells (0-based)." },
              religion: { type: "integer", minimum: 0, description: "Religion id (0 = No religion)." },
            },
            required: ["cell", "religion"],
          }
          ```
    - [ ] `execute(rawInput)`:
      - [ ] Coerce input as `{ cell?: unknown; religion?: unknown }`.
      - [ ] Validate `cell` via helper → on string return errorResult.
      - [ ] Validate `religion` via helper → on string return
            errorResult.
      - [ ] Call `runtime.getCellReligions()`; null →
            `errorResult("window.pack.cells.religion is not available; the map hasn't finished loading.")`.
      - [ ] Call `runtime.getReligions()`; null →
            `errorResult("window.pack.religions is not available; the map hasn't finished loading.")`.
      - [ ] If `cell >= cellReligions.length` → errorResult
            `\`cell ${cell} is out of range (max ${cellReligions.length - 1}).\``.
      - [ ] If `religion >= religions.length` → errorResult
            `\`religion ${religion} is not a valid religion id (max ${religions.length - 1}).\``.
      - [ ] Lookup `religionEntry = religions[religion]`. If
            `!religionEntry` OR `religionEntry.removed === true` →
            errorResult `\`Religion ${religion} has been removed.\``.
      - [ ] Capture `previous = cellReligions[cell]` (number).
      - [ ] Lookup `previous_religion_name = religions[previous]?.name ?? ""`
            (defensive guard for out-of-range previous values).
      - [ ] Lookup `religion_name = religionEntry.name ?? ""`.
      - [ ] Try `runtime.setCellReligion(cell, religion)`. Catch and
            convert to `errorResult(err.message)`.
      - [ ] Try `runtime.drawReligions()`. Catch and ignore — best-
            effort only.
      - [ ] Return:
            ```ts
            okResult({
              cell,
              previous_religion: previous,
              previous_religion_name,
              religion,
              religion_name,
            });
            ```
  - [ ] Export `setCellReligionTool = createSetCellReligionTool()`.

- [ ] Create `src/ai/tools/set-cell-religion.test.ts`:
  - [ ] Imports: `afterEach, beforeEach, describe, expect, it, vi`
        from "vitest"; the tool factory plus default runtime and
        registry from sibling modules. Import `RawReligion` from
        `./_shared` for typing fixtures.
  - [ ] `DEFAULT_RELIGIONS` fixture array of `RawReligion` (length ~6:
        index 0 = "No religion" placeholder, then 5 named religions
        like "Wave Worshippers", "Forest Druids", "Sun Cult",
        "Stone Path", "Iron Brotherhood").
  - [ ] `makeRuntime(opts?)` helper that returns `{ runtime,
        cellReligions, religions, setCellReligion, drawReligions,
        getCellReligions, getReligions }` with sensible defaults
        (a 5-element typed array `[0,1,2,3,4]`, the
        `DEFAULT_RELIGIONS` array). Allow each callback to be
        overridden, including `getCellReligions: () => null` etc.
  - [ ] **Stub-runtime suite (tests 1–27):**
    - [ ] Test 1: happy path — cell index 7 with prev religion=2,
          religion=5; assert success body
          `{ ok: true, cell: 7, previous_religion: 2,
             previous_religion_name: "Forest Druids", religion: 5,
             religion_name: "Iron Brotherhood" }`. Adjust expected
          names to match the fixture.
    - [ ] Test 2: religion=0 (No religion) accepted — cell prev=3 →
          religion=0; success; setCellReligion called with
          `(cell, 0)`; previous_religion=3, religion=0,
          religion_name = the placeholder name.
    - [ ] Test 3: same-religion no-op — cell prev=2 → religion=2;
          success; previous_religion=religion=2; setCellReligion still
          called with `(cell, 2)`.
    - [ ] Test 4: previous_religion captured BEFORE mutation — pass a
          stub `setCellReligion` that mutates the underlying typed
          array in place; assert returned `previous_religion` is the
          pre-write value AND the post-call array shows the new value.
    - [ ] Test 5: religion_name lookup uses pack.religions — pass
          custom `getReligions` returning a 6-religion array with
          distinct names; cell prev=1 religion=4 → expected names
          match the fixture entries.
    - [ ] Test 6: previous_religion_name defensive "" — religions
          length=3, but cellReligions[0]=99 (stale). Call with
          cell=0 religion=1 → success; previous_religion=99,
          previous_religion_name="".
    - [ ] Test 7: drawReligions called when present — `vi.fn`
          drawReligions; assert called once.
    - [ ] Test 8: drawReligions missing → no error — runtime's
          drawReligions is `() => undefined`; tool succeeds.
    - [ ] Test 9: drawReligions throws → no error — `vi.fn(() => {
          throw new Error("boom") })`; tool succeeds; data already
          written.
    - [ ] Test 10: rejects missing cell — `[undefined, null]` for
          cell → error `/cell must be a non-negative integer/i`;
          setCellReligion not called.
    - [ ] Test 11: rejects missing religion — same with religion.
    - [ ] Test 12: rejects non-numeric cell — `["1", true, {}, NaN,
          +Infinity, -Infinity]` → error.
    - [ ] Test 13: rejects non-integer cell — `[1.5, 2.1, 3.9999]`
          → error `/non-negative integer/`.
    - [ ] Test 14: rejects negative cell — `[-1, -100]` → error.
    - [ ] Test 15: rejects non-numeric religion — `["1", true, {},
          NaN, +Infinity]` → error.
    - [ ] Test 16: rejects non-integer religion — `[1.5]` → error.
    - [ ] Test 17: rejects negative religion — `[-1]` → error.
    - [ ] Test 18: cell out of range — cellReligions length=5;
          cell=5 → error `"cell 5 is out of range (max 4)."`. Also
          cell=10 → similar.
    - [ ] Test 19: religion out of range — religions length=4;
          religion=4 → error `"religion 4 is not a valid religion id (max 3)."`.
          Also religion=99 → similar.
    - [ ] Test 20: removed religion rejected —
          `religions[2].removed = true`; religion=2 → error
          `"Religion 2 has been removed."`. setCellReligion not called.
    - [ ] Test 21: empty/null religion slot rejected —
          `religions[2] = null` (cast as needed); religion=2 → error
          `"Religion 2 has been removed."` (defensive). setCellReligion
          not called.
    - [ ] Test 22: missing pack.cells.religion — `getCellReligions`
          returns null → error
          `"window.pack.cells.religion is not available; the map hasn't finished loading."`.
    - [ ] Test 23: missing pack.religions — `getReligions` returns
          null → error
          `"window.pack.religions is not available; the map hasn't finished loading."`.
    - [ ] Test 24: typed-array mutation in-place — runtime's
          `getCellReligions` returns a `Uint16Array` it captured;
          `setCellReligion` impl writes via `arr[cell] = religion` into
          THAT array; after the call, assert the same array reference
          and that `arr[cell] === religion`.
    - [ ] Test 25: runtime errors propagate — `setCellReligion` throws
          `new Error("custom write failure")` → error result with the
          message.
    - [ ] Test 26: registry round-trip — fresh `ToolRegistry`,
          register tool produced by `createSetCellReligionTool` with
          a controlled stub runtime; dispatch via `registry.run`;
          assert success and that the stub was called.
    - [ ] Test 27: tool shape sanity —
          `name === "set_cell_religion"`,
          `input_schema.required === ["cell", "religion"]`.
  - [ ] **Default-runtime integration suite (tests 28–37):**
    - [ ] `globalsRef` typed cast for globalThis with `pack`,
          `drawReligions` keys; capture / restore in `beforeEach` /
          `afterEach`.
    - [ ] In `beforeEach`: install `globalThis.pack = { cells:
          { religion: new Uint16Array([0,1,2,3,4]) }, religions:
          [...DEFAULT_RELIGIONS] }`. Clear drawReligions.
    - [ ] Test 28: default runtime mutates globalThis.pack.cells.religion
          in place — capture the typed-array reference; invoke tool
          with `cell: 2, religion: 4`. Assert
          `pack.cells.religion[2] === 4` and that the captured
          reference is still `===` `pack.cells.religion`.
    - [ ] Test 29: default runtime captures previous_religion BEFORE
          mutation — same fixture, set `cell: 2, religion: 4` → result
          body has `previous_religion: 2`, `religion: 4`.
    - [ ] Test 30: default runtime same-religion no-op — set
          `cell: 2, religion: 2` (current value) → result has
          previous_religion=2, religion=2; succeeds.
    - [ ] Test 31: default runtime religion=0 accepted — set
          `cell: 2, religion: 0` → success;
          `pack.cells.religion[2] === 0`; `religion_name` is the No-
          religion placeholder name.
    - [ ] Test 32: default runtime missing pack.cells.religion —
          set `globalThis.pack = { religions: [...DEFAULT_RELIGIONS] }`
          → error `/pack.cells.religion is not available/`. Also
          install drawReligions spy and assert NOT called.
    - [ ] Test 33: default runtime missing pack.religions —
          set `globalThis.pack = { cells: { religion: new Uint16Array([0,1,2]) } }`
          → error `/pack.religions is not available/`.
    - [ ] Test 34: default runtime removed religion rejected —
          mutate `pack.religions[2].removed = true`; tool with
          `religion: 2` → error `"Religion 2 has been removed."`.
          `pack.cells.religion` unchanged.
    - [ ] Test 35: default runtime drawReligions called when present —
          install `globalThis.drawReligions = vi.fn()`; invoke;
          assert it was called once.
    - [ ] Test 36: default runtime drawReligions missing — delete
          `globalThis.drawReligions`; tool still succeeds.
    - [ ] Test 37: default runtime drawReligions throws — install
          `globalThis.drawReligions = vi.fn(() => { throw new Error("boom") })`;
          tool still succeeds; data still mutated.
  - [ ] Sanity assertions on `setCellReligionTool.name === "set_cell_religion"`
        and `input_schema.required === ["cell", "religion"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { setCellReligionTool } from "./tools/set-cell-religion";`
        immediately AFTER the `setCellHeightTool` import line and
        BEFORE the `setCellsDensityTool` import (alphabetical:
        set-cell-height < set-cell-religion < set-cells-density).
  - [ ] Add re-export block immediately AFTER the `set-cell-height`
        re-export and BEFORE the `set-cells-density` re-export:
        ```ts
        export {
          createSetCellReligionTool,
          setCellReligionTool,
        } from "./tools/set-cell-religion";
        ```
  - [ ] Add `registry.register(setCellReligionTool);` immediately
        AFTER `registry.register(setCellHeightTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage:
  - `src/ai/tools/set-cell-religion.ts`
  - `src/ai/tools/set-cell-religion.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_361.md`
  - `aiplans/tasks_361.md`
- [ ] Commit on branch `plan-361-set-cell-religion` with the
      spec-required message:
  ```
  feat(ai): add set_cell_religion tool

  Implements plan 361. Adds an AI chat tool that overrides
  pack.cells.religion[i] for a single cell, mirroring the per-cell write
  in the religions editor's manual assignment mode. Atomic — does not
  trigger recalculate_religions.
  ```
  Use a HEREDOC. Do NOT push.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`set-cell-religion.ts`, `set-cell-religion.test.ts`).
- [ ] Stub-runtime tests: 27 (1–27). Integration: 10 (28–37).
      Total: 37 tests.
- [ ] Typed-array IN-PLACE write tested — test 24 (stub) +
      test 28 (default runtime).
- [ ] previous_religion captured BEFORE mutation — test 4 (stub) +
      test 29 (default).
- [ ] religion_name lookup against pack.religions — test 5 (stub),
      indirectly tests 28/29 use real religions array.
- [ ] previous_religion_name defensive "" fallback — test 6.
- [ ] Same-religion no-op — test 3 (stub) + test 30 (default).
- [ ] religion=0 (No religion) accepted — test 2 (stub) + test 31
      (default).
- [ ] Removed religion rejected — test 20 (stub) + test 34 (default).
- [ ] Empty slot rejected — test 21 (stub).
- [ ] drawReligions best-effort — tests 7/8/9 (stub) + 35/36/37
      (default).
- [ ] Errors-verbatim list matches plan and tests.
- [ ] Index registration alphabetically slotted between
      `setCellHeightTool` and `setCellsDensityTool`.
- [ ] No `recalculate_religions` invocation — keep tool atomic.
- [ ] No `drawReligionCenters` invocation — centers data is unchanged
      by per-cell religion write.
