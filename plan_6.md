# Plan 6 — Use Case: List states

## Status

Iteration 6. Tools already implemented: `set_map_name`,
`set_layer_visibility`, `apply_layers_preset`, `get_map_info`,
`regenerate_map`. Baseline 7 warnings / 1 info / 0 errors. 107 tests
pass.

## Use Case

**"List the states on the current map."**

The user can see this in two UI surfaces:
- The **States editor** panel lists every state with its name, full
  name, form (Kingdom/Empire/…), culture, capital burg, color, burgs
  count, cells count, area, rural + urban population.
- Hovering a state on the map shows its name in the tooltip.

Without a list-tool the AI can know *how many* states exist (from
`get_map_info`) but can't name them, can't pick one to act on, and
can't answer questions like *"Which state has the most burgs?"*.

Prompts the user might try:
- *"List the states."*
- *"Which is the biggest state?"* (the AI filters after reading.)
- *"What's the capital of the second state?"*

### Success criteria

1. `list_states()` returns a JSON array of states (excluding the
   `Neutrals` placeholder at index 0, excluding entries marked
   `removed`).
2. Each entry exposes `{i, name, fullName, form, type, color, culture,
   capital, burgs, cells, area, population}` where:
   - `culture` is the culture name (looked up by id from
     `pack.cultures`) or `null` if unavailable.
   - `capital` is the capital burg name (looked up by id from
     `pack.burgs`) or `null`.
   - `population` is `Math.round((rural + urban) *
     window.populationRate)` *if* the rate is a finite positive number;
     otherwise the raw cell count of `rural + urban`.
3. Supports an optional `limit` (default 100) and `offset` (default 0)
   so very-large maps don't produce a runaway tool result.
4. Graceful error when `window.pack` is not loaded.

## Scope

In-scope:
- `list_states` tool using a `StatesRuntime` seam.
- Optional `limit`/`offset` pagination.
- Registry wiring + README entry.

Out-of-scope:
- Writing to a state (rename, change color, change form, merge):
  future iterations.
- Filtering / sorting in the tool itself — the AI can do that after
  reading.

## Design

New file: `src/ai/tools/list-states.ts`.

```ts
export interface StateSummary {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  type: string | null;
  color: string | null;
  culture: string | null;
  capital: string | null;
  burgs: number;
  cells: number;
  area: number;
  population: number;
}
export interface StatesRuntime {
  readStates(): StateSummary[] | null;
}
```

Default runtime pulls from `window.pack.states`, uses
`window.pack.cultures[state.culture]?.name` and
`window.pack.burgs[state.capital]?.name` for display names, and
multiplies `(rural + urban)` by `window.populationRate` (falling back
to raw cells).

The tool:
1. Validates `limit` (1–500) and `offset` (≥ 0).
2. Calls `runtime.readStates()`.
3. If null, returns structured error.
4. Otherwise slices and returns `{ok: true, total, limit, offset,
   states}`.

## Files

Create: `plan_6.md`, `tasks_6.md`,
`src/ai/tools/list-states.ts`,
`src/ai/tools/list-states.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-states.test.ts`) with a fake `StatesRuntime`:

1. Returns the full list when no paging params are given.
2. Honors `limit` / `offset` (slice semantics verified).
3. Rejects `limit` outside 1–500 or non-integer.
4. Rejects negative `offset`.
5. Returns `{isError: true}` when runtime returns null.
6. Preserves the entries' fields unchanged in the payload.

## Plan ↔ tasks ↔ tests verification

| Criterion       | Implementation         | Test |
| --------------- | ---------------------- | ---- |
| #1 excludes 0/removed | Default runtime filter | verified via the mapper (we trust runtime to supply pre-filtered list in tests; the default runtime filter is covered by reading `removed` flag explicitly). |
| #2 shape        | `StateSummary` type    | Test 1, 6 |
| #3 pagination   | Slice + input checks   | Test 2, 3, 4 |
| #4 not-loaded   | null → isError         | Test 5 |

Lint/build/test gates in tasks_6.md.
