# Plan 65 — set_zone_type AI tool

## Use case

The Zones Editor's type input (`changeType` at
`public/modules/ui/zones-editor.js:405`) writes `zone.type = value`
and mirrors the value into the `#zone{i}` SVG element's `data-type`
attribute. Users retype zones to reclassify (e.g. an old Invasion
becomes a Rebellion as the conflict evolves).

The chat has `list_zones` (reads type) and
`rename_zone` / `set_zone_color` / `set_zone_visibility` /
`remove_zone` but cannot retype a zone. The type is what the
Zones Overview groups by, so it's a meaningful filter knob.

## Scope

Add one tool: `set_zone_type(zone, type)`.

- `zone` required — numeric zone id (non-contiguous) or
  case-insensitive current zone name (via `findZoneByRef`).
- `type` required non-empty string. Free-form (same as the
  editor's text input) — generator emits Invasion, Rebels,
  Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche,
  Flood, etc., but narrative zones may have any label.
- Writes `zone.type = type`.
- Updates the `#zone{i}` SVG `data-type` attribute when the
  element exists.

No `drawZones()` redraw needed — the attribute change is cosmetic
(style selector / overview filter). The overlay fill doesn't
depend on type.

## Implementation

1. **New file `src/ai/tools/set-zone-type.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     type `RawZone` from `_shared`; `findZoneByRef` from
     `./set-zone-visibility`.
   - `ZoneTypeRef { i, name, previousType }`.
   - `ZoneTypeRuntime { find(ref), apply(id, type) }`.
   - `defaultZoneTypeRuntime.find`: findZoneByRef →
     `{ i, name, previousType: zone.type ?? null }`.
   - `defaultZoneTypeRuntime.apply(id, type)`:
     - Re-resolve via findZoneByRef; throw if null.
     - Write `zone.type = type`.
     - If `document` available: set `#zone{id}` `data-type`.
   - Tool schema: `zone` (int|string required), `type` (string
     required non-empty).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-zone-type.test.ts`**:
   - Runtime-injected: sets by id; by name; trims type; rejects
     invalid refs; rejects invalid types (non-string, empty,
     whitespace); surface runtime failures.
   - Default-runtime integration: stub `globalThis.pack.zones` with
     non-contiguous ids; stub `globalThis.document` with fake
     `#zone5` element (setAttribute spy).
     - Apply type "Rebels" → `pack.zones[k].type` updated + `setAttribute("data-type","Rebels")`.
     - Tool still succeeds when SVG element is missing.

4. **README_AI.md** — row near `rename_zone`.

## Verification

- `npm test -- --run src/ai/tools/set-zone-type` green.
- `npm test -- --run` — 800 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can reclassify any zone (by id or current name) to a new type
  and both the data + SVG attribute reflect it.
- Free-form type accepted; no enum restriction (matches UI).
