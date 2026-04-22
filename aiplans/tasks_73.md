# Tasks 73 — set_culture_type AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-culture-type.ts`:
  - Imports: `createAliasResolver`, `errorResult`,
    `findEntityByRef`, `getGlobal`, `getPackCollection`,
    `okResult`, `parseEntityRef`, type `RawCulture`.
  - `CULTURE_TYPES = ["Generic","River","Lake","Naval","Nomadic",
    "Hunting","Highland"] as const`.
  - `resolveCultureType = createAliasResolver<...>(CULTURE_TYPES)`.
  - Types:
    - `CultureTypeRef { i, name, previousType }`.
    - `CultureTypeRuntime { find, apply }`.
  - `defaultCultureTypeRuntime`:
    - `find(ref)`: `findEntityByRef(getPackCollection<RawCulture>(
      "cultures"), ref)` → `{ i, name, previousType: culture.type
      ?? null }`.
    - `apply(i, type)`: find by index in pack.cultures; throw if
      missing / removed; write `culture.type = type`; best-effort
      `getGlobal<() => void>("recalculateCultures")?.()`.
  - Tool schema: `culture` (int|string required), `type` (string
    required).
  - Execute: parseEntityRef(culture); validate type is non-empty
    string and resolves via resolveCultureType; find → 404;
    reject id 0; try apply; return
    `{ i, name, previousType, type }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register in `src/ai/index.ts`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-culture-type.test.ts`:
  - Runtime-injected:
    - Set by id.
    - Set by case-insensitive name.
    - Canonicalize "naval"/"RIVER".
    - Reject unknown type.
    - Reject invalid culture ref.
    - Reject id 0 (Wildlands).
    - Error when culture unknown.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.cultures` with 3 cultures.
    - Stub `globalThis.recalculateCultures` mock.
    - Apply type "Naval" to culture 1 → `pack.cultures[1].type`
      === "Naval", recalc called.
    - Apply to removed culture → error.

## Task 4 — README

- [ ] Row near `set_culture_color`:
  ```
  | `set_culture_type`      | Change a culture's type (Generic / River / Lake / Naval / Nomadic / Hunting / Highland — same enum as burg types). Writes `culture.type` and calls `recalculateCultures()` so cell assignments redistribute on next regenerate. Matches by id (>0) or case-insensitive name; Wildlands (0) rejected. | "Make the Highlanders a Highland culture", "Turn the Coastalfolk into a Naval culture" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-culture-type` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_culture_type tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Tasks 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Cultures Editor type dropdown; AI unreachable.
- Plan writes the same `culture.type` the UI writes AND calls
  `recalculateCultures()` so the cells redistribute per
  type-specific expansion rules — same effect as a user dropdown
  change.
- Enum matches `BURG_TYPES` exactly (the shared 7-value set).

## Verification that tests prove the use case

- Injected-runtime tests cover validation + dispatch.
- Integration test proves the live mutation + recalc.
- Wildlands rejection test prevents footgun.
