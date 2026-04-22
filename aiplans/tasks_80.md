# Tasks 80 — set_state_type AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-state-type.ts`:
  - Imports: `createAliasResolver`, `errorResult`,
    `findEntityByRef`, `getGlobal`, `getPackCollection`,
    `okResult`, `parseEntityRef`, type `RawState`.
  - `STATE_TYPES = ["Generic","River","Lake","Naval","Nomadic",
    "Hunting","Highland"] as const`.
  - `resolveStateType = createAliasResolver(STATE_TYPES)`.
  - Types:
    - `StateTypeRef { i, name, previousType }`.
    - `StateTypeRuntime { find, apply }`.
  - `defaultStateTypeRuntime`:
    - `find`: findEntityByRef → shape with previousType.
    - `apply(i, type)`: lookup state, throw missing/removed,
      write `state.type = type`, best-effort
      `getGlobal<() => void>("recalculateStates")?.()`.
  - Tool schema: `state` (int|string required), `type` (string
    required).
  - Execute: parseEntityRef; resolveStateType; find → 404;
    reject id 0; try apply; respond.

## Task 2 — Register

- [ ] Import + barrel re-export + register near
  `setStateFormTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-state-type.test.ts`:
  - Runtime-injected: set by id, by name, canonicalize
    lowercase, reject unknown type, invalid refs, reject state 0,
    surface failures.
  - Default-runtime integration: stub pack + recalcStates;
    apply type → data updated, recalc called; reject removed.

## Task 4 — README

- [ ] Row near `set_state_form`:
  ```
  | `set_state_type`        | Change a state's type (Generic / River / Lake / Naval / Nomadic / Hunting / Highland — same 7-value enum as burgs and cultures). Writes `state.type` and calls `recalculateStates()` to redistribute cells. Matches state by id (>0) or case-insensitive name; Neutrals (0) rejected. | "Make Rookhold a Naval state", "Turn state 3 into a Highland state" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-state-type` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_state_type tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: States Editor type dropdown.
- Plan writes `state.type` and calls `recalculateStates()` —
  same as the UI handler.
- The 7-value enum is shared with burgs + cultures, matching the
  UI's own copy.

## Verification that tests prove the use case

- Runtime-injected tests cover validation + dispatch.
- Integration test proves live mutation + recalc.
