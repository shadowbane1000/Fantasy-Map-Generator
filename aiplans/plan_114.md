# Plan 114 — set_state_labels_mode AI tool

## Use case

The Options dialog has a State Labels selector
(`src/index.html:1824`) with three modes:

- `auto` — the default, generator picks short or full
  per state based on length.
- `short` — always use state.name.
- `full` — always use state.fullName.

Changing the selection runs
`options.stateLabelsMode = value` (options.js:150).
State label rendering reads this setting. The tool
best-effort calls `drawStateLabels()` to reflect the
new mode immediately.

## Scope

Add one tool: `set_state_labels_mode(mode)`.

- `mode` — one of `auto` / `short` / `full`
  (case-insensitive).
- Writes `window.options.stateLabelsMode`, the select's
  value, localStorage, and best-effort calls
  `drawStateLabels()`.
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-state-labels-mode.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - `STATE_LABELS_MODES = ["auto","short","full"] as const`.
   - `resolveStateLabelsMode` — case-insensitive lookup.
   - `StateLabelsModeRuntime { read, apply }`.
   - `defaultStateLabelsModeRuntime`:
     - read: read window.options.stateLabelsMode →
       canonical or null.
     - apply: write options, select.value, localStorage,
       best-effort drawStateLabels().
   - Schema: `mode` (string enum, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-state-labels-mode.test.ts`:
   - `resolveStateLabelsMode` case-insensitive +
     null on unknown / non-string.
   - Unit (stubbed):
     - delegates with canonical mode
     - canonicalizes case
     - rejects unknown
     - rejects empty / non-string
     - noop when already at target
     - surfaces runtime errors
   - Integration:
     - stubs window.options, document select,
       localStorage, drawStateLabels.
     - applies → options.stateLabelsMode updated,
       select value updated, localStorage updated,
       drawStateLabels called.
     - succeeds when drawStateLabels missing.

4. **README_AI.md** — row near `set_cultures_set`.

## Verification

- `npm test -- --run src/ai/tools/set-state-labels-mode`
  green.
- `npm test -- --run` — 1391 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- 3 modes supported with case-insensitive
  canonicalization.
- Writes options + DOM + localStorage + best-effort
  draw refresh.
- Idempotent.
