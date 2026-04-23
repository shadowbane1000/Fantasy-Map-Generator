# Plan 121 — set_heightmap_options AI tool

## Use case

The Options dialog has three heightmap-related controls
that affect terrain generation (applied on next
`regenerate_map`):

- `allowErosion` checkbox — whether water erosion is
  applied during height generation
  (`src/index.html:2295`).
- `resolveDepressionsStepsInput/Output` — max
  iterations for depression-filling (0-1000, default
  250) — read directly from the DOM in
  `river-generator.ts:345`.
- `lakeElevationLimitInput/Output` — depression depth
  threshold for lake formation (0-80, default 20) —
  read in `lakes.ts:102`.

These control terrain realism and river network quality.

## Scope

Add one tool: `set_heightmap_options(fields)`.

Any subset of:
- `allow_erosion` — boolean.
- `resolve_depressions_steps` — int [0, 1000].
- `lake_elevation_limit` — int [0, 80].

At least one required. Writes DOM (input + output
paired elements), localStorage (data-stored key), and —
for allowErosion — the checkbox `checked` property.

Passive; applied on next `regenerate_map`.

## Implementation

1. **New file `src/ai/tools/set-heightmap-options.ts`**:
   - Imports: errorResult, okResult from `./_shared`.
   - Field definitions with IDs and ranges.
   - `HeightmapOptionsRuntime { apply(field, value) }`.
   - `defaultHeightmapOptionsRuntime.apply`:
     - For number fields: write input.value + output.value
       + localStorage.
     - For boolean fields (allowErosion): write input
       .checked + localStorage (as "true"/"false").

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-heightmap-options.test.ts`:
   - Unit (stubbed):
     - writes single field
     - writes multiple fields
     - rejects empty input
     - range validates
     - rejects non-boolean for allow_erosion
     - surfaces runtime errors
   - Integration:
     - stubs document + localStorage.
     - writes fields to DOM + localStorage.

4. **README_AI.md** — row near `set_generator_rates`.

## Verification

- `npm test -- --run src/ai/tools/set-heightmap-options`
  green.
- `npm test -- --run` — 1484 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Three fields supported with correct ranges / types.
- Writes DOM + localStorage.
