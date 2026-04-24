# Plan 278 — add `get_climate` AI tool

## Goal
Add a read-only AI tool that reads the current climate slider values —
`temperature_equator`, `temperature_north_pole`, `temperature_south_pole`
— from the same sources `set_climate` writes to (`window.options`, the
paired input/output DOM elements, localStorage). Inverse of
`set_climate`.

## Why
`set_climate` lets the assistant adjust climate knobs, but without a
matching read tool the assistant has to make blind guesses when asked
"what temperature is the equator?" or before a targeted nudge ("bump
the north pole a few degrees colder"). A dedicated readback keeps
round-trip conversations honest and avoids re-reading the whole map
just to surface three numbers.

## Shape

Tool name: `get_climate`

Input: none (no required params, ignore extras).

Behavior:
- Read-only.
- For each of the three temperature fields (ref `CLIMATE_FIELDS` from
  `set-climate.ts`):
  1. Prefer `window.options[field.optionKey]` when present and numeric.
  2. Fall back to DOM `#<inputId>` value, parsed as a float.
  3. Fall back to `localStorage[storedKey]`, parsed as a float.
  4. Otherwise `null`.
- Returns `{ ok: true, temperature_equator, temperature_north_pole,
  temperature_south_pole }` (numbers or nulls). Precipitation is
  intentionally **not** included — it lives in its own tool-pair and
  mirrors the Precipitation Options dialog (`set_precipitation` will
  get its own reader later).

## Files

- `src/ai/tools/get-climate.ts` — runtime-seam tool.
- `src/ai/tools/get-climate.test.ts` — pure / seam tests plus a
  `defaultClimateReadRuntime` integration block (seeds
  `globalThis.options`, `globalThis.document`, `globalThis.localStorage`
  via `as unknown as { ... }` casts).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add a row near `set_climate` describing the tool,
  with API-key note and example prompts.

## Architecture

Mirror `get-world-rates.ts`-style readback but reuse
`CLIMATE_FIELDS` from `set-climate.ts` so the optionKey / inputId /
storedKey wiring stays in one place.

- `export interface ClimateSnapshot {
    temperatureEquator: number | null;
    temperatureNorthPole: number | null;
    temperatureSouthPole: number | null;
  }`
- `export interface ClimateReadRuntime { read(): ClimateSnapshot }`
- `export const defaultClimateReadRuntime: ClimateReadRuntime` reads
  from window.options / DOM / localStorage in that order for each
  temperature field.
- `export function createGetClimateTool(runtime = default): Tool`
- `export const getClimateTool = createGetClimateTool()`

Input schema: `{ type: "object", properties: {} }`.
No `required`.

The response body renames the internal camelCase keys to the
snake_case public API (`temperature_equator`, etc) to stay parallel
with `set_climate` input keys.

## Validation / edge cases

- `window.options` missing / not an object — skip step 1.
- `options[optionKey]` present but not finite — skip step 1.
- DOM unavailable (`document === undefined`) — skip step 2.
- Input element missing — skip step 2.
- Input value unparseable / NaN / Infinity — skip step 2.
- `localStorage` missing — skip step 3.
- Stored value unparseable — skip step 3.
- All three sources exhausted → null for that field.
- Extra input keys are ignored.

## Tests

Pure / seam (via `createGetClimateTool(runtimeStub)`):
- returns all three values from a happy-path snapshot.
- returns nulls when the runtime provides nulls.
- tolerates extra input args.

Integration (`defaultClimateReadRuntime`):
- reads from `globalThis.options` when present.
- falls back to DOM input `.value` when options is missing.
- falls back to `localStorage.getItem` when options + DOM are missing.
- returns null when all three sources are missing/unparseable.
- `getClimateTool` metadata spot-check (name, input_schema empty).

Use `as unknown as { ... }` casts when stubbing globals (consistent
with the rest of the repo).

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Reading precipitation — `get_precipitation` belongs to a separate
  plan that mirrors `set_precipitation`.
- Reading other climate-ish options (wind, year/era) — those have or
  will have their own tools.
- Mutations — this tool is read-only.
