# Tasks — Plan 278 (`get_climate`)

1. Baseline: capture `npm run lint` (7 warnings / 1 info / 0 errors)
   and `npm test` (2832 passing across 206 files).

2. Write `src/ai/tools/get-climate.ts`:
   - Reuse `CLIMATE_FIELDS` import from `./set-climate` — do **not**
     re-export it locally.
   - `ClimateSnapshot` interface with `temperatureEquator`,
     `temperatureNorthPole`, `temperatureSouthPole` (all `number | null`).
   - `ClimateReadRuntime { read(): ClimateSnapshot }` seam.
   - `defaultClimateReadRuntime` reads each temperature field via:
     1. `window.options[optionKey]` (when a finite number).
     2. `document.getElementById(inputId).value`, parsed as float.
     3. `localStorage.getItem(storedKey)`, parsed as float.
     4. else `null`.
   - `createGetClimateTool(runtime = default)` returns a Tool with:
     - name `get_climate`.
     - input_schema `{ type: "object", properties: {} }`.
     - execute: call `runtime.read()`, map camelCase keys to snake_case
       public-API keys, return `okResult({
         temperature_equator,
         temperature_north_pole,
         temperature_south_pole
       })`.
   - `getClimateTool = createGetClimateTool()` default export.

3. Write `src/ai/tools/get-climate.test.ts`:
   - imports: `afterEach, beforeEach, describe, expect, it, vi` from
     vitest; `createGetClimateTool, getClimateTool,
     defaultClimateReadRuntime, type ClimateReadRuntime,
     type ClimateSnapshot` from `./get-climate`.
   - pure / seam `describe("get_climate tool")`:
     - all three values — runtime stub returns a full snapshot; tool
       maps to snake_case body.
     - nulls pass through — runtime stub returns `{null, null, null}`.
     - extra input args are ignored.
     - tool metadata spot-check: `name === "get_climate"`, schema has
       empty `properties`, no `required`.
   - integration `describe("defaultClimateReadRuntime (integration)")`:
     - `beforeEach` seeds `globalThis.options`, `globalThis.document`
       (`getElementById` returning preseeded `{ value }` stubs), and
       `globalThis.localStorage` (`getItem` returning preseeded map).
       Use `as unknown as { ... }` casts.
     - `afterEach` restores originals.
     - test: reads from `globalThis.options` when set.
     - test: falls back to DOM input.value when options missing.
     - test: falls back to localStorage when options + DOM missing.
     - test: returns null when no source has the value.

4. Wire up in `src/ai/index.ts`:
   - import `getClimateTool` near the other `get_*` imports (alpha-sorted).
   - re-export `createGetClimateTool`, `defaultClimateReadRuntime`,
     `getClimateTool`, `type ClimateSnapshot`, `type ClimateReadRuntime`.
   - `registry.register(getClimateTool)` inside `buildDefaultRegistry`,
     next to the other `get_*` registrations.

5. Add a README_AI.md row in the `set_*` / `get_*` climate cluster
   (right after `set_climate`) describing the tool, with the
   "Requires an Anthropic API key (see "Getting an API key" below)"
   line and example prompts.

6. Verify:
   - `npm run build` (must succeed).
   - `npm test` (expect +N tests, all pass).
   - `npm run lint` (must still be 7 warnings / 1 info / 0 errors).

7. Commit just the plan / tool / test / index / readme files with
   `feat(ai): add get_climate tool`.
