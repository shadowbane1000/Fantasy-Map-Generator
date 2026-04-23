# Plan 104 — regenerate_zones AI tool

## Use case

The Tools panel's Regenerate Zones button
(`public/modules/ui/tools.js:572`) calls
`regenerateZones(event)`:

- Ctrl-click: prompts for a `multiplier` (0–100,
  default 1) and calls `Zones.generate(multiplier)`.
- Plain click: `Zones.generate(gauss(1, 0.5, 0.6, 5, 2))`
  — a randomized multiplier in roughly [0.6, 5].

Then refreshes the zones editor and redraws the zones
layer.

`regenerate_domain` deliberately skipped zones because
it takes a multiplier argument. This tool fills that
gap with an explicit optional `multiplier` parameter.

## Scope

Add one tool: `regenerate_zones(multiplier?)`.

- `multiplier` — optional finite number in [0, 100]. If
  omitted, defaults to `1` (neutral, avoids the
  randomized gauss to keep the tool deterministic).
- Delegates to `window.Zones.generate(multiplier)`.
- Best-effort calls `drawZones()` to refresh the layer.
- Errors clearly when Zones.generate is unavailable.

## Implementation

1. **New file `src/ai/tools/regenerate-zones.ts`**:
   - Imports: errorResult, getGlobal, getPackCollection,
     okResult, type RawZone from `./_shared`.
   - `RegenerateZonesRuntime { regenerate(multiplier),
      countActive() }`.
   - `defaultRegenerateZonesRuntime`:
     - regenerate: get `window.Zones`; throw if missing
       or missing `.generate`; call `Zones.generate(multiplier)`.
       Best-effort call `drawZones` global.
     - countActive: count non-removed entries in
       `pack.zones`.
   - Schema: `multiplier` (number, optional,
     minimum 0, maximum 100).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-zones.test.ts`:
   - Unit (stubbed):
     - delegates with provided multiplier
     - defaults multiplier to 1 when omitted
     - rejects non-finite multiplier
     - rejects out-of-range (<0, >100)
     - surfaces runtime errors
   - Integration:
     - stubs Zones.generate + drawZones + pack.zones.
     - Zones.generate called with provided multiplier.
     - drawZones called best-effort.
     - errors when Zones or Zones.generate missing.

4. **README_AI.md** — row near `regenerate_domain`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-zones`
  green.
- `npm test -- --run` — 1280 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Delegates to Zones.generate.
- Multiplier defaults to 1 (deterministic).
- Best-effort drawZones.
- Errors clearly when unavailable.
