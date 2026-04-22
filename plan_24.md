# Plan 24 — Use Case: Set a burg's population

## Status

Iteration 24. 23 AI tools + shared helpers. Baseline 7 warnings / 1
info / 0 errors. 309 tests pass.

## Use Case

**"Set the population of a specific burg."**

The user does this in the Burg Editor by typing a new number in the
`#burgPopulation` input. `changePopulation` in
`public/modules/ui/burg-editor.js:152-158` runs:

```js
pack.burgs[id].population =
  rn(burgPopulation.value / populationRate / urbanization, 4);
```

Displayed population is `raw * populationRate * urbanization` (matches
`list_burgs`). To match the UI's mental model, the tool takes a
*display* population (what the user sees) and internally divides by
the rates before writing.

Prompts:
- *"Set Stormport's population to 50000."*
- *"Give burg 5 a population of 125,000."*

### Success criteria

1. `set_burg_population({burg: 5, population: 50000})` sets
   `pack.burgs[5].population = 50000 / populationRate / urbanization`
   (rounded to 4 decimals).
2. `set_burg_population({burg: "stormport", population: 1500})`
   resolves the ref case-insensitively.
3. Rejects burg 0 (placeholder).
4. Rejects unknown ref.
5. Rejects non-finite / negative / non-number population values.
6. Runtime throws → structured error.
7. Population of 0 is allowed (abandoned settlement).
8. Response reports `{i, name, previousPopulation (display),
   population (display)}`.

## Scope

In-scope:
- `set_burg_population` tool with `BurgPopulationRuntime` seam.
- Runtime encapsulates scaling (reads `window.populationRate` and
  `window.urbanization`).
- Registry + README + tests.

Out-of-scope:
- Toggling port / capital / group type (future iterations).
- Bulk set-all-populations (future).
- Refreshing burg icon sizes (requires regenerating groups — complex,
  not done by the editor either).

## Design

New file: `src/ai/tools/set-burg-population.ts`.

```ts
export interface BurgPopulationRef {
  i: number;
  name: string;
  displayPopulation: number;
}
export interface BurgPopulationRuntime {
  find(ref: number | string): BurgPopulationRef | null;
  setDisplayPopulation(i: number, displayPopulation: number): void;
}
```

Default runtime:
- `find`: `findEntityByRef(pack.burgs, ref)` → compute
  `displayPopulation = (burg.population ?? 0) * pop * urban` with
  the same safe-multiplier fallback used in `list-burgs`.
- `setDisplayPopulation(i, display)`:
  - Compute `internal = display / pop / urban` (using 1 as the
    fallback for non-positive rates, so the tool still works if the
    rates are zero for any reason).
  - Round to 4 decimals.
  - Write `pack.burgs[i].population = internal`.

## Files

Create: `plan_24.md`, `tasks_24.md`,
`src/ai/tools/set-burg-population.ts`,
`src/ai/tools/set-burg-population.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-burg-population.test.ts`) — 8 cases:

1. Numeric id + valid population → `setDisplayPopulation` called.
2. Case-insensitive name + population.
3. Allow 0.
4. Reject burg 0 placeholder.
5. Reject unknown ref.
6. Reject invalid population (negative, NaN, Infinity, string,
   object).
7. Reject invalid ref types.
8. Runtime throws → error.

Plus a focused unit test for the scaling in a small pure helper:

9. `scaleDisplayToInternal(display, rates)` — verifies the formula
   and 4-decimal rounding, including the non-positive-rate fallback.

## Plan ↔ tasks ↔ tests verification

Every criterion maps to a test. Scaling extracted to a pure helper
for direct coverage.

Lint / test / build gates in tasks_24.md.
