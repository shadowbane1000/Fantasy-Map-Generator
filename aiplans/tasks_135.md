# Tasks — Plan 135 (`set_burg_coa_custom`)

1. **Field confirmation**: `RawCoa.custom?: unknown` already exists in
   `src/ai/tools/_shared/pack-types.ts` (line 15). No change needed.
   The field semantics confirmed via
   `public/modules/ui/emblems-editor.js:288-292` (set on upload) and
   `src/modules/emblem/renderer.ts:345` / `set-culture-shield.ts`
   (truthy check means "don't touch").

2. **Write** `src/ai/tools/set-burg-coa-custom.ts`:
   - Export `SetBurgCoaCustomRef` `{ i, name, hasCoa, previousCustom }`.
   - Export `SetBurgCoaCustomRuntime` with `find / apply`.
   - Export `defaultSetBurgCoaCustomRuntime`:
     - `find(ref)` uses `findEntityByRef(getPackCollection<RawBurg>("burgs"), ref)`.
       Returns `null` for missing, `i <= 0`, `removed`, or `lock`.
       Reports `hasCoa = !!entry.coa`,
       `previousCustom = !!entry.coa?.custom`.
     - `apply(i, true)` — `burg.coa.custom = true` (throws if burg or
       `burg.coa` missing).
     - `apply(i, false)` — `delete burg.coa.custom`.
   - Export `createSetBurgCoaCustomTool` +
     `setBurgCoaCustomTool`.
   - Tool description: cites the Emblem Editor upload flow (line 288)
     and what `coa.custom` means (skipped by regenerate_emblems /
     regenerate_burg_coa parent resolution / set_culture_shield).
     Mentions that an existing `burg.coa` is required.

3. **Write** `src/ai/tools/set-burg-coa-custom.test.ts` — 11 unit
   tests (injected runtime) + 7 integration tests using
   `defaultSetBurgCoaCustomRuntime` via
   `setBurgCoaCustomTool.execute()`. Use `as unknown as { ... }` for
   all `globalThis` casts.

4. **Register** in `src/ai/index.ts`:
   - Import `setBurgCoaCustomTool`.
   - Export `{ createSetBurgCoaCustomTool, setBurgCoaCustomTool }`.
   - `registry.register(setBurgCoaCustomTool);` near the other
     COA-related tools (after `regenerateProvinceCoaTool` / before
     `regenerateDomainTool` feels natural, or grouped with the
     `regenerate_*_coa` tools around line 880-883).

5. **Add README_AI.md row** near `regenerate_burg_coa` (row 22).
   Short column, keep in sync with surrounding descriptions (cite the
   Emblem Editor upload behavior and the regenerate-skip semantics).

6. **Verify** (in this worktree):
   - `npm run build` — must succeed.
   - `npm test` — must pass 1691 + new tests.
   - `npm run lint 2>&1 | tail -5` — must match baseline
     (7 warnings / 1 info / 0 errors). If root lint errors from
     sibling worktrees leak in, scope to `npx biome check src/`.

7. **Commit** with
   `feat(ai): add set_burg_coa_custom tool`
   plus a 1-2 line body. Stage only the specific files touched.
