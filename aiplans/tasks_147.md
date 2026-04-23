# Tasks 147 — `regenerate_all_culture_names`

## Pre-flight

- [x] Confirm worktree, merge master --ff-only
- [x] Study `src/modules/cultures-generator.ts` — confirm initial naming uses `Names.getBaseShort(rnd)` for random set
- [x] Study `public/modules/dynamic/editors/cultures-editor.js:347` — confirm `cultureRegenerateName` calls `Names.getCultureShort(cultureId)` + writes `pack.cultures[i].name`
- [x] Study `src/ai/tools/rename-culture.ts` + test — single-culture rename (regenerates code via `abbreviate`; bulk will NOT regen code to match editor's per-culture button)
- [x] Study `src/ai/tools/regenerate-all-state-names.ts` + test — bulk pattern
- [x] Confirm baseline: 7 warnings / 1 info / 0 errors

## Implementation

- [ ] `src/ai/tools/regenerate-all-culture-names.ts`
  - [ ] `CULTURE_NAME_MODES` const + `CultureNameMode` type + `resolveCultureNameMode` helper (mirrors state/burg resolvers)
  - [ ] `RegenerateAllCultureNamesCultureRef` type
  - [ ] `RegenerateAllCultureNamesRuntime` interface (`list` / `generate` / `apply` / `redraw`)
  - [ ] `defaultRegenerateAllCultureNamesRuntime` implementation
    - [ ] `list()` reads `pack.cultures`, returns refs with `(i, name, base, lock, removed)`
    - [ ] `generate(mode, ref)`:
      - culture mode: `Names.getCultureShort(ref.i)`
      - random mode: random index into `nameBases` → `Names.getBaseShort(idx)`
    - [ ] `apply(i, name)` writes `pack.cultures[i].name`
    - [ ] `redraw()` calls `drawCultures?.()`
  - [ ] `createRegenerateAllCultureNamesTool(runtime)` factory
    - [ ] tool `name`, `description`, `input_schema` (optional `mode`)
    - [ ] `execute`: resolve mode, list → loop per culture, skip i<=0 / removed / locked / missing base, generate → apply, collect `renamed` / `skipped`, redraw best-effort, return `okResult`
  - [ ] Exported `regenerateAllCultureNamesTool` default instance

- [ ] `src/ai/tools/regenerate-all-culture-names.test.ts`
  - [ ] Seam tests (mock runtime): default skip / explicit random canonicalization / unknown mode errors / generator-error / empty-output / apply-error / list-throws / redraw-throws / missing-base skip
  - [ ] Integration block (defaultRuntime): installs `globalThis.pack` / `globalThis.Names` / `globalThis.nameBases` / `globalThis.drawCultures` with beforeEach / afterEach
    - [ ] wildlands / locked / removed are skipped
    - [ ] culture mode: actives renamed; `getCultureShort` called with culture id
    - [ ] random mode: actives renamed; `getBaseShort` called with numeric base index
    - [ ] `drawCultures` called once
    - [ ] Missing `Names` → all skipped with "generate failed" reason (no throw)
    - [ ] Missing `nameBases` in random mode → skipped with "generate failed" reason
    - [ ] `redraw` failure swallowed

- [ ] `src/ai/index.ts`
  - [ ] Import `regenerateAllCultureNamesTool` + `createRegenerateAllCultureNamesTool`
  - [ ] Re-export (include `CULTURE_NAME_MODES` + `resolveCultureNameMode`)
  - [ ] Register in `buildDefaultRegistry` (group with other bulk regen tools)

- [ ] `README_AI.md`
  - [ ] Add row documenting the tool, next to the other `regenerate_*_names` rows
  - [ ] Cite the underlying algorithm (`Names.getCultureShort(i)` / `Names.getBaseShort(base)`)

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (test count bumps by the new file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add regenerate_all_culture_names tool` + 1–2 line body
- [ ] Stage specific files (no `git add .`)
