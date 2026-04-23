# Tasks 151 — `set_religion_origins`

## Pre-flight

- [x] Confirm worktree, merge master --ff-only
- [x] Study `public/modules/dynamic/editors/religions-editor.js` — origins
      cascade on remove, CSV export reads origins
- [x] Study `public/modules/dynamic/hierarchy-tree.js` — origin picker
      semantics: `origins[0]` primary (0 = Top level), `origins[1..]`
      secondary, full-array write on commit
- [x] Study `src/ai/tools/set-religion-color.ts` + test — entity-ref pattern
- [x] Study `src/ai/tools/set-religion-culture.ts` + test — recent religion tool
- [x] Study `src/ai/tools/set-religion-center.ts` + test — locked guard + cell bounds pattern
- [x] Study `src/ai/tools/remove-religion.ts` — cascaded origins cleanup on remove
- [x] Study `src/ai/tools/_shared/pack-types.ts` — `RawReligion.origins` shape
- [x] Study `src/ai/tools/_shared/index.ts` — available helpers
- [x] Confirm baseline: 7 warnings / 1 info / 0 errors and 1960 tests

## Implementation

- [ ] `src/ai/tools/set-religion-origins.ts`
  - [ ] `ReligionOriginsRef` = `{ i, name, previousOrigins, locked }`
  - [ ] `ReligionRef` = `{ i, name, removed }`
  - [ ] `ReligionOriginsRuntime` with `find`, `findCandidate`, `getReligionCount`, `apply`
  - [ ] `defaultReligionOriginsRuntime`:
    - [ ] `find` via `findEntityByRef` on `pack.religions`; returns shallow-copy
          `previousOrigins` (normalised to `[0]` if unset / not array)
    - [ ] `findCandidate(i)` returns the slot if it exists and isn't removed
    - [ ] `getReligionCount()` returns `pack.religions?.length ?? 0`
    - [ ] `apply(i, origins)` writes `religion.origins = [...origins]` (guards
          removed / missing)
  - [ ] `cleanOrigins(input)` helper that dedupes preserving order
  - [ ] `createSetReligionOriginsTool(runtime)` factory
    - [ ] schema: `religion` (int|string), `origins` (array of integers)
    - [ ] description calls out: (a) full-array replace semantics, (b) UI
          equivalent = hierarchy-tree origin picker, (c) `origins[0]` is
          primary (0 = Top level), (d) self-ref/removed/out-of-range/
          non-first-zero all rejected, (e) empty array → `[0]`
    - [ ] `execute`: validate → find → verify each origin → apply → okResult
          `{ ok, i, name, previousOrigins, origins }`
  - [ ] Reject religion 0, removed, locked
  - [ ] Export `setReligionOriginsTool` default instance

- [ ] `src/ai/tools/set-religion-origins.test.ts`
  - [ ] Seam tests (mock runtime):
    - [ ] applies a new origins array by religion id
    - [ ] resolves case-insensitive religion name
    - [ ] empty array normalises to `[0]`
    - [ ] duplicates collapsed (preserving first-occurrence order)
    - [ ] rejects religion 0 (No Religion placeholder)
    - [ ] rejects locked religions
    - [ ] rejects self-reference
    - [ ] rejects out-of-range origin indices
    - [ ] rejects non-integer / negative origins
    - [ ] rejects removed origin candidates
    - [ ] rejects `0` anywhere except the primary slot
    - [ ] rejects non-array / missing `origins`
    - [ ] rejects invalid religion refs
    - [ ] surfaces runtime `apply` failures
  - [ ] Integration block (`defaultReligionOriginsRuntime`):
    - [ ] `beforeEach` installs `globalThis.pack` with religions (active,
          locked, removed) and restores in `afterEach`
    - [ ] writes `religion.origins` in the live pack
    - [ ] refuses locked religions (does NOT mutate)
    - [ ] refuses a removed religion id inside origins
    - [ ] refuses self-reference
    - [ ] refuses out-of-range indices
    - [ ] empty array accepted and normalised to `[0]`
    - [ ] duplicates collapsed
  - [ ] Use `as unknown as { ... }` casts for globalThis reassignment

- [ ] `src/ai/index.ts`
  - [ ] Import `setReligionOriginsTool`
  - [ ] Re-export `{ createSetReligionOriginsTool, setReligionOriginsTool }` block
  - [ ] Register in `buildDefaultRegistry` next to `setReligionCultureTool`

- [ ] `README_AI.md`
  - [ ] Add row after `set_religion_center`
  - [ ] Cite `pack.religions[i].origins` path, primary/secondary slots,
        full-array replace semantics, empty → `[0]`, rejects self / removed /
        out-of-range / non-first zero, rejects "No religion" / removed /
        locked. Mention API key requirement.

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (test count increases by the new file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add set_religion_origins tool` + 1-2 line body
- [ ] Stage specific files (no `git add .`)
