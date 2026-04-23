# Plan 112 — set_generator_rates AI tool

## Use case

The Options dialog has several sliders that control
generator quantities (active on the next
`regenerate_map`):

- Cultures number (`culturesInput` / `cultures`) — int
  ≥ 1.
- States number (`statesNumber`) — int 0–100.
- Provinces ratio (`provincesRatio`) — int 0–100 (% of
  burgs that become province centers).
- Size variety (`sizeVariety`) — number 0–10 step 0.1
  (expansionism variance).
- Growth rate (`growthRate`) — number 0.1–2 step 0.1
  (how much land stays neutral).
- Burgs number / manors (`manorsInput`) — int 0–1000
  (1000 = auto).
- Religions number (`religionsNumber`) — int 0–50.

Same passive pattern as `set_climate` /
`set_geography`: writes to `window.options`, both
Input/Output DOM elements (where present), and
localStorage (the `data-stored` key). Applied on next
`regenerate_map`.

## Scope

Add one tool: `set_generator_rates(fields)`.

- All fields optional; at least one required.
- Per-field range validation.
- Writes each provided field to:
  - `window.options[field]` (where the field lives in
    options — cultures, statesNumber, provincesRatio,
    sizeVariety, growthRate, manors, religionsNumber
    all live on `options`).
  - Input + Output DOM elements matching the field id.
  - `localStorage[storedKey]`.
- Idempotent: skip fields that already match.

## Implementation

1. **New file `src/ai/tools/set-generator-rates.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - `GeneratorField { optionKey, inputId, outputId,
      storedKey, min, max, integer? }`.
   - `GENERATOR_FIELDS: Record<key, GeneratorField>` for
     the seven fields above.
   - `GeneratorRatesRuntime { apply(field, value) }`
     — writes options + DOM + localStorage.
   - Schema: `cultures`, `states_number`,
     `provinces_ratio`, `size_variety`, `growth_rate`,
     `manors`, `religions_number` (all optional,
     integer or number per field).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-generator-rates.test.ts`:
   - Unit (stubbed):
     - writes one field
     - writes multiple fields
     - rejects empty input
     - range-validates each field
     - integer fields reject non-integer values
     - surfaces runtime errors
   - Integration:
     - stubs window.options + document + localStorage.
     - applies fields; asserts options / DOM /
       localStorage updated.
     - skips undefined fields.

4. **README_AI.md** — row near `set_climate`.

## Verification

- `npm test -- --run src/ai/tools/set-generator-rates`
  green.
- `npm test -- --run` — 1369 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- All 7 fields supported with their correct ranges.
- Range-validated per field.
- Writes to options + DOM + localStorage for each
  provided field.
