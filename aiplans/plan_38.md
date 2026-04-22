# Plan 38 — Use Case: Set a state's expansionism

## Status

Iteration 38. 37 AI tools. Baseline 7 warnings / 1 info / 0 errors.
460 tests pass.

## Use Case

**"Tune a state's expansionism — how aggressively it grows during
regeneration."**

The States Editor has a number input per state row. The handler
`stateChangeExpansionism(state, line, value)` in
`public/modules/dynamic/editors/states-editor.js:568-571`:

```js
pack.states[state].expansionism = value;
recalculateStates(); // heavy — re-runs border/expansion logic
```

`recalculateStates` is module-scoped (not globally exposed), so we
can't call it from a module-scoped tool. Treating this as a passive
setter — the AI updates the field, and the user (or a follow-up
`regenerate_map` call) sees the effect.

Expansionism values in the generator are floats > 0, typically 0.5
to 5. Higher = more aggressive expansion into neighboring cells.

Prompts:
- *"Make Altaria twice as expansionist."*
- *"Set state 3's expansionism to 2.5."*

### Success criteria

1. `set_state_expansionism({state: 1, expansionism: 2.5})` sets
   `pack.states[1].expansionism = 2.5`.
2. String-name ref, case-insensitive.
3. Rejects state 0 (Neutrals).
4. Rejects unknown state.
5. Rejects non-positive / non-finite expansionism
   (0, negative, NaN, Infinity).
6. Rejects >100 (sanity cap).
7. Runtime throws → error.
8. Response reports
   `{i, name, previousExpansionism, expansionism}`.

## Scope

In-scope:
- `set_state_expansionism` tool with `StateExpansionismRuntime`.
- Registry + README + tests.

Out-of-scope:
- Culture / religion expansionism (future tools).
- Triggering `recalculateStates` — the function isn't exposed and
  regenerateMap runs a fuller reset anyway.

## Design

New file: `src/ai/tools/set-state-expansionism.ts`.

```ts
export interface StateExpansionismRef {
  i: number;
  name: string;
  previousExpansionism: number;
}
export interface StateExpansionismRuntime {
  find(ref: number | string): StateExpansionismRef | null;
  apply(i: number, expansionism: number): void;
}
```

Default runtime:
- `find`: `findEntityByRef(pack.states, ref)` →
  `{i, name, previousExpansionism: state.expansionism ?? 1}`.
- `apply(i, value)`: `pack.states[i].expansionism = value`.

Executor:
1. Validate ref.
2. Validate expansionism is a finite number in `(0, 100]`.
3. find → null / i === 0 → error.
4. `runtime.apply(...)` → catch throws.
5. Return okResult.

## Files

Create: `plan_38.md`, `tasks_38.md`,
`src/ai/tools/set-state-expansionism.ts`,
`src/ai/tools/set-state-expansionism.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-state-expansionism.test.ts`):

1. Numeric id + valid value → `apply(i, value)` called.
2. String ref (case-insensitive).
3. Reject state 0.
4. Reject unknown state.
5. Reject invalid expansionism values (0, -1, NaN, Infinity, 150,
   "2", null).
6. Runtime throws → error.
7. Invalid ref types rejected.
8. Response echoes previous + new expansionism.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test.

Lint / test / build gates in tasks_38.md.
