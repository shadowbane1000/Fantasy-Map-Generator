# Plan 43 — rename_zone AI tool

## Use case

The Zones Overview (`public/modules/ui/zones-editor.js:400`) lets the
user rename a zone — internally the field is called Description but
it writes to `pack.zones[k].name` and mirrors the value to the
`#zone{i}` SVG element's `data-description` attribute (tooltip).

The chat can list zones (plan 41) and hide/show them (plan 42) but
can't rename them. This is the natural rounding-out of zone coverage
before any destructive operations (remove, recolor) — and is a
frequent "narrative" ask for a worldbuilding assistant ("the smaller
invasion should be called the Black Tide").

## Scope

Add one tool: `rename_zone(zone, name)`. Updates `zone.name` and the
SVG `data-description` attribute. Same zone-matching semantics as
`set_zone_visibility` (match on `zone.i` or case-insensitive current
name). No `drawZones()` redraw is needed — the name is never on-map,
only in the tooltip/overview.

## Implementation

1. **New file `src/ai/tools/rename-zone.ts`**, following the
   `rename-burg.ts` pattern (simplest rename tool; no optional
   fullName like rename-state):
   - Import `errorResult`, `getPack`, `okResult`, `parseEntityRef`
     from `_shared`, and `findZoneByRef` from `./set-zone-visibility`
     to reuse the id/name match.
   - `ZoneRenameRef { i, name }`.
   - `ZoneRenameRuntime { find(ref), rename(i, name) }`.
   - `defaultZoneRenameRuntime`:
     - `find`: use `findZoneByRef(getPack()?.zones, ref)`; return
       `{ i, name: zone.name ?? "" }` or null.
     - `rename(i, name)`: find the zone by `i` again; throw if
       missing; write `zone.name = name`; and, if `document` is
       available, set `data-description` on `#zone{i}` to the new
       name (match the UI's `changeDescription`).
   - Tool input: `zone` (int id or name string), `name` (non-empty
     string). Required: both.
   - Returns `{ i, previousName, name }`.

2. **Register** in `src/ai/index.ts`:
   - Import `renameZoneTool`.
   - Barrel re-export block.
   - `registry.register(renameZoneTool)` next to the other rename
     tools.

3. **Tests `src/ai/tools/rename-zone.test.ts`** — injected runtime,
   modelled on `rename-burg.test.ts`:
   - Renames a zone by numeric id.
   - Renames a zone by case-insensitive name.
   - Rejects unknown zone ref.
   - Rejects invalid `zone` (null, 0, -1, 1.5, "").
   - Rejects empty/whitespace-only / non-string `name`.
   - Idempotent: a rename to the current name still calls
     `runtime.rename(i, newName)` (names could be re-case-normalized,
     and the UI also writes regardless). Assert no error.
   - Surfaces runtime failures.

4. **Default-runtime integration test** (mirrors the one for
   set-zone-visibility): set up `globalThis.pack.zones` with
   non-contiguous ids, set up a fake `document` with a `#zone5`
   element, call the default tool instance, assert `pack.zones[k].name`
   is updated and the element's `data-description` attribute matches.

5. **README_AI.md** — add a row below `set_zone_visibility` with a
   couple of example prompts ("Rename the Plague zone to Black
   Death", "Rename zone 3 to Ash Invasion").

## Verification

- `npm test -- --run src/ai/tools/rename-zone` — green.
- `npm test -- --run` — entire suite still green (531 before).
- `npm run lint` — baseline 7 warnings / 1 info unchanged.
- `npm run build` — succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "rename the invasion to X" and see both the Zones
  Overview row and the tooltip reflect the new name.
- Works with non-contiguous zone ids (reuses `findZoneByRef`).
