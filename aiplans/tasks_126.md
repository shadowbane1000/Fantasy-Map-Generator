# Tasks 126 — regenerate_burg_coa AI tool

- [ ] Create `src/ai/tools/regenerate-burg-coa.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPack,
    getPackCollection, okResult, parseEntityRef,
    types Pack, RawBurg, RawCoa, RawProvince, RawState.
  - Exports:
    - `RegenerateBurgCoaRef { i, name, coa }`.
    - `RegenerateBurgCoaRuntime { find, generate, apply }`.
    - `defaultRegenerateBurgCoaRuntime`.
    - `createRegenerateBurgCoaTool(runtime?)`,
      `regenerateBurgCoaTool`.
  - Tool name: `regenerate_burg_coa`.
  - Description references Burg Editor / Emblem Editor
    regenerate button, culture-aware kinship, parent
    fallback (province else state), shield preservation.
  - Schema:
    - `burg`: int | string, required.
    - `shield`: string, optional (override shield shape).
  - Runtime contract:
    - `find(ref)` → null for `removed`, `lock`, `i<=0`,
      unknown. Else `{i, name, coa}` (current `coa`
      captured for response).
    - `generate(burgI, shield?)` → reads pack to resolve
      parent + shield; calls `COA.generate(parent,
      0.3, 0.1, null)`; sets `coa.shield = explicit ??
      existing ?? COA.getShield(culture, state)`.
    - `apply(i, coa)` → writes `burg.coa = coa`;
      best-effort removes existing `#burgCOA{i}` DOM
      node and calls `COArenderer.trigger("burgCOA"+i,
      coa)`, wrapped in try/catch.
  - Validation:
    - `parseEntityRef(burg)`.
    - `shield` (if provided): non-empty string — reject
      empty strings.
    - `find` null → `"No burg found matching ..."`.
  - Return payload: `{i, previousCoa, coa}`.

- [ ] Register in `src/ai/index.ts`:
  - Import `regenerateBurgCoaTool`.
  - Barrel re-export
    (`createRegenerateBurgCoaTool`,
    `regenerateBurgCoaTool`).
  - `registry.register(regenerateBurgCoaTool)` beside
    `regenerateEmblemsTool`.

- [ ] Write `src/ai/tools/regenerate-burg-coa.test.ts`:
  - Unit (stubbed runtime):
    - regenerates by id (returns full payload).
    - resolves by case-insensitive name.
    - passes explicit shield through.
    - omits shield when not provided.
    - rejects unknown burg.
    - rejects invalid refs (null, 0, -1, 1.5, "").
    - rejects removed / locked burg (find returns null).
    - rejects empty-string shield override.
    - surfaces generator errors.
    - surfaces apply errors.
  - `defaultRegenerateBurgCoaRuntime (integration)`:
    - stubs globalThis.pack (cells.province, burgs,
      states, provinces), globalThis.COA (generate +
      getShield), globalThis.COArenderer (trigger),
      globalThis.document (getElementById returning a
      fake element with `.remove()` spy).
    - happy path (explicit shield): burg.coa updated,
      coa.shield is the override, trigger called with
      ("burgCOA5", newCoa).
    - preserves existing burg.coa.shield when no
      override and existing shield present.
    - falls back to COA.getShield when no existing
      shield and no override.
    - picks province parent when cells.province[cell]
      is truthy; otherwise falls back to state parent.
    - errors when pack missing.
    - errors when COA missing.
    - errors when burg not found.
    - skips COArenderer.trigger cleanly when missing
      (no throw, still returns ok).

- [ ] Update `README_AI.md` — row near
  `regenerate_emblems`, including per-burg scope note,
  optional shield param, and user-invocation examples.

- [ ] `npx vitest --run` — all pass.

- [ ] `npm run lint` — still 7 warnings / 1 info / 0
  errors.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add regenerate_burg_coa tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime seam (find/generate/apply) keeps validation,
  generation, and mutation independently testable.
- Shield precedence (explicit > existing > getShield)
  matches the Emblem Editor reference.
- Locked + removed rejection explicit in the find path.

## Verification: plan → use case

- `COA.generate(parent, 0.3, 0.1, null)` + shield
  preserve + `COArenderer.trigger` matches the
  `emblems-editor.js regenerate()` flow one-to-one.
- Parent precedence (province else state) matches the
  reference.
- DOM refresh removes existing `#burgCOA{i}` then calls
  `trigger`, mirroring the UI's behavior.

## Verification: tests → regressions

- If shield precedence regresses, unit + integration
  tests fail.
- If parent-province fallback drops, integration test
  for "province parent" fails.
- If apply drops DOM removal, integration assertion on
  `getElementById(...).remove` fails.
- If lock / removed rejection drops, the "find returns
  null" unit tests fail.
- If apply doesn't set `burg.coa`, integration pack-
  state assertion fails.
