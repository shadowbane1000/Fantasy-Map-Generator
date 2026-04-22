# Plan 56 — set_measurement_units AI tool

## Use case

The Options panel (src/index.html:5245–5350, driven by
`public/modules/ui/options.js`) lets the user pick display units for:
- `distanceUnit` (mi, km, lg, vr, nmi, nlg, or custom)
- `areaUnit` (a short free-form suffix; "square" means append ² to
  the distance unit)
- `heightUnit` (ft, m, f, or custom)
- `temperatureScale` (°C, °F, K, °R, °De, °N, °Ré)

These preferences are passive — they only change how existing
measurements are rendered. The UI persists them to localStorage via
a `change` listener that reads `data-stored` and stores the new
value.

The chat has `set_world_rates` (populationRate / urbanization /
urbanDensity) and `set_year_and_era`, but the display-unit knobs
are unreachable. Prompts like "switch distances to km and heights
to meters" currently have no AI path.

## Scope

Add one tool: `set_measurement_units` — accepts any combination of
`distance`, `area`, `height`, `temperature`. At least one must be
provided. For each supplied unit:

1. Validate it's a non-empty string. Canonical values are enforced
   case-insensitively (and canonicalized to the UI's own values —
   e.g. "celsius" → "°C"); any other string is accepted as a custom
   unit label (matching how the UI allows "custom_name"). Distance /
   height / temperature accept the enumerated canonical values OR
   any non-empty string. Area is already free-form.
2. Write the value to the matching DOM element's `.value`
   (`distanceUnitInput`, `areaUnit`, `heightUnit`,
   `temperatureScale`).
3. Persist via `localStorage.setItem(storedKey, value)` to match
   the `storeValueIfRequired` handler's behaviour.

Canonical sets (used for case-insensitive alias resolution, not for
rejection):
- distance: mi, km, lg, vr, nmi, nlg + common display names like
  "mile" / "miles" → "mi", "kilometer" / "kilometers" → "km",
  "league" → "lg", "nautical mile" → "nmi", etc.
- height: ft, m, f + "foot"/"feet" → "ft", "meter"/"meters" → "m",
  "fathom"/"fathoms" → "f".
- temperature: °C, °F, K, °R, °De, °N, °Ré + "celsius" → "°C",
  "fahrenheit" → "°F", "kelvin" → "K", "rankine" → "°R",
  "delisle" → "°De", "newton" → "°N", "réaumur"/"reaumur" → "°Ré".
- area: free-form text (no canonical set); use "square" to append
  ² to the distance unit.

## Implementation

1. **New file `src/ai/tools/set-measurement-units.ts`**:
   - Imports: `createAliasResolver`, `errorResult`, `okResult` from
     `_shared`.
   - Canonical lookups for distance / height / temperature via
     `createAliasResolver`, but the resolver returns null for
     unknown strings — we want to *fall through to the raw value*
     instead of erroring. So wrap each resolver:
     ```ts
     function canonDistance(v: string): string {
       return resolveDistance(v) ?? v.trim();
     }
     ```
   - `MeasurementUnitsRuntime {
       setUnit(key: "distanceUnit" | "areaUnit" | "heightUnit" | "temperatureScale",
               elementId: string, value: string): void
     }`.
   - `defaultMeasurementUnitsRuntime.setUnit`:
     - Skip if `document` undefined (tool ran outside browser).
     - Find the element by id; throw if missing.
     - Set `element.value = value`.
     - `localStorage.setItem(key, value)` if `localStorage` defined.
   - Tool schema: `distance`, `area`, `height`, `temperature` —
     each an optional string.
   - Execute:
     - Validate at least one supplied.
     - For each supplied: validate non-empty string, canonicalize,
       invoke `runtime.setUnit(...)`.
     - Collect the applied values into the response.

2. **Register** in `src/ai/index.ts` — import, barrel, register.

3. **Tests `src/ai/tools/set-measurement-units.test.ts`**:
   - Runtime-injected:
     - Sets distance alone.
     - Sets all four together.
     - Canonicalizes "celsius" → "°C".
     - Canonicalizes "miles" → "mi".
     - Accepts a free-form area label.
     - Errors when nothing supplied.
     - Rejects invalid types (non-string / empty / whitespace).
     - Surfaces runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.document` + `globalThis.localStorage`.
     - Call the tool; assert element.value updated + localStorage
       write.

4. **README_AI.md** — row under `set_year_and_era`.

## Verification

- `npm test -- --run src/ai/tools/set-measurement-units` green.
- `npm test -- --run` — 698 before.
- `npm run lint` — 7/1 baseline.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can issue `set_measurement_units({ distance: "km", height: "m",
  temperature: "celsius" })` and the Options panel selects reflect
  the change + localStorage persists.
- Common prose terms ("miles", "kilometers", "fahrenheit") map to
  the UI's canonical values.
- Area stays free-form (matching the UI's free-text input).
