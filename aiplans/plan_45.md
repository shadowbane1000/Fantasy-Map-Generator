# Plan 45 — remove_zone AI tool

## Use case

The Zones Overview trash icon (`public/modules/ui/zones-editor.js:482
zoneRemove`) deletes a zone from the map: filters it out of
`pack.zones`, removes its `#zone{i}` SVG element, and calls
`unfog("focusZone" + i)` to clear any focus overlay. It's the cleanup
counterpart to `set_zone_visibility` (hide temporarily vs delete
permanently).

The chat can currently list, rename, hide/show, and recolor zones
(plans 41–44). Remove is the last direct zone verb before creation /
retyping / cell-editing, and is a frequent ask ("the first plague is
outdated, drop it").

## Scope

Add one tool: `remove_zone(zone)`. Zones are matched on `zone.i`
(non-contiguous) or case-insensitive name — via the existing
`findZoneByRef`. No re-draw is required because the SVG element is
removed outright and the overlay is otherwise unchanged.

## Implementation

1. **New file `src/ai/tools/remove-zone.ts`**, modelled on
   `remove-burg.ts`:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, `RawZone` from `_shared`; `findZoneByRef` from
     `./set-zone-visibility`.
   - `RemoveZoneRef { i, name }`.
   - `ZoneRemovalRuntime { find(ref), remove(i) }`.
   - `defaultZoneRemovalRuntime.find`: reuse `findZoneByRef`.
   - `defaultZoneRemovalRuntime.remove(i)`:
     - Locate the zone's index in `pack.zones` (must use `.findIndex(z
       => z.i === i)`, not array-index lookup).
     - Throw `Zone {i} not found.` if absent.
     - `pack.zones.splice(index, 1)` — **mutate in place** rather than
       reassigning (we only have a reference, the UI replaces
       `pack.zones` but that's not observable from outside).
     - If `document` is available, remove `#zone{i}`.
     - If `unfog` global is available, best-effort
       `unfog("focusZone" + i)` (wrapped in try/catch).
   - Tool schema: `zone` (int id or name string), required.

2. **Register** in `src/ai/index.ts`: import, barrel export,
   `registry.register(removeZoneTool)` right after the other `remove*`
   tools.

3. **Tests `src/ai/tools/remove-zone.test.ts`**:
   - Removes by numeric id (runtime.remove called with the id).
   - Removes by case-insensitive name.
   - Errors when the zone is unknown.
   - Rejects invalid `zone` (null, 0, -1, 1.5, "").
   - Surfaces runtime failures.

4. **Default-runtime integration test** (same pattern as
   set-zone-color.test.ts):
   - Set `globalThis.pack.zones` with non-contiguous ids.
   - Stub `globalThis.document.getElementById` with a spy that returns
     an object with a `remove` method.
   - Stub `globalThis.unfog` with a mock.
   - Call `removeZoneTool.execute({ zone: 5 })`.
   - Assert the zone is gone from `pack.zones` (length decrement +
     filter by i).
   - Assert `document.getElementById("zone5").remove` called.
   - Assert `unfog("focusZone5")` called.
   - Verify that when the SVG element is absent (getElementById
     returns null), the tool still completes without error.
   - Verify that when `unfog` is absent, the tool still completes.

5. **README_AI.md** — new row below `set_zone_color`.

## Verification

- `npm test -- --run src/ai/tools/remove-zone` — green.
- `npm test -- --run` — full suite green (550 before).
- `npm run lint` — 7 / 1 baseline intact.
- `npm run build` — succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "remove zone 5" / "delete the Plague zone" and the zone
  disappears from the map and the Zones Overview, identical to the
  user clicking the trash icon.
- Non-contiguous zone ids handled correctly.
- Soft failures (missing SVG node, missing `unfog`) don't break the
  mutation.
