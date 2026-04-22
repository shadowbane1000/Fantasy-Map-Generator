# Plan 26 — Use Case: Adjust the world population / urbanization rates

## Status

Iteration 26. 25 AI tools. Baseline 7 warnings / 1 info / 0 errors.
330 tests pass.

## Use Case

**"Tweak the population-rate, urbanization, or urban-density sliders
in the Units Editor."**

These three rates scale displayed population across the whole map:

| Slider              | Global         | Effect                              |
| ------------------- | -------------- | ----------------------------------- |
| `populationRateInput`  | `populationRate` | People per internal population unit. |
| `urbanizationInput`    | `urbanization`   | Urban-to-rural ratio.              |
| `urbanDensityInput`    | `urbanDensity`   | People per cell of urban area.     |

The Units Editor binds these inputs to `changePopulationRate` /
`changeUrbanizationRate` / `changeUrbanDensity`
(`public/modules/ui/units-editor.js:76-86`). Each handler reads
`this.value` and assigns the matching top-level `let` binding from
`public/main.js:240-243`. Those `let`s are classic-script globals
(accessible by bare name from other classic scripts but *not* as
`window.populationRate`), so the only reliable way to change them is
to update the `<input>` value and dispatch the `change` event so the
handler runs.

Prompts:
- *"Double the population rate."*
- *"Set urbanization to 1.3."*
- *"Change the population rate to 500 and urbanization to 0.8."*

### Success criteria

1. `set_world_rates({population_rate: 2000})` sets
   `#populationRateInput.value = "2000"` and dispatches a bubbling
   `change` event so the Units Editor's handler updates the global.
2. `set_world_rates({urbanization: 1.3})` → same on
   `#urbanizationInput`.
3. `set_world_rates({urban_density: 10})` → same on
   `#urbanDensityInput`.
4. Multiple fields may be set in one call; each dispatches
   independently.
5. At least one of the three must be provided; no fields → error.
6. Values must be finite numbers; each slider has its own sensible
   range (all > 0, `urbanization` ≤ 100, `population_rate` ≤ 1e6,
   `urban_density` ≤ 1e6).
7. Missing input element → structured error (map hasn't loaded yet).
8. Response includes `previous` and `current` triples so the AI can
   report what changed.

## Scope

In-scope:
- `set_world_rates` tool with `WorldRatesRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Other option sliders (heightExponent, temperatureEquator, map
  size) — each worth its own tool.
- Regenerating populations after a rate change. The existing UI
  doesn't regenerate either; values just re-render where they're
  read. Users would re-open overviews to see the impact.

## Design

New file: `src/ai/tools/set-world-rates.ts`.

```ts
export interface WorldRates {
  populationRate: number | null;
  urbanization: number | null;
  urbanDensity: number | null;
}
export interface WorldRatesRuntime {
  read(): WorldRates;
  write(patch: Partial<WorldRates>): void;
}
```

Default runtime:
- `read()`: reads each `<input>`'s `.value` (parsed via
  `Number.parseFloat`); falls back to null when the input is missing.
- `write(patch)`: for each provided field:
  1. Find the matching input.
  2. `input.value = String(newValue)`.
  3. `input.dispatchEvent(new Event("change", {bubbles: true}))`.
  If the input is missing, throw "…input is not available yet".

Executor:
1. Parse and validate each field (per the ranges in #6).
2. Require ≥1 field.
3. Snapshot previous rates via `runtime.read()`.
4. Call `runtime.write(patch)`; catch throws.
5. Return `{previous, current: {...previous, ...patch}}`.

## Files

Create: `plan_26.md`, `tasks_26.md`,
`src/ai/tools/set-world-rates.ts`,
`src/ai/tools/set-world-rates.test.ts`.

Modify: `src/ai/index.ts` (register + export),
`README_AI.md` (tool-table row).

## Testing plan

Unit (`set-world-rates.test.ts`):

1. `{population_rate: 2000}` → `write({populationRate: 2000})`
   called; `previous.populationRate` echoed.
2. `{urbanization: 1.3}` → same shape.
3. `{urban_density: 10}` → same shape.
4. Multi-field patch → `write` called once with all three fields.
5. No fields → error, `write` not called.
6. Invalid values (negative, 0, NaN, Infinity, string, above
   bounds) → field-specific error.
7. Runtime throws → error surfaced.
8. Non-object input → error.

Plus a pure validator test exposed as `validateRatesInput(input)`:

9. Full matrix of valid/invalid combinations for all 3 fields.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Runtime seam decouples dispatch mechanics
from the validator, so the validator has full pure-function coverage.

Lint / test / build gates in tasks_26.md.
