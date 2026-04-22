# Plan 12 — Use Case: List cultures

## Status

Iteration 12. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`, `list_states`,
`rename_state`, `focus_on_map`, `list_burgs`, `rename_burg`,
`set_year_and_era`. Baseline 7 warnings / 1 info / 0 errors. 168 tests
pass.

## Use Case

**"List the cultures on the current map."**

The user sees this in the Cultures Editor panel, which shows each
culture with its color, type ("Generic", "River", "Nomadic", …), name
base (namesbase index), area, cells, and population (rural + urban,
scaled by `populationRate`).

Prompts:
- *"List the cultures."*
- *"Which culture has the most cells?"*
- *"What type is the Highlanders culture?"*

The AI already can list states and burgs with a `culture` name; this
tool lets it inspect the culture registry directly, which is needed
before any future `rename_culture` / `change_culture_color` tools.

### Success criteria

1. `list_cultures()` returns `{ok, total, limit, offset, cultures}`.
   Each entry: `{i, name, color, type, cells, area, population, base,
   shield, code}`.
2. Skips index 0 ("Wildlands") and `removed` entries.
3. `population = round((rural + urban) * populationRate)` when the
   rate is a finite positive number; else raw `rural + urban`.
4. Paginated: `limit` 1–500 (default 100), `offset` ≥ 0.
5. Graceful error when `pack` / `pack.cultures` is missing.

## Scope

In-scope:
- `list_cultures` tool with `CulturesRuntime` seam.
- Pure `readCulturesFromPack(pack, populationRate)` helper.
- Registry + README.
- Tests (tool + helper).

Out-of-scope:
- Culture editing (future iteration).

## Design

New file: `src/ai/tools/list-cultures.ts`.

```ts
export interface CultureSummary {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  cells: number;
  area: number;
  population: number;
  base: number | null;
  shield: string | null;
  code: string | null;
}
export interface CulturesRuntime {
  readCultures(): CultureSummary[] | null;
}
```

Default runtime: reads `window.pack.cultures`, `window.populationRate`.

Executor: validates paging, calls runtime, slices, returns.

## Files

Create: `plan_12.md`, `tasks_12.md`,
`src/ai/tools/list-cultures.ts`,
`src/ai/tools/list-cultures.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-cultures.test.ts`):

1. Full list, default paging.
2. Honors `limit` / `offset`.
3. Rejects invalid paging.
4. Null runtime → error.
5. `readCulturesFromPack` helper tests:
   - Skips index 0 + removed.
   - Fields mapped correctly (color, type, shield, code, base as
     number, area/cells pass-through).
   - Population scaling (populationRate > 0 vs invalid).
   - Null when pack missing.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 shape  | `CultureSummary` mapping | 1, 5 |
| #2 skip   | helper filter | 5 |
| #3 pop    | helper scaling | 5 |
| #4 paging | validate + slice | 2, 3 |
| #5 error  | null → isError | 4 |

Lint / test / build gates in tasks_12.md.
