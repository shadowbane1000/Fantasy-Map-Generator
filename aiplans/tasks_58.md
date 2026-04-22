# Tasks 58 — set_geography AI tool

## Task 1 — Field configs + tool

- [ ] `src/ai/tools/set-geography.ts`:
  - Imports: `errorResult`, `okResult`.
  - `GeographyField { inputId, outputId, storedKey, min, max }`.
  - `GEOGRAPHY_FIELDS`:
    - map_size: inputId "mapSizeInput", outputId "mapSizeOutput",
      storedKey "mapSize", [1, 100].
    - latitude: inputId "latitudeInput", outputId "latitudeOutput",
      storedKey "latitude", [0, 100].
    - longitude: inputId "longitudeInput", outputId
      "longitudeOutput", storedKey "longitude", [0, 100].
  - `GeographyRuntime { apply(field, value): void }`.
  - `defaultGeographyRuntime.apply`:
    - If `document` available: set `#inputId`.value, `#outputId`.value
      (skip if element missing).
    - If `localStorage` available: `setItem(storedKey, String(value))`.
  - Tool schema: three optional numbers with min/max per field.
  - Execute: at-least-one check, per-field validation, invoke
    runtime, return applied map. Same structure as `set_climate`.

## Task 2 — Register

- [ ] Import `setGeographyTool`, barrel re-export, register near
  `setClimateTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-geography.test.ts`:
  - Injected-runtime:
    - Set map_size alone → apply called once.
    - Set all three → apply called 3×.
    - Errors when nothing supplied.
    - Rejects non-number / NaN / infinite.
    - Rejects out-of-range for each field.
    - Accepts boundary values (1, 100, 0, 100).
    - Surfaces runtime failures.
  - Default-runtime integration:
    - Stub document with fake input + output elements for the 6
      ids, stub localStorage.
    - Call tool; assert each `.value` and setItem per key.
    - Test: when input element is missing, tool still succeeds and
      localStorage still writes.

## Task 4 — README

- [ ] Add row under `set_climate`:
  ```
  | `set_geography`         | Tune the World Configurator's geographic framing (passive — applied on next `regenerate_map`): `map_size` (%, [1, 100]), `latitude` (0 = north pole, 50 = equator, 100 = south pole), `longitude` (0 = west, 50 = prime meridian, 100 = east). Any combination. Updates paired Input + Output elements and localStorage — same side-effects as dragging the sliders. | "Shift the map south — latitude 80", "Make this a tiny slice of the world, map_size: 5", "Center on prime meridian — longitude 50" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-geography` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_geography tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: World Configurator geographic sliders unreachable to AI.
- Plan writes both DOM inputs and localStorage — the only two
  side-effects the UI produces (these knobs have no `options.*`
  backing field).
- Follow-up `regenerate_map` picks up the new DOM values just as
  it does when the user drags the sliders.

## Verification that tests prove the use case

- Injected-runtime tests cover every validation + dispatch branch.
- Integration test proves paired-element update + localStorage
  persistence.
- Missing-element soft-fail test covers the case where one input
  (e.g. a minimal dialog view) isn't mounted — tool still applies
  what it can.
