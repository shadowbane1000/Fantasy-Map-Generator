# Tasks 118 — regenerate_state_name AI tool

- [ ] Create `src/ai/tools/regenerate-state-name.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPackCollection,
    okResult, parseEntityRef, type RawState.
  - Exports:
    - `STATE_NAME_MODES = ["culture","random"] as const`.
    - `StateNameMode` type.
    - `resolveStateNameMode(value)`.
    - `RegenerateStateNameRef { i, name, culture }`.
    - `RegenerateStateNameRuntime { find, generate,
       apply }`.
    - `defaultRegenerateStateNameRuntime`:
      - find: findEntityByRef on pack.states.
      - generate(mode, culture):
        - Read Names module; throw if missing or
          missing the needed functions.
        - mode=culture: Names.getState(
          Names.getCultureShort(culture), culture).
        - mode=random:
          - nameBases global; throw if missing or
            non-array.
          - base = Math.floor(Math.random() * len).
          - Names.getState(Names.getBase(base),
            undefined, base).
      - apply(i, name):
        - pack.states[i].name = name; throw if burg
          missing.
        - Best-effort drawStateLabels([i]).
    - `createRegenerateStateNameTool(runtime?)` and
      `regenerateStateNameTool`.
  - Tool name: `regenerate_state_name`.
  - Description: references States Editor regen-name
    buttons, two modes, drawStateLabels refresh, Neutrals
    rejected.
  - Schema: state (int|string required), mode (string
    enum optional, default culture).
  - Validation:
    - parseEntityRef.
    - resolveStateNameMode on provided mode (default
      culture).
    - find null → "No state found..."
    - i <= 0 → "Cannot rename state 0 (Neutrals)."
  - Return payload: { i, previousName, name, mode }.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write test parallel to regenerate-burg-name.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- File + registration = "callable".
- Two modes with different Names delegation.
- Neutrals guard.

## Verification: plan → use case

- UI's regenerate-name buttons use Names.getState with
  either Names.getCultureShort or Names.getBase as the
  basename source. Tool does the same.

## Verification: tests → regressions

- If culture-mode doesn't call getCultureShort, test
  fails.
- If random-mode doesn't call getBase, test fails.
- If Neutrals not rejected, that test fails.
- If apply doesn't update state.name + drawStateLabels,
  integration assertions fail.
