# Tasks 112 — set_generator_rates AI tool

- [ ] Create `src/ai/tools/set-generator-rates.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `GeneratorField { optionKey, inputId, outputId,
       storedKey, min, max, integer }`.
    - `GENERATOR_FIELDS` record for the 7 fields:
      - cultures:     { optionKey: "cultures",
                        inputId: "culturesInput",
                        outputId: "culturesOutput",
                        storedKey: "cultures",
                        min: 1, max: 100, integer: true }
      - states_number:{ optionKey: "statesNumber",
                        inputId: "statesNumber",
                        outputId: null,
                        storedKey: "statesNumber",
                        min: 0, max: 100, integer: true }
      - provinces_ratio: { optionKey: "provincesRatio",
                        inputId: "provincesRatio",
                        outputId: null,
                        storedKey: "provincesRatio",
                        min: 0, max: 100, integer: true }
      - size_variety: { optionKey: "sizeVariety",
                        inputId: "sizeVariety",
                        outputId: null,
                        storedKey: "sizeVariety",
                        min: 0, max: 10, integer: false }
      - growth_rate:  { optionKey: "growthRate",
                        inputId: "growthRate",
                        outputId: null,
                        storedKey: "growthRate",
                        min: 0.1, max: 2, integer: false }
      - manors:       { optionKey: "manors",
                        inputId: "manorsInput",
                        outputId: "manorsOutput",
                        storedKey: "manors",
                        min: 0, max: 1000, integer: true }
      - religions_number: { optionKey: "religionsNumber",
                        inputId: "religionsNumber",
                        outputId: null,
                        storedKey: "religionsNumber",
                        min: 0, max: 50, integer: true }
    - `GeneratorRatesRuntime { apply(field, value) }`.
    - `defaultGeneratorRatesRuntime.apply`:
      - Write `window.options[field.optionKey] = value`
        if options present.
      - Write DOM: `document.getElementById(inputId).value =
        String(value)`; same for outputId if present
        (outputId may be null).
      - Write localStorage[field.storedKey].
    - `createSetGeneratorRatesTool(runtime?)` and
      `setGeneratorRatesTool`.
  - Tool name: `set_generator_rates`.
  - Description: references Options dialog sliders,
    mentions passive (applied on next regenerate_map).
  - Schema: all 7 optional fields with per-field
    minimum / maximum.
  - Validation:
    - At least one field provided.
    - Per field: typeof value === number && finite,
      range check, integer check (if field.integer).
  - Return payload: `{ applied: [{name, previous, value}] }`
    — previous values read from window.options before
    write (best-effort).

- [ ] Register in `src/ai/index.ts`:
  - Import near setGeographyTool.
  - Barrel re-export.
  - `registry.register(setGeneratorRatesTool)`.

- [ ] Write `src/ai/tools/set-generator-rates.test.ts`:
  - Unit (stubbed):
    - writes single field
    - writes multiple fields
    - rejects when all fields omitted
    - rejects out-of-range per field
    - rejects non-integer for integer fields
    - rejects non-finite values
    - surfaces runtime errors
  - `defaultGeneratorRatesRuntime (integration)`:
    - stubs window.options, document with a minimal
      getElementById that tracks the values we set,
      localStorage.
    - writes fields; asserts options, DOM, localStorage
      updated.
    - handles fields with no outputId (writes only input).

- [ ] Update `README_AI.md` — row near `set_climate`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_generator_rates tool`.

## Verification: tasks → plan

- 7 fields covered with correct IDs and ranges.
- Passive (data-only + DOM + localStorage) — matches
  set_climate pattern.

## Verification: plan → use case

- UI sliders update window.options + DOM + localStorage;
  tool does the same for each provided field.

## Verification: tests → regressions

- If a field's range is wrong, boundary tests fail.
- If integer check drops, fractional-input tests
  fail.
- If apply skips DOM for a field with outputId, that
  field's DOM assertion fails.
- If at-least-one validation dropped, the no-fields
  test fails.
