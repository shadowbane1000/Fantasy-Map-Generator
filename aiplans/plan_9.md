# Plan 9 — Use Case: List burgs

## Status

Iteration 9. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`,
`list_states`, `rename_state`, `focus_on_map`. Baseline 7 warnings /
1 info / 0 errors. 134 tests pass.

## Use Case

**"List the burgs (cities/towns) on the current map."**

The user sees this in the **Burgs Overview** panel
(`public/modules/ui/burgs-overview.js`), which shows each burg with
its state, culture, population, whether it is a capital, whether it's
a port, and coordinates. Population is
`burg.population * populationRate * urbanization`.

Prompts:
- *"List the biggest cities on this map"*
- *"Which burgs are in Altaria?"*
- *"Show me the ports"*

The AI can already `focus_on_map` a burg by name (iter 8), but
doesn't know which burgs *exist*. This completes the read pair for
burgs, mirroring `list_states`.

### Success criteria

1. `list_burgs()` returns `{ok: true, total, limit, offset, burgs}`.
   Each entry: `{i, name, x, y, population, state, culture, capital,
   port, type}` where:
   - `state` is the state name (via `pack.states[burg.state]?.name`,
     or `null`).
   - `culture` is the culture name (via `pack.cultures`).
   - `capital` is a boolean (`!!burg.capital`).
   - `port` is a boolean (`!!burg.port`).
   - `population` is `round(burg.population * populationRate *
     urbanization)` when those factors are finite positives;
     otherwise a sensible fallback (raw `burg.population`).
   - `type` is `burg.type` or `null`.
2. Skips index 0 and `removed` entries.
3. Optional `limit` 1–500 (default 100), `offset` ≥ 0.
4. Optional `state` filter: numeric id → only burgs in that state;
   case-insensitive string → resolves to state id first, then filters.
5. Optional `capital_only: boolean`.
6. Optional `port_only: boolean`.
7. Graceful error when the map isn't ready.

## Scope

In-scope: `list_burgs` tool, paging, state/capital/port filters,
README entry, tests.

Out-of-scope: burg editing (future iteration).

## Design

New file: `src/ai/tools/list-burgs.ts`.

```ts
export interface BurgSummary {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  state: string | null;
  culture: string | null;
  capital: boolean;
  port: boolean;
  type: string | null;
}

export interface BurgsRuntime {
  readBurgs(filters: ReadFilters): BurgSummary[] | null;
}
```

Default runtime reads `window.pack.burgs`, `window.populationRate`,
`window.urbanization`, `window.pack.states`, `window.pack.cultures`,
mapping each burg to `BurgSummary`.

Since filtering on state-by-name requires a lookup, we'll implement
the filter inside the runtime's `readBurgs` (which has access to the
full pack), passing a normalized `ReadFilters` object — or do the
state-id resolution in the tool using a helper export. To keep the
runtime seam simple, the runtime returns *all* mapped burgs, and the
tool applies filters post-hoc; state-by-name is handled by a separate
helper `resolveStateRef(ref): number | null` that the runtime also
exposes.

Actually, the cleanest design:
- `readBurgs(): BurgSummary[] | null` (unfiltered, full list).
- `resolveStateRef(ref: number | string): number | null`.

Then the tool:
1. Validates paging + filter types.
2. Calls `readBurgs`; if null → error.
3. If `state` filter present, resolves via `resolveStateRef`; if
   unresolved → error.
4. Applies state/capital/port filters.
5. Slices by offset/limit.

`BurgSummary` does not include `stateId` today; to support the `state`
filter we instead include `stateId` in the summary (but hide it from
the human? keep it — it's useful). Let's include `stateId: number`
and `cultureId: number` on the summary.

## Files

Create: `plan_9.md`, `tasks_9.md`,
`src/ai/tools/list-burgs.ts`,
`src/ai/tools/list-burgs.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-burgs.test.ts`):

1. Full list when no filters/paging.
2. Paging — `limit`/`offset` slice.
3. Invalid `limit` (0, 501, 1.5, "x") / `offset` (-1, 1.5, "x") →
   errors.
4. `capital_only: true` returns only capitals.
5. `port_only: true` returns only ports.
6. `state` filter by id returns matching burgs.
7. `state` filter by name (case-insensitive) returns matching burgs.
8. `state` filter unresolved name → structured error.
9. Runtime returns null → `{isError: true}`.
10. Dedicated tests for a pure `readBurgsFromPack(pack, rates)` helper
    confirming population math and field mapping.

## Plan ↔ tasks ↔ tests verification

| Criterion              | Implementation          | Test |
| ---------------------- | ----------------------- | ---- |
| #1 shape               | `BurgSummary` mapping   | 1, 10 |
| #2 skip 0/removed      | helper filter           | 10 |
| #3 paging              | validate + slice        | 2, 3 |
| #4 state filter id     | post filter             | 6 |
| #4 state filter name   | `resolveStateRef`       | 7, 8 |
| #5 capital_only        | boolean filter          | 4 |
| #6 port_only           | boolean filter          | 5 |
| #7 error path          | runtime null            | 9 |

Lint / test / build gates in tasks_9.md.
