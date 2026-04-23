# Tasks — Plan 136 (`set_state_coa_custom`)

1. **Field confirmation**: `RawCoa.custom?: unknown` already exists in
   `src/ai/tools/_shared/pack-types.ts` (line 15) and is shared
   across burg / state / province coa shapes. `RawState.coa?: RawCoa`
   is declared on line 41. No change needed.

2. **Write** `src/ai/tools/set-state-coa-custom.ts`:
   - Export `SetStateCoaCustomRef` `{ i, name, hasCoa, previousCustom }`.
   - Export `SetStateCoaCustomRuntime` with `find / apply`.
   - Export `defaultSetStateCoaCustomRuntime`:
     - `find(ref)` uses
       `findEntityByRef(getPackCollection<RawState>("states"), ref)`.
       Returns `null` for missing, `i <= 0`, `removed`, or `lock`.
       Reports `hasCoa = !!entry.coa`,
       `previousCustom = !!entry.coa?.custom`.
     - `apply(i, true)` — `state.coa.custom = true` (throws if state
       or `state.coa` missing).
     - `apply(i, false)` — `delete state.coa.custom`.
   - Export `createSetStateCoaCustomTool` + `setStateCoaCustomTool`.
   - Tool description: cites the Emblem Editor upload flow, what
     `coa.custom` means (skipped by `regenerate_emblems` /
     `regenerate_state_coa`), that an existing `state.coa` is
     required, and that state 0 / removed / locked are refused.

3. **Write** `src/ai/tools/set-state-coa-custom.test.ts` — 12 unit
   tests (injected runtime) + 8 integration tests using
   `defaultSetStateCoaCustomRuntime` via
   `setStateCoaCustomTool.execute()`. Use `as unknown as { ... }` for
   all `globalThis` casts.

4. **Register** in `src/ai/index.ts`:
   - Import `setStateCoaCustomTool`.
   - Export `{ createSetStateCoaCustomTool, setStateCoaCustomTool }`
     (grouped near the other state setters, alphabetically after
     `setStateCapitalTool` block).
   - `registry.register(setStateCoaCustomTool);` near the other COA
     tools (grouped with `setBurgCoaCustomTool` around line 894).

5. **Add README_AI.md row** near `set_burg_coa_custom` (row 23) /
   `regenerate_state_coa` (row 24). Keep the column concise, mirror
   the burg row's wording but for states. Include the standard set of
   refusals (state 0, removed, locked, missing coa).

6. **Verify** (in this worktree):
   - `npm run build` — must succeed.
   - `npm test` — must pass (baseline + new tests).
   - `npm run lint 2>&1 | tail -5` — must match baseline
     (7 warnings / 1 info / 0 errors).

7. **Commit** with
   `feat(ai): add set_state_coa_custom tool`
   plus a 1-2 line body. Stage only the specific files touched.
