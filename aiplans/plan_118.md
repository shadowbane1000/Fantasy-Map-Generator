# Plan 118 — regenerate_state_name AI tool

## Use case

The States Editor's state-name dialog has two
regenerate-name buttons:

- `stateNameEditorShortCulture`
  (`public/modules/dynamic/editors/states-editor.js:407`)
  — `Names.getState(Names.getCultureShort(culture),
  culture)`.
- `stateNameEditorShortRandom`
  (`states-editor.js:414`) —
  `Names.getState(Names.getBase(rand), undefined, base)`.

The UI buffers the new name in the dialog's `short`
input, then applies on button click. For an AI tool,
applying directly is cleaner (no dialog flow).

Parallels `regenerate_burg_name` (burgs) — this is the
states version.

## Scope

Add one tool: `regenerate_state_name(state, mode?)`.

- `state` — id (> 0) or case-insensitive name /
  fullName. Rejects Neutrals (0).
- `mode` — `"culture"` (default) or `"random"`.
- `"culture"`: `Names.getState(Names.getCultureShort(
  culture), culture)`.
- `"random"`: `Names.getState(Names.getBase(randIndex),
  undefined, randIndex)`.
- Writes `state.name`.
- Best-effort: update `#stateLabel{i}` SVG (via
  drawStateLabels([id])).
- Non-idempotent (random per call).

## Implementation

1. **New file `src/ai/tools/regenerate-state-name.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getPackCollection, okResult, parseEntityRef,
     type RawState from `./_shared`.
   - `STATE_NAME_MODES = ["culture","random"] as const`.
   - `resolveStateNameMode`.
   - `RegenerateStateNameRef { i, name, culture }`.
   - `RegenerateStateNameRuntime { find, generate, apply }`.
   - `defaultRegenerateStateNameRuntime`:
     - find: findEntityByRef on states. Guard i > 0 &&
       !removed.
     - generate(mode, culture):
       - Get Names module; throw if missing or missing
         required funcs.
       - mode=culture: Names.getState(
         Names.getCultureShort(culture), culture).
       - mode=random:
         - nameBases required.
         - base = Math.floor(Math.random() * len).
         - Names.getState(Names.getBase(base), undefined,
           base).
     - apply(i, name): pack.states[i].name = name; call
       drawStateLabels([i]) best-effort.
   - Schema: `state` (int|string required), `mode`
     (string enum optional, default culture).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-state-name.test.ts`:
   - `resolveStateNameMode`.
   - Unit (stubbed):
     - default culture mode
     - explicit random
     - rejects invalid refs
     - rejects Neutrals
     - rejects unknown state
     - surfaces generator errors
   - Integration:
     - stubs pack.states, Names (getState, getBase,
       getCultureShort), nameBases, drawStateLabels.
     - culture mode: calls getState with getCultureShort.
     - random mode: calls getState with getBase.
     - apply writes state.name + drawStateLabels([i]).
     - errors when Names missing.

4. **README_AI.md** — row near `regenerate_burg_name`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-state-name`
  green.
- `npm test -- --run` — 1442 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Two modes match UI buttons.
- Delegates to Names module for the roll.
- Updates state.name + drawStateLabels.
- Rejects Neutrals.
