# Tasks 121 — set_heightmap_options AI tool

- [ ] Create `src/ai/tools/set-heightmap-options.ts`:
  - Imports: errorResult, okResult from `./_shared`.
  - Internal config: 3 fields.
    - allow_erosion:
      { kind: "bool", inputId: "allowErosion",
        outputId: null, storedKey: "allowErosion" }.
    - resolve_depressions_steps:
      { kind: "int", inputId:
        "resolveDepressionsStepsInput",
        outputId: "resolveDepressionsStepsOutput",
        storedKey: "resolveDepressionsSteps",
        min: 0, max: 1000 }.
    - lake_elevation_limit:
      { kind: "int", inputId:
        "lakeElevationLimitInput",
        outputId: "lakeElevationLimitOutput",
        storedKey: "lakeElevationLimit",
        min: 0, max: 80 }.
  - Exports:
    - HEIGHTMAP_OPTION_KEYS readonly list.
    - `HeightmapOptionsRuntime { apply }`.
    - `defaultHeightmapOptionsRuntime.apply(key,
      value)`:
      - For bool: checkbox.checked = value; output
        ignored; localStorage.setItem(storedKey,
        String(value)).
      - For int: input.value + output.value = String(
        value); localStorage.setItem(storedKey,
        String(value)).
    - `createSetHeightmapOptionsTool(runtime?)` and
      `setHeightmapOptionsTool`.
  - Tool name: `set_heightmap_options`.
  - Description: references Options heightmap controls,
    notes passive behavior.
  - Schema: the 3 optional properties with correct
    types/ranges.
  - Validation:
    - typeof allow_erosion !== "boolean" → error (when
      provided).
    - typeof int fields !== "number" || !integer || out
      of range → error.
    - At least one field required.
  - Return payload: `{ applied: [{name, value}] }`.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write `set-heightmap-options.test.ts`:
  - Unit (stubbed):
    - writes single field (bool)
    - writes single field (int)
    - writes multiple
    - rejects empty input
    - rejects non-boolean for allow_erosion
    - rejects non-integer for int fields
    - rejects out-of-range
    - surfaces runtime errors
  - `defaultHeightmapOptionsRuntime (integration)`:
    - stubs document.getElementById +
      localStorage.setItem.
    - allow_erosion writes checkbox.checked +
      localStorage.
    - int fields write input + output + localStorage.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- Three fields covered with correct types/ranges.
- Passive pattern: DOM + localStorage, no
  window.options needed since these fields are read
  directly from DOM.

## Verification: plan → use case

- UI: user drags slider or toggles checkbox → DOM +
  localStorage updated. Tool does the same.

## Verification: tests → regressions

- If a field's range wasn't validated, boundary tests
  fail.
- If apply skipped the output element for int fields,
  integration test fails.
- If bool field's checked isn't written, assertion
  fails.
