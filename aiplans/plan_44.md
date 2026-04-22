# Plan 44 — set_zone_color AI tool

## Use case

Every row in the Zones Overview has a colour swatch that opens a picker;
the callback (`public/modules/ui/zones-editor.js:312 changeFill`) writes
`zone.color` and calls `drawZones()` to repaint the overlay. This is how
the user recolors an invasion's red to orange, disambiguates two
overlapping plagues, or matches zones to a faction palette.

The chat already can list, rename, and hide/show zones (plans 41–43) but
can't recolour them — the last of the four per-entity verbs missing.

## Scope

Add one tool: `set_zone_color(zone, color)`. Same contract as the other
`set_*_color` tools (state, culture, religion, province):
- Accept hex / rgb/rgba / hsl/hsla / named colors via the shared
  `isValidCssColor` helper.
- Match zones on `zone.i` (non-contiguous ids) or case-insensitive name
  — via the existing `findZoneByRef` helper.
- Write `zone.color` and call `drawZones()` on success.
- Report `{ i, name, previousColor, color }`.

## Implementation

1. **New file `src/ai/tools/set-zone-color.ts`**, closely modelled on
   `set-province-color.ts`:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, `RawZone` from `_shared`; `isValidCssColor`
     from `./set-state-color`; `findZoneByRef` from
     `./set-zone-visibility`.
   - `ZoneColorRef { i, name, previousColor }`.
   - `ZoneColorRuntime { find(ref), applyColor(i, color) }`.
   - `defaultZoneColorRuntime.find`: `findZoneByRef` →
     `{ i, name, previousColor: zone.color ?? null }`.
   - `defaultZoneColorRuntime.applyColor`: locate by `i`, throw if
     missing, write `zone.color = color`, best-effort
     `getGlobal<() => void>("drawZones")?.()`.
   - Tool schema: `zone` (int|string), `color` (string). Both required.
   - Error on `color` with the same message the other color tools use.

2. **Register** in `src/ai/index.ts`: import, barrel export,
   `registry.register(setZoneColorTool)` next to the other set-*-color
   tools (after setProvinceColorTool).

3. **Tests `src/ai/tools/set-zone-color.test.ts`** — runtime-injected,
   modelled on `set-province-color.test.ts`:
   - Recolors a zone by numeric id (applyColor called with right args).
   - Resolves zone by case-insensitive name.
   - Rejects unknown zone ref.
   - Rejects invalid `zone` (null, 0, -1, 1.5, "").
   - Rejects invalid / missing `color` (not a CSS color, empty string,
     non-string).
   - Surfaces runtime failures.

4. **Default-runtime integration test** (same pattern as the rename-zone
   test): stub `globalThis.pack.zones` with non-contiguous ids, stub
   `globalThis.drawZones`, call the default tool, assert
   `pack.zones[k].color` updated and `drawZones` called.

5. **README_AI.md** — new row under `rename_zone`.

## Verification

- `npm test -- --run src/ai/tools/set-zone-color` — green.
- `npm test -- --run` — entire suite still green (541 before).
- `npm run lint` — baseline 7 warnings / 1 info unchanged.
- `npm run build` — succeeds.

## Success criteria

- Tool is registered and callable.
- AI can say "make the plague zone purple" and the overlay redraws in
  the new color, matching what the user sees after picking it from the
  swatch.
- Non-contiguous zone ids work correctly (same `findZoneByRef` path
  already covered by plan 42 tests).
