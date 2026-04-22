# Tasks 56 — set_measurement_units AI tool

## Task 1 — Canonical lookups

- [ ] In `src/ai/tools/set-measurement-units.ts`, define
  alias-resolvers via `createAliasResolver`:
  - `DISTANCE_CANONICAL = ["mi","km","lg","vr","nmi","nlg"] as const;`
    aliases:
    - "mile"/"miles" → "mi",
    - "kilometer"/"kilometers"/"kilometre"/"kilometres" → "km",
    - "league"/"leagues" → "lg",
    - "versta"/"verstas" → "vr",
    - "nautical mile"/"nautical miles" → "nmi",
    - "nautical league"/"nautical leagues" → "nlg".
  - `HEIGHT_CANONICAL = ["ft","m","f"] as const;`
    aliases: "foot"/"feet" → "ft", "meter"/"meters"/"metre"/
    "metres" → "m", "fathom"/"fathoms" → "f".
  - `TEMPERATURE_CANONICAL = ["°C","°F","K","°R","°De","°N","°Ré"] as const;`
    aliases: "c"/"celsius" → "°C", "f"/"fahrenheit" → "°F",
    "k"/"kelvin" → "K", "r"/"rankine" → "°R", "de"/"delisle" → "°De",
    "n"/"newton" → "°N", "ré"/"re"/"reaumur"/"réaumur" → "°Ré".
- [ ] Helpers `canonDistance(v)`, `canonHeight(v)`, `canonTemperature(v)`
  return the canonical value when the alias resolver matches OR the
  trimmed input otherwise (so unknown strings become custom labels).
- [ ] Area: trim only; return as-is; reject empty/whitespace.

## Task 2 — Implement the tool

- [ ] Types:
  - `MeasurementUnitsRuntime { setUnit(elementId: string, storedKey:
    string, value: string): void }`.
- [ ] `defaultMeasurementUnitsRuntime.setUnit`:
  - If `document` undefined → throw (caller surfaces the error).
  - `el = document.getElementById(elementId)`; throw if null.
  - Set `(el as HTMLInputElement | HTMLSelectElement).value = value`.
  - If `localStorage` defined → `localStorage.setItem(storedKey,
    value)`.
- [ ] Tool schema: `distance`, `area`, `height`, `temperature`,
  each an optional string; each must be non-empty if provided.
- [ ] Execute:
  - Validate at least one supplied.
  - For each provided unit, validate non-empty trimmed string;
    canonicalize; call `setUnit(elementId, storedKey, value)` with:
    - distance → ("distanceUnitInput", "distanceUnit", canon).
    - area → ("areaUnit", "areaUnit", trimmed).
    - height → ("heightUnit", "heightUnit", canon).
    - temperature → ("temperatureScale", "temperatureScale", canon).
  - Wrap in try/catch; return the applied map.

## Task 3 — Register

- [ ] Import, barrel re-export, register after
  `setWorldRatesTool`.

## Task 4 — Tests

- [ ] `src/ai/tools/set-measurement-units.test.ts`:
  - Injected-runtime:
    - Set distance alone → setUnit called once with
      `("distanceUnitInput", "distanceUnit", "km")`.
    - Set all four together → setUnit called 4×.
    - Canonicalize "celsius" → "°C"; "miles" → "mi"; "feet" → "ft".
    - Area free-form passthrough ("hectares" → "hectares").
    - "custom-label" for distance kept as-is (trimmed).
    - Errors when nothing supplied.
    - Rejects invalid types for each dim.
    - Surfaces runtime failures.
  - Default-runtime integration:
    - Stub document with elements for each id (fake objects with
      `.value` writable). Stub localStorage with vi spies on
      setItem.
    - Call the tool; assert each element's value and the stored
      value per key.
    - Missing element → error surfaced.

## Task 5 — README

- [ ] Row under `set_year_and_era`:
  ```
  | `set_measurement_units` | Change the Options panel display units: `distance` (mi/km/…), `area` (free-form label), `height` (ft/m/f), `temperature` (°C/°F/K/…). Any combination in one call. Updates the select / input element and localStorage, mirroring the UI's own persistence. Common prose terms ("miles", "celsius", "meters") are canonicalized automatically. | "Switch to metric — km and meters and celsius", "Use fahrenheit temperatures", "Area unit is hectares" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-measurement-units` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add set_measurement_units tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Tasks 1, 2.
- Plan step 2 → Task 3.
- Plan step 3 → Task 4.
- Plan step 4 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Options panel unit selects + localStorage persistence,
  unreachable by AI.
- Plan writes the same element `.value` the UI's change handler
  reads AND explicitly sets `localStorage.setItem(storedKey, value)`
  to match `storeValueIfRequired`. Result is identical to a user
  picking the option — except we skip the UI change event, so any
  listeners hooked off `change` won't fire. For these settings
  specifically, no listeners exist beyond the persistence one we're
  handling.
- Free-form strings pass through (distance's "custom_name", area's
  entire input, height's "custom_name", temperature's non-standard
  entries) because we fall through the alias resolver to the raw
  input when no alias matches.

## Verification that tests prove the use case

- Injected-runtime tests cover every dimension, canonicalization
  branch, and validation error.
- Integration test asserts both DOM mutation AND localStorage write
  — the two side-effects the UI performs.
- Missing-element test (integration) ensures tool fails loudly
  rather than silently accepting an invalid id.
