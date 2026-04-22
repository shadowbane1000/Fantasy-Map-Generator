# Tasks 57 — set_climate AI tool

## Task 1 — Field configs

- [ ] Define internal `ClimateField`:
  ```ts
  interface ClimateField {
    optionKey: "temperatureEquator" | "temperatureNorthPole"
               | "temperatureSouthPole" | null; // null for precip
    inputId: string;
    outputId: string;
    storedKey: string;
    min: number;
    max: number;
  }
  ```
- [ ] Static map: `temperature_equator`, `temperature_north_pole`,
  `temperature_south_pole`, `precipitation` → their configs.
  - temperature_equator: { optionKey: "temperatureEquator",
    inputId: "temperatureEquatorInput",
    outputId: "temperatureEquatorOutput",
    storedKey: "temperatureEquator", min: -50, max: 50 }.
  - temperature_north_pole / temperature_south_pole similar.
  - precipitation: { optionKey: null, inputId: "precInput",
    outputId: "precOutput", storedKey: "prec", min: 0, max: 500 }.

## Task 2 — Implement tool

- [ ] `src/ai/tools/set-climate.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult`.
  - `WindowOptions` shape: partial, writable numbers.
  - `ClimateRuntime { apply(field: ClimateField, value: number): void }`.
  - `defaultClimateRuntime.apply`:
    - If `field.optionKey`: get/ensure `options` via `getGlobal`;
      throw if null; assign numeric.
    - If `document` present: `getElementById(inputId)?.value =
      String(value); getElementById(outputId)?.value = String(value)`.
    - If `localStorage` present: `setItem(field.storedKey,
      String(value))`.
  - Tool schema: four optional numbers.
  - Execute:
    - Validate at least one.
    - Per field: if provided, must be finite number in range; else
      error.
    - For each provided: try/catch `runtime.apply(field, value)`.
    - Return applied object.

## Task 3 — Register

- [ ] Import, barrel re-export, `registry.register(setClimateTool)`
  near other passive-setter tools (after
  `setMeasurementUnitsTool`).

## Task 4 — Tests

- [ ] `src/ai/tools/set-climate.test.ts`:
  - Runtime-injected:
    - Set temperature_equator alone → apply called once with
      matching config + 30.
    - Set all four → apply called 4 times in order.
    - Rejects missing fields (no args).
    - Rejects non-number / NaN / Infinity values.
    - Rejects values outside the per-field range.
    - Surfaces runtime errors.
  - Default-runtime integration:
    - Stub `globalThis.options = {}`; `globalThis.document =
      { getElementById }` with fake input/output elements; stub
      `globalThis.localStorage = { setItem }`.
    - Call tool; assert options.temperatureEquator updated, both
      element `.value`s set to string form, localStorage.setItem
      called with stored key + string value.
    - Precipitation path: options untouched, both DOM + localStorage
      updated.
    - Temperature path without options in globals → error surfaced.

## Task 5 — README

- [ ] Row below `set_measurement_units`:
  ```
  | `set_climate`           | Tune the World Configurator's climate knobs (passive — applied on next `regenerate_map`): `temperature_equator`, `temperature_north_pole`, `temperature_south_pole` (°C, [-50, 50]) and `precipitation` (%, [0, 500]). Any combination in one call. Writes `window.options.*`, both Input/Output DOM elements, and localStorage — matching the UI's own persistence. | "Make the world colder — poles at -40", "Bump precipitation to 180", "Equator 32°C, north pole -30, south pole -20" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-climate` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1 baseline intact.
- [ ] `npm run build` succeeds (no TS errors).

## Task 7 — Commit

- [ ] `feat(ai): add set_climate tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new tool) → Tasks 1, 2.
- Plan step 2 (register) → Task 3.
- Plan step 3 (tests) → Task 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: World Configurator climate sliders, unreachable by AI.
- Plan writes each of the three temperature fields to
  `options.*` (where the next `climate.generate()` reads them)
  AND updates the paired DOM input+output elements so the UI
  stays in sync, AND persists to localStorage so page reload
  keeps the change — exactly the three side-effects the UI's own
  change handler produces.
- Precipitation is DOM-only on the pack side (no `options.prec`
  key), so the tool writes only the DOM + localStorage; follow-up
  `regenerate_map` reads `precInput.value` directly.

## Verification that tests prove the use case

- Injected-runtime tests cover every validation branch (missing,
  non-numeric, out-of-range) and happy path dispatch.
- Integration test proves the three side-effects happen together
  for a temperature write, and the DOM-only path for precipitation.
- Range boundaries tested: -50 and 50 inclusive, -51 and 51 rejected.
