# Tasks 119 — regenerate_province_name AI tool

- [ ] Create `src/ai/tools/regenerate-province-name.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPack, okResult,
    parseEntityRef, type RawProvince.
  - Local PackWithCultureCells shape:
    ```
    interface PackWithCultureCells {
      cells?: { culture?: ArrayLike<number> };
      provinces?: RawProvince[];
    }
    ```
  - Exports:
    - `PROVINCE_NAME_MODES = ["culture","random"] as const`.
    - `ProvinceNameMode` type.
    - `resolveProvinceNameMode(value)`.
    - `composeProvinceFullName(short, form)`:
      - If !form: return short.
      - If !short && form: return "The " + form.
      - return short + " " + form.
    - `RegenerateProvinceNameRef { i, name, fullName,
       center, formName }`.
    - `RegenerateProvinceNameRuntime { find, generate,
       apply }`.
    - `defaultRegenerateProvinceNameRuntime`:
      - find: findEntityByRef; pack pulled for cells and
        current fields. Return null for removed / id 0.
      - generate(mode, center):
        - pack.cells.culture[center]; throw if missing.
        - Names module; throw if missing.
        - mode=culture: Names.getState(
          Names.getCultureShort(culture), culture).
        - mode=random: need nameBases; pick rand index;
          Names.getState(Names.getBase(base), undefined,
          base).
      - apply(i, name, fullName):
        - pack.provinces[i]; throw if missing.
        - province.name = name; province.fullName =
          fullName.
        - Best-effort `#provinceLabel{i}` textContent
          update.
    - `createRegenerateProvinceNameTool(runtime?)` and
      `regenerateProvinceNameTool`.
  - Tool name: `regenerate_province_name`.
  - Description: references province-name dialog,
    modes culture/random, fullName composition.
  - Schema: province (int|string required), mode
    (string enum optional, default culture).
  - Validation:
    - parseEntityRef(province).
    - resolveProvinceNameMode on provided mode.
    - find null → error.
  - Build fullName via composeProvinceFullName(newShort,
    formName).
  - Return payload: `{ i, previousName, previousFullName,
    name, fullName, mode }`.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write test (parallel to regenerate-state-name):
  - `resolveProvinceNameMode`.
  - `composeProvinceFullName`: 3 cases.
  - Unit (stubbed): happy path both modes, invalid refs,
    unknown province, unknown mode, generator errors,
    empty output.
  - Integration: stubs pack.cells, provinces, Names,
    nameBases, document; culture + random + SVG label
    update; errors when Names / nameBases missing.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- File + registration.
- Two modes + fullName composition matches plan.
- Rejects unknown province and invalid refs.

## Verification: plan → use case

- UI: cultureShort or random base → getState. Apply
  writes short + fullName (via getFullName). Tool does
  the same directly.

## Verification: tests → regressions

- If composeProvinceFullName missed a branch, its test
  fails.
- If Names delegation differs by mode, assertion fails.
- If apply doesn't write fullName, integration fails.
- If SVG label not updated, label assertion fails.
