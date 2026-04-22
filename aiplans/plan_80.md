# Plan 80 — set_state_type AI tool

## Use case

The States Editor has a per-state type dropdown
(`stateChangeType` at
`public/modules/dynamic/editors/states-editor.js:563`) with 7
options: Generic / River / Lake / Naval / Nomadic / Hunting /
Highland (identical to the burg and culture enums). Writing
sets `state.type = value` and calls `recalculateStates()` so
cells redistribute per type-specific expansion.

The chat has `set_burg_type` and `set_culture_type` but no state
equivalent.

## Scope

Add one tool: `set_state_type(state, type)`.

- `state` required — id (> 0) or case-insensitive
  name/fullName. Rejects Neutrals (0).
- `type` — one of Generic, River, Lake, Naval, Nomadic, Hunting,
  Highland (case-insensitive via `createAliasResolver`).
- Writes `state.type = canonical`, best-effort calls
  `recalculateStates()`.

## Implementation

1. **New file `src/ai/tools/set-state-type.ts`**:
   - Imports: `createAliasResolver`, `errorResult`,
     `findEntityByRef`, `getGlobal`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawState`.
   - `STATE_TYPES = ["Generic","River","Lake","Naval","Nomadic",
     "Hunting","Highland"] as const`.
   - `resolveStateType`.
   - `StateTypeRef { i, name, previousType }`.
   - `StateTypeRuntime { find, apply }`.
   - `defaultStateTypeRuntime.find`: findEntityByRef.
   - `defaultStateTypeRuntime.apply`: write `state.type = type`;
     best-effort `recalculateStates()`.
   - Tool schema: `state` (int|string required), `type`
     (string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** — parallel to set_culture_type.

4. **README_AI.md** — row near `set_state_form`.

## Verification

- `npm test -- --run src/ai/tools/set-state-type` green.
- `npm test -- --run` — 978 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can change a state's type to one of the 7 canonical values.
- Neutrals (state 0) protected.
- `recalculateStates()` called after the write so cells
  redistribute.
