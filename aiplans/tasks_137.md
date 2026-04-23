# Tasks — Plan 137 (`set_province_coa_custom`)

1. **Field confirmation**: `RawCoa.custom?: unknown` already exists in
   `src/ai/tools/_shared/pack-types.ts` (line 15). `RawProvince.coa?:
   RawCoa` at line 120. No schema changes needed. Semantics match
   `set_burg_coa_custom` / `regenerate_province_coa` (parent
   resolution skips `coa.custom`).

2. **Write** `src/ai/tools/set-province-coa-custom.ts`:
   - Export `SetProvinceCoaCustomRef` `{ i, name, hasCoa, previousCustom }`.
   - Export `SetProvinceCoaCustomRuntime` with `find / apply`.
   - Export `defaultSetProvinceCoaCustomRuntime`:
     - `find(ref)` uses
       `findEntityByRef(getPackCollection<RawProvince>("provinces"), ref)`.
       Returns `null` for missing, `i <= 0`, `removed`, or `lock`.
       Reports `hasCoa = !!entry.coa`,
       `previousCustom = !!entry.coa?.custom`.
     - `apply(i, true)` — `province.coa.custom = true` (throws if
       province or `province.coa` missing).
     - `apply(i, false)` — `delete province.coa.custom`.
   - Export `createSetProvinceCoaCustomTool` +
     `setProvinceCoaCustomTool`.
   - Tool description: cites the Emblem Editor upload flow and what
     `coa.custom` means (skipped by `regenerate_emblems` /
     `regenerate_province_coa` parent resolution). Mentions that an
     existing `province.coa` is required.

3. **Write** `src/ai/tools/set-province-coa-custom.test.ts` — 11 unit
   tests (injected runtime) + 8 integration tests using
   `defaultSetProvinceCoaCustomRuntime` via
   `setProvinceCoaCustomTool.execute()`. Use `as unknown as { ... }`
   for all `globalThis` casts.

4. **Register** in `src/ai/index.ts`:
   - Import `setProvinceCoaCustomTool`.
   - Export `{ createSetProvinceCoaCustomTool, setProvinceCoaCustomTool }`
     near the other `set-*` tool exports.
   - `registry.register(setProvinceCoaCustomTool);` immediately after
     `setBurgCoaCustomTool` to group the `*_coa_custom` tools.

5. **Add README_AI.md row** near `set_burg_coa_custom` (row 23).
   Short column, keep in sync with surrounding descriptions (cite the
   Emblem Editor upload behavior and the regenerate-skip semantics).

6. **Verify** (in this worktree):
   - `npm run build` — must succeed.
   - `npm test` — must pass 1725 + 19 new tests (1744 total).
   - `npm run lint 2>&1 | tail -5` — must match baseline
     (7 warnings / 1 info / 0 errors).

7. **Commit** with
   `feat(ai): add set_province_coa_custom tool`
   plus a 1-2 line body. Stage only the specific files touched.
