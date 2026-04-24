# Plan 280 — add `get_geography` AI tool

## Goal
Add a read-only AI tool that reads the current geographic-framing
slider values — `map_size`, `latitude`, `longitude` — from the same
sources `set_geography` writes to (the paired input DOM element,
localStorage). Inverse of `set_geography`.

## Why
`set_geography` lets the assistant tune the World Configurator's
geographic framing, but without a matching read tool the assistant has
to guess when asked "what latitude is the map centred on?" or before a
nudge ("shift map_size a bit smaller"). A dedicated readback keeps
round-trip conversations honest and avoids re-generating or poking at
the whole map just to surface three numbers.

## Shape

Tool name: `get_geography`

Input: none (no required params, ignore extras).

Behavior:
- Read-only.
- For each of the three geography fields (ref `GEOGRAPHY_FIELDS` from
  `set-geography.ts`):
  1. Read DOM `#<inputId>` value, parsed as a float.
  2. Fall back to `localStorage[storedKey]`, parsed as a float.
  3. Otherwise `null`.
- Returns `{ ok: true, map_size, latitude, longitude }` (numbers or
  nulls).

Note: unlike `set_climate`, `set_geography` does **not** write to
`window.options` — the slider values live only in the DOM inputs and
`localStorage`. So the readback has two sources, not three.

## Files

- `src/ai/tools/get-geography.ts` — runtime-seam tool.
- `src/ai/tools/get-geography.test.ts` — pure / seam tests plus a
  `defaultGeographyReadRuntime` integration block (seeds
  `globalThis.document` and `globalThis.localStorage` via
  `as unknown as { ... }` casts).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add a row near `set_geography` describing the
  tool, with API-key note and example prompts.

## Architecture

Mirror `get-climate.ts`-style readback but reuse `GEOGRAPHY_FIELDS`
from `set-geography.ts` so the inputId / storedKey wiring stays in
one place.

- `export interface GeographySnapshot {
    mapSize: number | null;
    latitude: number | null;
    longitude: number | null;
  }`
- `export interface GeographyReadRuntime { read(): GeographySnapshot }`
- `export const defaultGeographyReadRuntime: GeographyReadRuntime`
  reads from DOM / localStorage in that order for each field.
- `export function createGetGeographyTool(runtime = default): Tool`
- `export const getGeographyTool = createGetGeographyTool()`

Input schema: `{ type: "object", properties: {} }`. No `required`.

The response body renames the internal camelCase keys to the
snake_case public API (`map_size`, `latitude`, `longitude`) to stay
parallel with `set_geography` input keys.

## Validation / edge cases

- DOM unavailable (`document === undefined`) — skip step 1.
- Input element missing — skip step 1.
- Input value unparseable / NaN / Infinity / empty — skip step 1.
- `localStorage` missing — skip step 2.
- Stored value unparseable / empty — skip step 2.
- Both sources exhausted → null for that field.
- Extra input keys are ignored.

## Tests

Pure / seam (via `createGetGeographyTool(runtimeStub)`):
- returns all three values from a happy-path snapshot.
- returns nulls when the runtime provides nulls.
- tolerates extra input args.
- tool metadata spot-check (name, input_schema empty).

Integration (`defaultGeographyReadRuntime`):
- reads from DOM input `.value` when elements present.
- falls back to `localStorage.getItem` when DOM is missing.
- returns null when neither source has a usable value.
- prefers DOM over localStorage when both are present.

Use `as unknown as { ... }` casts when stubbing globals (consistent
with the rest of the repo).

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Mutations — this tool is read-only.
- Reading non-geography Configurator knobs — each has or will have
  its own read tool.
