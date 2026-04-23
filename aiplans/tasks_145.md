# Tasks 145 — `regenerate_religion_names`

## Pre-flight

- [x] Confirm worktree, merge master --ff-only
- [x] Study `src/modules/religions-generator.ts` — confirm `generateReligionName(type, form, deity, center) → [name, expansion]`
- [x] Study `public/modules/dynamic/editors/religions-editor.js` — no built-in bulk name regen; this tool is an AI-only convenience
- [x] Study `src/ai/tools/rename-religion.ts` + test — entity-ref helper pattern
- [x] Study `src/ai/tools/regenerate-all-state-names.ts` / `regenerate-river-names.ts` — bulk pattern
- [x] Confirm baseline: 7 warnings / 1 info / 0 errors

## Implementation

- [ ] `src/ai/tools/regenerate-religion-names.ts`
  - [ ] `RegenerateReligionNamesReligionRef` type
  - [ ] `RegenerateReligionNamesRuntime` interface (`list` / `generate` / `apply` / `redraw`)
  - [ ] `defaultRegenerateReligionNamesRuntime` implementation
    - [ ] `list()` reads `pack.religions`, returns refs with `(i, name, type, form, deity, center, lock, removed)`
    - [ ] `generate(ref)` calls `Religions.generateReligionName(type, form, deity||"", center)` and returns `result[0]`
    - [ ] `apply(i, name)` writes `pack.religions[i].name`
    - [ ] `redraw()` calls `drawReligions?.()`
  - [ ] `createRegenerateReligionNamesTool(runtime)` factory
    - [ ] tool `name`, `description`, `input_schema` (empty; no params)
    - [ ] `execute`: list → loop per religion, skip i===0 / removed / locked / missing fields, generate → apply, collect `renamed` / `skipped`, redraw best-effort, return `okResult`
  - [ ] Exported `regenerateReligionNamesTool` default instance

- [ ] `src/ai/tools/regenerate-religion-names.test.ts`
  - [ ] Seam tests (mock runtime): default skip / generator-error / empty-output / apply-error / list-throws / redraw-throws
  - [ ] Integration block (defaultRuntime): installs `globalThis.pack` / `globalThis.Religions` / `globalThis.drawReligions` with beforeEach / afterEach
    - [ ] placeholder / locked / removed are skipped
    - [ ] actives renamed; `generateReligionName` called with `(type, form, deity||"", center)`
    - [ ] `drawReligions` called once
    - [ ] Missing `Religions` → all skipped with "generate failed" reason (no throw)
    - [ ] `deity: null` tolerated (passes `""`)
    - [ ] Missing `center` / `type` / `form` skipped with "missing …" reason
    - [ ] `redraw` failure swallowed

- [ ] `src/ai/index.ts`
  - [ ] Import `regenerateReligionNamesTool` + `createRegenerateReligionNamesTool`
  - [ ] Re-export
  - [ ] Register in `buildDefaultRegistry` (group with other bulk regen tools)

- [ ] `README_AI.md`
  - [ ] Add row documenting the tool, next to the other `regenerate_*_names` rows
  - [ ] Cite the underlying algorithm (`Religions.generateReligionName(type, form, deity, center)`) and that it wraps the same method used by the world generator

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (test count bumps by the new file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add regenerate_religion_names tool` + 1–2 line body
- [ ] Stage specific files (no `git add .`)
