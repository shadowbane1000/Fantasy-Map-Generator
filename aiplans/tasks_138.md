# Tasks — Plan 138 (`set_province_form`)

1. **Field confirmation**: `RawProvince.formName?: string` already
   exists in `src/ai/tools/_shared/pack-types.ts:114` and
   `RawProvince.fullName?: string` at line 113. No `form` key on
   provinces — provinces only have `formName` (free-form). No schema
   changes needed. `composeProvinceFullName(short, form)` is already
   exported from `src/ai/tools/regenerate-province-name.ts:33-37` and
   can be reused so fullName recomposition stays in one place.

2. **Write** `src/ai/tools/set-province-form.ts`:
   - Import `composeProvinceFullName` from `./regenerate-province-name`.
   - Export `SetProvinceFormRef`
     `{ i, name, previousForm, previousFullName }`.
   - Export `SetProvinceFormRuntime` with `find / apply`.
   - Export `defaultSetProvinceFormRuntime`:
     - `find(ref)` uses
       `findEntityByRef(getPackCollection<RawProvince>("provinces"), ref)`.
       Returns `null` for missing, `i <= 0`, `removed`, or `lock`.
       Reports `name = entry.name ?? ""`,
       `previousForm = entry.formName ?? null`,
       `previousFullName = entry.fullName ?? null`.
     - `apply(i, formName, fullName)` — writes
       `province.formName = formName`, `province.fullName = fullName`.
       Best-effort DOM refresh via
       `document.getElementById("provinceLabel" + i)` (parallels
       `rename-province.ts:66-68`).
     - Throws if `province` is missing (defensive).
   - Export `createSetProvinceFormTool` + `setProvinceFormTool`.
   - In `execute`:
     - `parseEntityRef(input.province, "province")`.
     - Validate `input.form` is a non-empty (after trim) string.
     - `runtime.find(ref)` — error if null.
     - `trimmedForm = input.form.trim()`.
     - `newFullName = composeProvinceFullName(current.name, trimmedForm)`.
     - `runtime.apply(current.i, trimmedForm, newFullName)` — wrap in
       try/catch, return `errorResult` on throw.
     - Return `okResult({ i, previousForm, form, previousFullName, fullName })`.
   - Tool description: cites the Provinces Editor form dropdown
     (`#provinceNameEditorSelectForm`), mentions free-form (no enum),
     that `formName` + `fullName` are both written, and that the
     `#provinceLabel{i}` SVG is best-effort refreshed. Parallels
     `set_state_form` but points out provinces have no category.

3. **Write** `src/ai/tools/set-province-form.test.ts` — 10 unit tests
   (injected runtime) + 6 integration tests using
   `defaultSetProvinceFormRuntime` via `setProvinceFormTool.execute()`.
   Use `as unknown as { ... }` for all `globalThis` casts. Follow the
   `set-province-coa-custom.test.ts` / `regenerate-province-name.test.ts`
   integration-block layout (beforeEach/afterEach restore globals,
   mock `document.getElementById`).

4. **Register** in `src/ai/index.ts`:
   - Import `setProvinceFormTool` (alphabetical with other province tools).
   - Export `{ createSetProvinceFormTool, setProvinceFormTool }` near
     the other `set-province-*` tool exports.
   - `registry.register(setProvinceFormTool);` grouped near
     `setStateFormTool` / other province setters.

5. **Add README_AI.md row** near `set_state_form` (currently row 132)
   or near `rename_province` (row 101). Cite the Provinces Editor
   form dropdown, free-form semantics, writes both `formName` +
   recomputed `fullName`, best-effort label refresh.

6. **Verify** (in this worktree):
   - `npm run build` — must succeed.
   - `npm test` — must pass 1764 + 16 new tests (1780 total).
   - `npm run lint 2>&1 | tail -5` — must match baseline
     (7 warnings / 1 info / 0 errors).

7. **Commit** with
   `feat(ai): add set_province_form tool`
   plus a 1-2 line body. Stage only the specific files touched
   (plan + tasks + src/ai + README_AI).
