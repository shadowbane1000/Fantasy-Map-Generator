# Plan 58 — set_geography AI tool

## Use case

The World Configurator (next to the climate sliders just exposed by
`set_climate`) has three pure-geography knobs:

- **Map size** (`mapSizeInput` / `mapSizeOutput`, data-stored
  `mapSize`, 1–100%): what fraction of the hypothetical world's
  surface this map represents.
- **Latitudes** (`latitudeInput` / `latitudeOutput`, data-stored
  `latitude`, 0–100, N→S): north-south shift. 50 → centered on the
  equator.
- **Longitudes** (`longitudeInput` / `longitudeOutput`, data-stored
  `longitude`, 0–100, W→E): east-west shift. 50 → centered on the
  prime meridian.

All three are read from DOM inputs at generation time; there's no
`window.options.X` field. Setting any of them affects climate zones
and world positioning on the next regeneration.

The chat currently can tune climate and measurement units but
cannot adjust these geographic framing knobs. Prompts like "move
the map's center south" or "make this a bigger world" can't land.

## Scope

Add one tool: `set_geography`. Accepts any combination of:

- `map_size` (number, [1, 100]).
- `latitude` (number, [0, 100]).
- `longitude` (number, [0, 100]).

At least one required. For each:

1. Write both paired DOM inputs' `.value` to `String(value)`.
2. `localStorage.setItem(storedKey, String(value))`.

Same DOM + localStorage side-effect pattern as `set_climate`'s
precipitation path.

## Implementation

1. **New file `src/ai/tools/set-geography.ts`**:
   - Imports: `errorResult`, `okResult` from `_shared`.
   - `GeographyField { inputId, outputId, storedKey, min, max }`.
   - `GEOGRAPHY_FIELDS` record for the three knobs.
   - `GeographyRuntime { apply(field, value): void }`.
   - `defaultGeographyRuntime.apply`:
     - If `document` present: update `#inputId.value` and
       `#outputId.value` to `String(value)`.
     - If `localStorage` present: `setItem(storedKey, String(value))`.
     - If neither is present → throw (can't apply without at least
       a DOM environment; but in practice document is always
       present when the app is loaded).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-geography.test.ts`**:
   - Runtime-injected:
     - Set map_size alone.
     - Set all three together.
     - Errors when nothing supplied.
     - Rejects non-number / NaN / infinite.
     - Rejects values outside range (0, 101, etc.).
     - Accepts boundaries (1, 100, 0, 100).
     - Surfaces runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.document` (with element fakes for all 6 ids)
       + `globalThis.localStorage`.
     - Call tool, assert each element's `.value` + setItem per key.
     - Missing element → skip gracefully (don't throw).

4. **README_AI.md** — row under `set_climate`.

## Verification

- `npm test -- --run src/ai/tools/set-geography` green.
- `npm test -- --run` — 723 before.
- `npm run lint` — 7/1.
- `npm run build` — TS clean.

## Success criteria

- Tool registered and callable.
- AI can issue `set_geography({ latitude: 35, map_size: 10 })` and
  both DOM elements + localStorage reflect the change.
- Out-of-range values rejected.
- Matches `set_climate`'s precipitation contract for symmetry.
