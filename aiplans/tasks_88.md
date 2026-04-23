# Tasks 88 — remove_province AI tool

- [ ] Create `src/ai/tools/remove-province.ts`:
  - Imports from `./_shared`: errorResult, findEntityByRef,
    getGlobal, getPack, okResult, parseEntityRef,
    type RawProvince, type RawState.
  - Define local `PackWithProvinceCells`:
    ```
    interface PackWithProvinceCells {
      cells?: { province?: number[] };
      provinces?: RawProvince[];
      states?: RawState[];
    }
    ```
  - Exports:
    - `RemoveProvinceRef { i, name, fullName, stateId }`.
    - `RemoveProvinceRuntime { find, remove }`.
    - `defaultRemoveProvinceRuntime`:
      - find: findEntityByRef on `pack.provinces`.
        Hydrate fullName and stateId.
      - remove(ref):
        - Get pack via getPack<PackWithProvinceCells>.
        - throw if pack missing.
        - pack.cells.province (Array only): replace
          entries === ref.i with 0.
        - pack.states[ref.stateId]: if present and has
          provinces[] array, splice ref.i if found.
        - pack.provinces[ref.i] = { i: ref.i, removed: true }.
        - getGlobal<(key:string)=>void>("unfog")?.(`focusProvince${ref.i}`)
          wrapped in try/catch.
        - If typeof document !== "undefined":
          - getElementById("provinceCOA" + i)?.remove()
          - querySelector("#provinceEmblems use[data-i='"+i+"']")?.remove()
          - getElementById("provincesBody")?.querySelector("#province" + i)?.remove()
          - getElementById("provincesBody")?.querySelector("#province-gap" + i)?.remove()
        - getGlobal<() => void>("drawBorders")?.() wrapped
          in try/catch.
    - `createRemoveProvinceTool(runtime?)` and
      `removeProvinceTool`.
  - Tool name: `remove_province`.
  - Description: references the Provinces Editor trash
    icon, lists the mutations (cells/states/provinces +
    DOM + drawBorders), notes tombstone pattern.
  - Schema: `province` (int|string required).
  - Validation:
    - parseEntityRef(province).
    - find returns null → "No province found..."
  - Return payload: `{ i, name, fullName, state }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `remove-*` tools.
  - Barrel re-export.
  - `registry.register(removeProvinceTool)` near other
    `removeXxxTool` lines.

- [ ] Write `src/ai/tools/remove-province.test.ts`:
  - Unit (stubbed runtime):
    - removes by numeric id (verifies remove(ref) called
      with the ref).
    - resolves by case-insensitive name.
    - rejects invalid refs.
    - rejects unknown province (find returns null).
    - surfaces runtime errors.
  - `defaultRemoveProvinceRuntime (integration)`:
    - stubs `globalThis.pack` with:
      - cells.province: [0, 1, 2, 1, 2, 0]
      - provinces: [{i:0}, {i:1,name:"North",fullName:"North Mark",state:1},
         {i:2,name:"South",fullName:"South Mark",state:1},
         {i:3,removed:true}]
      - states: [{i:0},{i:1,name:"Altaria",provinces:[1,2]}]
    - stubs `globalThis.unfog = vi.fn()` and
      `globalThis.drawBorders = vi.fn()`.
    - stubs document: a minimal DOM where
      `#provinceCOA1`, `#provinceEmblems`,
      `#provincesBody #province1`,
      `#provincesBody #province-gap1` are present.
    - Calls `removeProvinceTool.execute({ province: 1 })`.
    - Asserts:
      - pack.cells.province at indices 1,3 becomes 0
        (replaces entries === 1).
      - pack.states[1].provinces no longer contains 1.
      - pack.provinces[1] = { i: 1, removed: true }.
      - unfog called with "focusProvince1".
      - drawBorders called once.
    - Additional test: rejects an already-removed
      province (id 3).
    - Additional test: rejects id 0.

- [ ] Update `README_AI.md` — row near `remove_burg`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add remove_province tool`.

## Verification: tasks → plan

- File + registration match the plan.
- `defaultRemoveProvinceRuntime.remove` does all 9 steps
  listed in the plan (or their testable subset — unfog
  / drawBorders / DOM are best-effort).
- Tombstone pattern matches UI (pack.provinces[i] =
  { i, removed: true }).

## Verification: plan → use case

- UI does 9 things; tool does:
  - cells.province zeroing ✓
  - states[*].provinces splice ✓
  - pack.provinces[i] tombstone ✓
  - unfog ✓
  - SVG element removals ✓
  - drawBorders ✓
  - (editor panel refresh: N/A — the AI doesn't open
    editor panels)
  - (confirmation dialog: N/A — the AI shouldn't be
    prompting itself; callers of the tool decide whether
    to confirm before calling)

## Verification: tests → regressions

- If cells.province zeroing was skipped, the integration
  test's cell assertion fails.
- If state splice was skipped, the state.provinces
  assertion fails.
- If tombstone wasn't written, the pack.provinces[id]
  assertion fails.
- If unfog wasn't called, the unfog assertion fails.
- If drawBorders wasn't called, the drawBorders
  assertion fails.
- If already-removed provinces slipped through, that
  test fails.
