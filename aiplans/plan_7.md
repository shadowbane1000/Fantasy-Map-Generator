# Plan 7 — Use Case: Rename a state

## Status

Iteration 7. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`, `list_states`.
Baseline: 7 warnings / 1 info / 0 errors. 116 tests pass.

## Use Case

**"Rename a specific state."**

The user does this in the States Editor: open the editor, click a
row, type into the name / fullName inputs, and the editor:
1. Sets `pack.states[i].name` (and optionally `fullName`).
2. Calls `drawStateLabels([i])` to redraw that state's label on the
   map.

Source: `public/modules/dynamic/editors/states-editor.js:462` (`s.name
= nameInput.value; s.fullName = fullNameInput.value; drawStateLabels([s.i])`).

With `list_states` the AI can discover which state is which. With this
tool it can act on one: *"Rename Kingdom of Altaria to Valorin"* or
*"Rename state #3 to Zephyr"*.

### Success criteria

1. `rename_state({state: 1, name: "Zephyr"})` sets
   `pack.states[1].name = "Zephyr"` and calls
   `drawStateLabels([1])`.
2. `rename_state({state: "Altaria", name: "Zephyr"})` resolves
   "Altaria" (case-insensitive) to the correct id and applies the
   change.
3. Optional `fullName` updates `pack.states[i].fullName`.
4. Attempt to rename state 0 (Neutrals) → structured error.
5. Unknown id / name → structured error.
6. Empty/whitespace name → structured error.
7. Pre-load (pack missing) → structured error.

## Scope

In-scope:
- Tool `rename_state({state, name, fullName?})`.
- `StateMutationRuntime` seam: `findState(ref) → spec | null`,
  `renameState(id, name, fullName?) → void`.
- Registry + README.
- Unit tests.

Out-of-scope:
- Changing capital / color / form / diplomacy (future tools).
- Editing provinces / burgs (future tools).

## Design

New file: `src/ai/tools/rename-state.ts`.

```ts
export interface StateMutationRuntime {
  find(ref: number | string): { i: number; name: string } | null;
  rename(i: number, name: string, fullName?: string): void;
}
```

Default runtime:
- `find(ref)`:
  - If `ref` is a number: `pack.states[ref]` if it exists, `i > 0`,
    `!removed`, return `{i, name}`.
  - If `ref` is a string: search `pack.states` for exact-then-lowercase
    match on `name` (and `fullName` as fallback), skipping index 0 and
    removed states.
- `rename(i, name, fullName?)`:
  - Validates `pack.states[i]` exists and is not neutral or removed.
  - `pack.states[i].name = name`; if `fullName` given, also update
    `fullName`.
  - If `window.drawStateLabels` is a function, call
    `window.drawStateLabels([i])` — otherwise no-op (pre-render).

The tool:
1. Validates `state` (number or non-empty string) and `name` (non-empty
   string).
2. Calls `runtime.find(state)`. If null → error.
3. If resolved id is 0 → error ("cannot rename Neutrals").
4. Calls `runtime.rename(id, name.trim(), fullName?.trim())`, catches
   any throw → error.
5. Returns `{ok: true, i, name, fullName, previousName}`.

## Files

Create: `plan_7.md`, `tasks_7.md`,
`src/ai/tools/rename-state.ts`,
`src/ai/tools/rename-state.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing plan

Unit (`rename-state.test.ts`):

1. Numeric id → rename succeeds; `rename` called with `(id, name)`.
2. Numeric id + `fullName` → `rename` called with all three args.
3. String name (case-insensitive) → resolves to correct id.
4. Unknown id or name → `{isError: true}` with helpful message.
5. Neutrals (id 0) → `{isError: true}`.
6. Empty/whitespace new name → `{isError: true}`; trim logic verified.
7. Runtime throws → `{isError: true}` surfaces the message.
8. Pre-load: runtime `find` returns null on everything → error path.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 numeric id rename | runtime.find + rename | 1 |
| #2 string lookup    | runtime.find string path | 3 |
| #3 fullName support | optional param | 2 |
| #4 reject neutrals  | id === 0 guard | 5 |
| #5 unknown error    | runtime returns null | 4 |
| #6 validation       | input guard | 6 |
| #7 pre-load         | runtime null | 4, 8 |

Lint / test / build gates in tasks_7.md.
