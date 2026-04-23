# Tasks 130 — regenerate_province_coa AI tool

- [ ] Create `src/ai/tools/regenerate-province-coa.ts`:
  - Imports:
    - `./_shared`: errorResult, findEntityByRef, getGlobal,
      getPack, getPackCollection, okResult, type Pack,
      parseEntityRef, type RawCoa, type RawProvince, type
      RawState.
    - `./index`: type Tool, type ToolResult.
  - Local types:
    - `CoaModule { generate?, getShield? }`.
    - `CoaRendererModule { trigger? }`.
  - Exports:
    - `RegenerateProvinceCoaRef { i, name, coa }`.
    - `RegenerateProvinceCoaRuntime { find, generate, apply }`.
    - `defaultRegenerateProvinceCoaRuntime`:
      - `find(ref)`:
        - `findEntityByRef<RawProvince>(getPackCollection
          ("provinces"), ref)`.
        - Null → null; `entry.i <= 0` → null; `entry.removed`
          → null; `entry.lock` → null.
        - Return `{ i, name: entry.name ?? "", coa: entry.coa
          }`.
      - `generate(provinceI, shield?)`:
        - `getPack<Pack>()`; throw "pack is not available
          yet…" when missing.
        - Re-read `pack.provinces[provinceI]`; throw if
          missing.
        - `getGlobal<CoaModule>("COA")`; throw "COA.generate
          is not available yet…" when missing or no `.generate`.
        - `parent = pack.states?.[province.state ?? 0]`.
        - `parentCoa = parent && !parent.coa?.custom ?
            parent.coa ?? null : null`.
        - `newCoa = COA.generate(parentCoa, 0.3, 0.1, null)`.
        - Shield precedence:
          1. `shield` arg (non-empty string).
          2. `province.coa.shield`.
          3. `COA.getShield(culture, province.state)` where
             `culture = parentCulture || 0`.
        - Assign `newCoa.shield = resolvedShield` if resolved.
        - Return `newCoa`.
      - `apply(i, coa)`:
        - Re-read provinces; throw if missing.
        - `province.coa = coa`.
        - try/catch:
          - `const id = 'provinceCOA' + i;`
          - `document.getElementById(id)?.remove()`.
          - `COArenderer.trigger(id, coa)`.
    - `createRegenerateProvinceCoaTool(runtime?)`,
      `regenerateProvinceCoaTool`.
  - Tool name: `regenerate_province_coa`.
  - Description: cites the Emblem Editor Regenerate button
    for provinces, notes parent = owning state, shield
    precedence, DOM refresh, rejections, cross-refs
    `regenerate_emblems` / `regenerate_state_coa` /
    `regenerate_burg_coa`.
  - Schema: `province` (int | string, required),
    `shield` (string, optional).
  - Validation:
    - `parseEntityRef(input.province, "province")`.
    - `shield` provided → non-empty trimmed string else
      error.
    - `runtime.find(ref)` null → "No province found matching
      …".
    - `runtime.generate` throws → surface error.
    - `newCoa` non-object → "COA.generate returned no
      emblem.".
    - `runtime.apply` throws → surface error.
  - Return payload: `{ ok: true, i, previousCoa: current.coa
    ?? null, coa: newCoa }`.

- [ ] Register in `src/ai/index.ts`:
  - Import `regenerateProvinceCoaTool` alphabetically — goes
    after `regenerateProvinceNameTool`:
    ```
    import { regenerateProvinceCoaTool }
      from "./tools/regenerate-province-coa";
    import { regenerateProvinceNameTool }
      from "./tools/regenerate-province-name";
    ```
  - Barrel re-export `createRegenerateProvinceCoaTool`,
    `regenerateProvinceCoaTool` (new block before the
    regenerate-province-name export).
  - `registry.register(regenerateProvinceCoaTool)` next to
    the other COA tools in `buildDefaultRegistry` — after
    `regenerateStateCoaTool`.

- [ ] Write `src/ai/tools/regenerate-province-coa.test.ts`:
  - Unit (stubbed runtime) — mirror
    `regenerate-state-coa.test.ts`:
    - regenerates by numeric id → returns previous + new coa
    - resolves by case-insensitive name
    - passes explicit shield override through to `generate`
    - trims shield override
    - null previousCoa when province had no coa
    - rejects unknown province
    - rejects invalid refs
    - rejects empty-string / whitespace shield override
    - rejects non-string shield override
    - surfaces generator / apply errors
    - errors when generator returns non-object
  - `defaultRegenerateProvinceCoaRuntime (integration)`:
    - `beforeEach`:
      - `(globalThis as unknown as { pack?: unknown }).pack
        = { provinces, states }` — **DOUBLE-CAST per
        tsc-strict rule.**
      - `(globalThis as { COA?: unknown }).COA = { generate,
        getShield }`.
      - `(globalThis as { COArenderer?: unknown }).COArenderer
        = { trigger }`.
      - `(globalThis as { document?: unknown }).document =
        { getElementById }`.
      - Provinces: `[0]={i:0}`, `[7]={i:7, name:"North Mark",
        state:2, coa:{t1:"azure",shield:"swiss"}}`.
      - States: `[0]={i:0,name:"Neutrals"}`, `[2]={i:2,
        name:"Altaria", culture:3, coa:{t1:"gules",
        shield:"swiss"}}`.
    - Tests:
      - regenerates with explicit shield → updates
        `province.coa`, calls `trigger('provinceCOA7', ...)`.
      - parent passed to `COA.generate` equals
        `{t1:"gules", shield:"swiss"}` (the state's coa).
      - preserves existing `province.coa.shield` when no
        override; `getShield` not called.
      - falls back to `COA.getShield(3, 2)` when no existing
        shield and no override (culture = parent state's).
      - errors when pack is missing.
      - errors when COA is missing (message mentions COA).
      - errors when province is unknown.
      - rejects locked / removed provinces.
      - rejects province 0.
      - succeeds when `COArenderer` missing.
      - does not throw when `#provinceCOA{i}` DOM node
        missing.
    - `afterEach` restores original pack / COA / COArenderer
      / document.

- [ ] Update `README_AI.md` — new row after
  `regenerate_state_coa` (currently line 23). Include:
  `COA.generate(parent, 0.3, 0.1, null)`, parent = owning
  state, shield precedence, `#provinceCOA{i}` DOM refresh,
  rejection for province 0 / removed / locked, pointer to
  `regenerate_emblems` for bulk.

- [ ] `npx biome check --write src` — still 7 warnings /
  1 info / 0 errors.

- [ ] `npm test` — passes (1623 → ~1640).

- [ ] `npm run build` — succeeds.

- [ ] Commit with `feat(ai): add regenerate_province_coa
  tool` and a 1-2 line body.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime (`find`, `generate`, `apply`) maps cleanly to the
  mutation and matches `regenerate-burg-coa.ts` /
  `regenerate-state-coa.ts`.
- Description + README describe parent = owning state,
  shield precedence, DOM refresh, rejections.

## Verification: plan → use case

- Parent resolution matches the Emblem Editor's own
  regenerate handler (`pack.states[el.state]` when type is
  "province").
- `COA.generate(parent, 0.3, 0.1, null)` mirrors lines
  215–216 of emblems-editor.js.
- DOM refresh (`document.getElementById('provinceCOA{i}')
  .remove()` + `COArenderer.trigger`) mirrors lines 220–222.

## Verification: tests → regressions

- Province 0 / removed / locked rejection is explicit.
- Shield precedence has 3 tests: explicit, existing,
  fallback via `getShield`.
- Missing globals (pack / COA / COArenderer / DOM node) all
  covered.
- Surfaces runtime errors through try/catch.
- Invalid refs tested via parseEntityRef bundle.
