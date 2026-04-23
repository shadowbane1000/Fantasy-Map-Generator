# Plan 84 — set_culture_shield AI tool

## Use case

The Cultures Editor
(`public/modules/dynamic/editors/cultures-editor.js:377`)
renders a `<select>` per culture for the emblem shield
shape. Changing the selection runs
`cultureChangeEmblemsShape`, which:

1. Writes `pack.cultures[i].shield = shape`.
2. For every non-removed, non-Wildlands state whose
   `culture === cultureId` and whose `coa.custom` is not
   truthy, writes `state.coa.shield = shape`.
3. Same for provinces (keyed by
   `pack.cells.culture[province.center]`).
4. Same for burgs (keyed by `burg.culture`).
5. Re-renders any already-drawn COA DOM elements.

The shape set is the flat union of keys in
`src/modules/emblem/shields.ts` — about 40 shapes
grouped under `basic`, `regional`, `historical`,
`specific`, `banner`, `simple`, `fantasy`, `middleEarth`.

The AI chat has no way to change a culture's shield
shape. We'll add one.

## Scope

Add one tool: `set_culture_shield(culture, shield)`.

- `culture` — id (≥ 0) or case-insensitive name. Allows
  Wildlands (culture 0), matching the UI.
- `shield` — one of the known shape names
  (case-insensitive). Rejects unknown names with a
  helpful `supported` list.
- On apply:
  - Writes `culture.shield = canonicalShape`.
  - Cascades to state/province/burg coas as the UI does,
    skipping removed entities and those with a custom
    coa (`coa.custom` truthy).
  - Returns counts of cascaded entities.
- Does NOT re-render COA DOM elements. The AI isn't
  driving editor panels, and the main map does not render
  per-entity emblems. This is a data-layer mutation;
  callers refreshing editor panels will see the updated
  shape on next render.
- Idempotent: noop when culture.shield is already the
  requested shape (cascade still runs? → no, the UI
  cascade runs unconditionally but each per-entity step
  also no-ops per-entity. If culture.shield is already
  the requested shape AND no entities need cascading,
  report noop; else report cascaded counts).

  Simplification: always cascade, report counts. If
  culture.shield was already the shape AND no entities
  needed cascade, counts are 0 and we include
  `noop: true`. Otherwise `noop: false`.

## Implementation

1. **New file `src/ai/tools/set-culture-shield.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getGlobal`, `getPack`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawCulture`,
     type `RawState`, type `RawBurg`, type `RawProvince`.
   - Import `shields` from `../../modules/emblem/shields`
     to build the canonical shape set.
   - Export `CULTURE_SHIELDS: readonly string[]` — flat
     list of shape keys (excluding "types").
   - Export `resolveCultureShield(value)` — case-insensitive
     lookup that returns the canonical shape name or null.
   - `CultureShieldRef { i, name, previousShield }`.
   - `CultureShieldRuntime { find, apply }`.
   - `apply(i, shape)` → `{ stateCount, provinceCount,
      burgCount }`.
   - `defaultCultureShieldRuntime`:
     - find: findEntityByRef on `cultures`.
     - apply: mutates pack.cultures[i].shield, walks
       states/provinces/burgs cascading as in the UI.
   - Tool name: `set_culture_shield`.
   - Schema: `culture` (int|string required), `shield`
     (string required).
   - Response payload:
     `{ i, name, shield, previousShield, cascaded:
       { states, provinces, burgs }, noop }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `src/ai/tools/set-culture-shield.test.ts`:
   - `resolveCultureShield`:
     - canonicalizes "Swiss" / "SWISS" / "swiss" → "swiss"
     - canonicalizes "horsehead" etc.
     - returns null for unknown / non-string
   - `CULTURE_SHIELDS`:
     - includes "heater", "swiss", "wedged", "fantasy1",
       "noldor"
     - excludes "types"
   - `set_culture_shield tool` unit (stub runtime):
     - sets by numeric id
     - sets by case-insensitive culture name
     - canonicalizes lowercase shield input
     - rejects unknown shield
     - rejects unknown culture
     - rejects invalid refs
     - noop when already matching + zero cascade
     - non-noop when cascade count > 0
     - surfaces runtime errors
   - `defaultCultureShieldRuntime (integration)`:
     - stubs `globalThis.pack` with cultures / states /
       provinces / burgs / cells.culture.
     - cascades state.coa.shield (non-custom),
       province.coa.shield, burg.coa.shield.
     - skips custom coas.
     - skips removed entities.

4. **README_AI.md**: add a row near `set_culture_type`.

## Verification

- `npm test -- --run src/ai/tools/set-culture-shield` green.
- `npm test -- --run` — 1037 before.
- `npm run lint` — 7 / 1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can set any culture's emblem shield shape.
- Cascades to non-custom state/province/burg coas by
  matching culture — reports counts.
- Rejects unknown shapes with a helpful `supported` list.
- Idempotent when nothing needs changing.
