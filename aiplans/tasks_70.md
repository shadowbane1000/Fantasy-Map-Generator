# Tasks 70 — set_height_exponent AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-height-exponent.ts`:
  - Imports: `errorResult`, `okResult`.
  - Range: `MIN = 1.5`, `MAX = 2.2`.
  - `HeightExponentRuntime { apply(value: number): void }`.
  - `defaultHeightExponentRuntime.apply`:
    - If `document` defined: `(document.getElementById(
      "heightExponentInput") as HTMLInputElement | null)?.value =
      String(value)`.
    - If `localStorage` defined: `setItem("heightExponent",
      String(value))`.
  - Tool schema: `value` (number required, minimum 1.5, maximum
    2.2).
  - Execute: validate finite number in range; try apply; return
    `{ heightExponent: value }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register in `src/ai/index.ts`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-height-exponent.test.ts`:
  - Runtime-injected:
    - Sets value mid-range → apply called with it.
    - Accepts boundaries 1.5 and 2.2.
    - Rejects 1.49, 2.21, NaN, Infinity, non-number.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub document with `#heightExponentInput`.
    - Stub localStorage setItem spy.
    - Apply 1.8 → element.value === "1.8"; setItem(
      "heightExponent", "1.8").
    - Missing element → still succeeds (localStorage written).

## Task 4 — README

- [ ] Row near `set_geography`:
  ```
  | `set_height_exponent`   | Adjust the altitude-change sharpness (Options panel's Exponent slider). Number in [1.5, 2.2]; default 2. Lower = flatter, higher = more dramatic peaks. Affects temperature + biome generation. Passive — applied on next `regenerate_map`. Writes the DOM slider value and localStorage. | "Flatten the terrain — height_exponent 1.6", "Make the mountains harsher — 2.1" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-height-exponent` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_height_exponent tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Options panel Exponent slider.
- Plan writes the same DOM value + localStorage key the UI
  writes. Heightmap regeneration reads
  `+heightExponentInput.value` directly (see main.js:925), so the
  change is picked up on next regenerate_map.
- Boundary enforcement matches the slider's own min/max.

## Verification that tests prove the use case

- Injected-runtime tests cover validation / dispatch.
- Integration test proves DOM + localStorage writes happen.
- Out-of-range tests pin the [1.5, 2.2] contract.
