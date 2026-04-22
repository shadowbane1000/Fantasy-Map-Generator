# Plan 70 — set_height_exponent AI tool

## Use case

The Options panel has a `heightExponent` slider
(`src/index.html:5294`, data-stored "heightExponent", range 1.5–2.2,
step 0.01, default 2). It controls altitude change sharpness —
lower values flatten terrain, higher values exaggerate peaks. It
affects temperature (via altitude) and hence biomes, so it's a
narrative dial for "a harsh, mountainous world" vs "gentle
rolling plains".

The chat has `set_climate` (temperatures + precipitation) and
`set_geography` (map size / latitude / longitude) and
`set_measurement_units` — but no knob for altitude sharpness.
One more Options-panel slider to complete the passive-setting
surface the chat can adjust before a regenerate.

## Scope

Add one tool: `set_height_exponent(value)`.

- `value` required finite number in [1.5, 2.2].
- Writes to the `#heightExponentInput` DOM element's `.value`
  (slider-input web component).
- Persists via `localStorage.setItem("heightExponent", …)` to
  match the UI's `storeValueIfRequired` handler.
- Passive: next `regenerate_map` reads it.

## Implementation

1. **New file `src/ai/tools/set-height-exponent.ts`**:
   - Imports: `errorResult`, `okResult`.
   - `HeightExponentRuntime { apply(value: number): void }`.
   - `defaultHeightExponentRuntime.apply(value)`:
     - If `document` present: set `#heightExponentInput`.value to
       `String(value)`.
     - If `localStorage` present: setItem("heightExponent", …).
   - Range const `MIN = 1.5`, `MAX = 2.2`.
   - Tool schema: `value` (number required, minimum 1.5,
     maximum 2.2).
   - Execute: validate; try `runtime.apply(value)`; return
     `{ heightExponent: value }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-height-exponent.test.ts`**:
   - Runtime-injected:
     - Sets value in range → apply called with it.
     - Accepts boundaries 1.5 and 2.2.
     - Rejects out-of-range (1.49, 2.21) and non-number /
       NaN / Infinity.
     - Surface runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.document` with fake
       `#heightExponentInput`.
     - Stub `globalThis.localStorage` setItem spy.
     - Apply 1.8 → element.value === "1.8", setItem called with
       ("heightExponent", "1.8").
     - Missing element → still succeeds, localStorage still
       written.

4. **README_AI.md** — row near `set_geography`.

## Verification

- `npm test -- --run src/ai/tools/set-height-exponent` green.
- `npm test -- --run` — 858 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can tune terrain sharpness, passive-applied on next
  regenerate.
- Consistent with set_geography / set_measurement_units
  DOM+localStorage pattern.
