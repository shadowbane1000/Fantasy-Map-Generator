# Tasks 85 — set_religion_expansion AI tool

- [ ] Create `src/ai/tools/set-religion-expansion.ts`:
  - Exports:
    - `RELIGION_EXPANSIONS = ["global","state","culture"]
       as const`.
    - `ReligionExpansion` = element type.
    - `resolveReligionExpansion(value)`.
    - `ReligionExpansionRef { i, name, previousExpansion }`.
    - `ReligionExpansionRuntime { find, apply }`.
    - `defaultReligionExpansionRuntime`:
      - find: findEntityByRef (skips removed + id 0).
      - apply: writes `religion.expansion = value`;
        `getGlobal<() => void>("recalculateReligions")`,
        invoke best-effort (try/catch swallowed).
    - `createSetReligionExpansionTool(runtime?)` and
      `setReligionExpansionTool`.
  - Tool name: `set_religion_expansion`.
  - Description: mentions Religions Editor Extent
    dropdown, writes expansion + recalc, idempotent.
  - Schema: `religion` (int|string, required), `expansion`
    (string enum `[...RELIGION_EXPANSIONS]`, required).
  - Validation:
    - parseEntityRef.
    - resolveReligionExpansion → error w/ `supported`.
    - find returns null → "No religion found..."
  - Noop: previousExpansion === canonical.

- [ ] Register in `src/ai/index.ts`:
  - Import near other religion tools.
  - Barrel re-export.
  - `registry.register(setReligionExpansionTool)` near
    other `setReligion*Tool`.

- [ ] Write `src/ai/tools/set-religion-expansion.test.ts`:
  - `resolveReligionExpansion`:
    - canonicalizes "Global", "STATE", "culture".
    - returns null for "universal", non-string, empty.
  - `set_religion_expansion tool` (stubbed runtime):
    - sets by numeric id
    - sets by case-insensitive name
    - canonicalizes "GLOBAL" → "global"
    - rejects unknown expansion
    - rejects unknown religion
    - rejects invalid refs
    - noop when already matching
    - surfaces runtime errors
  - `defaultReligionExpansionRuntime (integration)`:
    - stubs `globalThis.pack = { religions: [...] }`
      with:
        { i: 0, name: "No religion" },
        { i: 1, name: "Solarism", expansion: "global" },
        { i: 2, name: "Lunarism", expansion: "global" },
        { i: 3, name: "Removed", removed: true },
    - stubs `globalThis.recalculateReligions = vi.fn()`.
    - writes "state" on religion 2, asserts
      pack.religions[2].expansion === "state" and recalc
      called once.
    - rejects religion 0 (placeholder).
    - rejects religion 3 (removed).
    - succeeds when recalculateReligions missing
      (delete from globalThis, still writes value).

- [ ] Update `README_AI.md`: add row near `set_religion_form`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_religion_expansion tool`.

## Verification: tasks → plan

- Match the runtime seam with the UI (write + recalc).
- Enum strictly matches the UI dropdown (global/state/
  culture).
- Integration covers the three success/failure paths
  called out in the plan.

## Verification: plan → use case

- UI: `religion.expansion = value; recalculateReligions()`.
- Tool: same two steps with best-effort recalc.
- Both accept only the three values in the dropdown.

## Verification: tests → regressions

- If apply forgot to write the expansion, integration
  fails.
- If recalculateReligions isn't called, integration
  fails.
- If runtime tried to call a missing recalculateReligions
  and crashed, the "recalc missing" integration test
  fails.
- If religion 0 or removed religions slipped through,
  the rejection tests fail.
- If expansion canonicalization regressed, the
  canonicalizes test fails.
