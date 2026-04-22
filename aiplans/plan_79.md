# Plan 79 — set_state_culture AI tool

## Use case

The States Editor has a "dominant culture" dropdown per state
(`stateChangeCulture` at
`public/modules/dynamic/editors/states-editor.js:559`). It writes
`pack.states[stateId].culture = cultureId`. The dropdown lists
all non-removed cultures (Wildlands, culture 0, IS allowed).
Users change a state's dominant culture to alter its name
generation seed + military composition.

The chat has `set_burg_culture` for burgs but no equivalent for
states.

## Scope

Add one tool: `set_state_culture(state, culture)`.

- `state` required — id (> 0, Neutrals excluded) or
  case-insensitive name/fullName via `findEntityByRef`.
- `culture` required — id (≥ 0, Wildlands IS allowed) or
  case-insensitive name. Must be non-removed.
- Writes `state.culture = culture.i`.

## Implementation

1. **New file `src/ai/tools/set-state-culture.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getPackCollection`, `okResult`, `parseEntityRef`, type
     `RawCulture`, `RawState`.
   - `StateCultureState { i, name, previousCultureId,
     previousCultureName }`.
   - `StateCultureCulture { i, name }`.
   - `StateCultureRuntime { findState, findCulture, apply }`.
   - `defaultStateCultureRuntime`:
     - `findState`: findEntityByRef over states (reject id 0).
     - `findCulture`: findEntityByRef pattern BUT needs to
       accept culture 0. Since `findEntityByRef` rejects 0
       for numeric refs, implement a local helper:
       `findCultureByRef(cultures, ref)`:
       - Numeric 0 returns `cultures[0]` if present and
         non-removed (Wildlands).
       - Numeric > 0: delegates to `findEntityByRef`.
       - String: scan for name match including index 0.
     - `apply(stateId, cultureId)`: lookup state; throw
       missing/removed; lookup culture including 0; throw
       missing/removed; write `state.culture = cultureId`.
   - Tool schema: `state` (int|string required), `culture`
     (int|string required — 0 is valid for Wildlands).
   - Execute: validate state ref (int >=1 OR non-empty string);
     validate culture ref (int >=0 OR non-empty string); find;
     apply; respond with previous+new culture.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-state-culture.test.ts`**:
   - Runtime-injected:
     - Set by ids.
     - Set by state name + culture name.
     - Allow culture 0 (Wildlands).
     - Reject state 0 (Neutrals).
     - Reject invalid refs.
     - Error on unknown.
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub pack.states + pack.cultures with Wildlands + 2.
     - Apply → state.culture updated.
     - Apply Wildlands (0) → state.culture = 0.
     - Refuse removed culture.

4. **README_AI.md** — row near `set_burg_culture`.

## Verification

- `npm test -- --run src/ai/tools/set-state-culture` green.
- `npm test -- --run` — 968 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can change a state's dominant culture — Wildlands included
  (matches the UI's dropdown).
- Neutrals (state 0) is protected.
