# Plan 57 — set_climate AI tool

## Use case

The World Configurator (`src/index.html:2508+`) exposes climate
knobs that drive temperature/precipitation during map regeneration:

- Temperature at the equator (`options.temperatureEquator`, °C,
  [-50, 50]).
- Temperature at the north pole (`options.temperatureNorthPole`).
- Temperature at the south pole (`options.temperatureSouthPole`).
- Precipitation (`prec` / `precInput.value`, %, [0, 500]).

Each has number + range inputs (both `data-stored`), persisted to
localStorage on change. These are passive — consumed by the next
`regenerate_map`.

The chat has `set_world_rates` (population knobs) and
`set_year_and_era` (in-fiction date) but no way to control climate.
Narrative prompts like "make the world colder" or "bump
precipitation up" can't land.

## Scope

Add one tool: `set_climate` — any combination of:

- `temperature_equator` (number, [-50, 50]).
- `temperature_north_pole` (number, [-50, 50]).
- `temperature_south_pole` (number, [-50, 50]).
- `precipitation` (number, [0, 500]).

At least one required. For each provided value:

1. Temperature settings: write `options.X = value`, update both
   `#xInput` and `#xOutput` DOM elements' `.value`, persist to
   localStorage under the matching `data-stored` key (camelCase).
2. Precipitation: no `options.*` key; just write both `#precInput`
   and `#precOutput` DOM values and `localStorage.setItem("prec",
   value)`.

Follow the same "DOM + localStorage" pattern as
`set_measurement_units` so Options-panel state stays in lockstep.

## Implementation

1. **New file `src/ai/tools/set-climate.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult` from `_shared`.
   - Shape: `ClimateField` config describing each field (key on
     `window.options`, `inputId`, `outputId`, `storedKey`, min, max).
   - `ClimateRuntime { apply(field, value): void }`.
   - `defaultClimateRuntime.apply(field, value)`:
     - If `field.optionKey`: `options = getGlobal<WindowOptions>("options")`;
       throw if absent; `options[field.optionKey] = value`.
     - If `document` present: update `#inputId` and `#outputId`
       `.value` to `String(value)`.
     - If `localStorage` present: `setItem(storedKey, String(value))`.
   - Tool schema: four optional number fields, range-validated.
   - Execute: validate at least one; per field validate range;
     call `runtime.apply(field, value)`; return applied map.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-climate.test.ts`**:
   - Runtime-injected:
     - Set temperature_equator alone → runtime.apply called with
       the right config + 30.
     - Set all four → runtime.apply called 4×.
     - Errors when nothing supplied.
     - Rejects out-of-range values (-51, 51, 501 for precip, etc.).
     - Rejects non-number / NaN / infinite.
     - Surfaces runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.options`, `globalThis.document`,
       `globalThis.localStorage` with spies.
     - Call tool; assert `options.temperatureEquator` updated, both
       input and output elements' `.value` set, `localStorage.setItem`
       called with string value.
     - Precipitation path: no options mutation, both DOM and
       localStorage updated.
     - Missing options → error surfaced for temperature path.

4. **README_AI.md** — row under `set_measurement_units`.

## Verification

- `npm test -- --run src/ai/tools/set-climate` green.
- `npm test -- --run` — 712 before.
- `npm run lint` — 7/1.
- `npm run build` — TS clean.

## Success criteria

- Tool registered and callable.
- AI can say "bump equator temperature to 32, drop north pole to
  -35" and both `options.*` + DOM + localStorage reflect the change.
- Out-of-range values rejected.
- Missing-element soft failure: if a DOM input isn't mounted, the
  tool should still succeed (document may not have them loaded in
  non-interactive contexts) — but at minimum the options/localStorage
  mutations happen. Actually, mirror set_measurement_units'
  hard-fail on missing elements; the Options panel is always
  rendered once the app loads.
