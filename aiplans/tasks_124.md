# Tasks 124 — regenerate_all_province_names

- [ ] Capture baselines (lint + test counts).
- [ ] Create `src/ai/tools/regenerate-all-province-names.ts`:
  - [ ] `RegenerateAllProvinceNamesProvinceRef { i, name,
        fullName, center, formName, lock?, removed? }`.
  - [ ] `RegenerateAllProvinceNamesRuntime { list,
        generate, compose, apply }`.
  - [ ] `defaultRegenerateAllProvinceNamesRuntime`:
        reads `pack.provinces` / `pack.cells.culture`,
        uses `Names.getState` + `Names.getCultureShort`
        or `Names.getBase`, best-effort DOM update via
        `#provinceLabel{i}`.
  - [ ] `createRegenerateAllProvinceNamesTool(runtime)` —
        kebab name `regenerate_all_province_names`.
  - [ ] Input schema: optional `mode` (enum).
  - [ ] Skips i=0, `removed`, `lock`.
  - [ ] Generator / apply errors recorded to `skipped`.
  - [ ] Reuses `PROVINCE_NAME_MODES`,
        `resolveProvinceNameMode`, and
        `composeProvinceFullName` from
        `./regenerate-province-name`.
- [ ] Create
      `src/ai/tools/regenerate-all-province-names.test.ts`:
  - [ ] default culture mode, skips i=0 / locked /
        removed.
  - [ ] random mode + case-insensitive.
  - [ ] unknown mode rejected and no mutation.
  - [ ] generator error → skipped; loop continues.
  - [ ] empty generator output skipped.
  - [ ] apply error → skipped; loop continues.
  - [ ] list throws → errorResult.
  - [ ] composes fullName correctly (3 cases).
  - [ ] `defaultRegenerateAllProvinceNamesRuntime`
        integration describe block (stubs `globalThis.pack`
        / `Names` / `nameBases` / `document`):
        culture, random, Names missing, nameBases missing,
        DOM label updated.
- [ ] Register in `src/ai/index.ts`:
  - [ ] Import `regenerateAllProvinceNamesTool`.
  - [ ] Re-export factory + tool.
  - [ ] `registry.register(regenerateAllProvinceNamesTool)`
        near the other bulk regenerate tools.
- [ ] Add README_AI.md table row near the other bulk
      regenerate rows.
- [ ] `npm test -- --run` — all green.
- [ ] `npx biome check src/` — matches baseline.
- [ ] `npm run build` — succeeds.
- [ ] Commit with message
      `feat(ai): add regenerate_all_province_names tool`.
