# Tasks 79 — set_state_culture AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-state-culture.ts`:
  - Imports: `errorResult`, `findEntityByRef`,
    `getPackCollection`, `okResult`, type `RawCulture`,
    `RawState`.
  - Private `findCultureByRef(cultures, ref)` that permits
    culture 0:
    - null if cultures not array.
    - Numeric ref: integer ≥ 0; if 0 → return cultures[0] if
      present && !removed (else null). If > 0 → delegate to
      findEntityByRef.
    - String ref: trim + lowercase; scan for name match
      (including index 0 since Wildlands has a valid name).
  - Types:
    - `StateCultureState { i, name, previousCultureId,
      previousCultureName }`.
    - `StateCultureCulture { i, name }`.
    - `StateCultureRuntime { findState, findCulture, apply }`.
  - `defaultStateCultureRuntime`:
    - `findState`: findEntityByRef over states (rejects 0
      because findEntityByRef already skips index 0).
    - `findCulture`: findCultureByRef.
    - `apply`: lookup state + culture, throw if missing/removed,
      write `state.culture = cultureId`.
  - Tool schema: `state` (int|string required), `culture`
    (int|string required).
  - Execute:
    - Validate state ref: integer ≥ 1 OR non-empty string.
    - Validate culture ref: integer ≥ 0 OR non-empty string.
    - findState → 404 if null. (State 0 already rejected by
      findEntityByRef.)
    - findCulture → 404 if null.
    - try apply.
    - Return `{ state: {i, name}, previousCulture: {id, name},
      culture: {id, name} }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register near
  `setBurgCultureTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-state-culture.test.ts`:
  - Runtime-injected:
    - Set by ids → apply(stateId, cultureId).
    - Set by state name + culture name.
    - Allow culture 0 (Wildlands).
    - Reject state 0 (Neutrals).
    - Reject invalid refs.
    - Error on unknown state/culture.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.states` + `pack.cultures` with
      Neutrals + 2 real states, Wildlands + 2 real cultures.
    - Apply state 1 ← culture 2 → `state.culture === 2`.
    - Apply state 1 ← Wildlands (0) → `state.culture === 0`.
    - Refuse removed culture.

## Task 4 — README

- [ ] Row near `set_burg_culture`:
  ```
  | `set_state_culture`     | Change a state's dominant culture (same as the States Editor culture dropdown). Writes `state.culture`. Accepts culture id (including 0 = Wildlands) or case-insensitive name. Rejects Neutrals (state 0). | "Make Rookhold's dominant culture the Highlanders", "Switch state 3 to Wildlands" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-state-culture` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_state_culture tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: States Editor dominant-culture dropdown, UI-only.
- Plan writes `state.culture` identically to `stateChangeCulture`.
- Wildlands (culture 0) is valid as a target, matching the
  dropdown's option list.

## Verification that tests prove the use case

- findCultureByRef branch exercised for id 0.
- Integration test validates live mutation for both normal
  cultures and Wildlands.
