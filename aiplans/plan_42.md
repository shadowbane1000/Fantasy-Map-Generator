# Plan 42 — set_zone_visibility AI tool

## Use case

Every row in the Zones Overview has a hide/show button (`toggleVisibility`
in `public/modules/ui/zones-editor.js:322`) that flips `zone.hidden` and
calls `drawZones()` so the overlay redraws without the hidden zone. The
user uses this to declutter the map — e.g. hide stale invasions while
focusing on diseases.

The chat has `list_zones` (plan 41) so the AI can already see the zones,
but it has no way to hide or show them — a gap that comes up immediately
after a list ("show me invasions" → "now hide the smaller one").

## Scope

Add one tool: `set_zone_visibility(zone, visible)`. Read/write on
`pack.zones[k].hidden` plus a best-effort `drawZones()` redraw. The zone
can be referenced by numeric `i` (zones have non-contiguous ids — see
`zones-editor.js:37` which uses `.find(z => z.i === id)` — so we must
match on `zone.i`, not array index) or by case-insensitive name.

Idempotent: if the zone is already in the requested state, return a
`noop: true` result without calling `drawZones()`.

## Implementation

1. **New file `src/ai/tools/set-zone-visibility.ts`**, following the
   `set-entity-lock` pattern:
   - Import `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, `RawZone` from `_shared`.
   - `ZoneVisibilityRef { i, name, previousHidden }`.
   - `ZoneVisibilityRuntime { find(ref), setHidden(i, hidden) }`.
   - `findZoneByRef(pack, ref)`: iterate `pack.zones`, match by numeric
     `i` or case-insensitive `name`. Don't use `findEntityByRef`
     because zones aren't array-indexed by `i`.
   - `defaultZoneVisibilityRuntime.find` uses `getPack()` + `findZoneByRef`.
   - `defaultZoneVisibilityRuntime.setHidden(i, hidden)`: locate the
     zone the same way, set or delete `.hidden` (match the UI's
     `delete zone.hidden` semantics when showing), then best-effort
     invoke `getGlobal<() => void>("drawZones")` to refresh the overlay.
   - Tool input: `zone` (integer id or name string), `visible` (boolean,
     required — explicit rather than a toggle, since the AI may want
     idempotent "ensure hidden" behaviour).
   - Returns `{ i, name, visible, previousVisible, noop }`.

2. **Register** in `src/ai/index.ts` (import + barrel export + registry
   registration, same ordering as the other set-* tools).

3. **Tests `src/ai/tools/set-zone-visibility.test.ts`** with an
   injected runtime, modelled on `set-entity-lock.test.ts`:
   - Hides a visible zone by id.
   - Shows a hidden zone by id (calls `setHidden(i, false)`).
   - Finds zone by case-insensitive name.
   - Returns `noop: true` when the zone is already visible and asked
     to show.
   - Returns `noop: true` when the zone is already hidden and asked to
     hide.
   - Rejects unknown zone refs with an error.
   - Rejects invalid input types (non-integer zone, zero, negative,
     empty string, non-boolean visible).
   - Surfaces runtime errors from `setHidden` (e.g. pack not ready).

4. **Pack-logic test for `findZoneByRef`**: skips entries without
   matching `i`, skips when `pack.zones` is missing, case-insensitive
   name match works, returns `null` for unknown.

5. **Default-runtime integration test**: uses a real `globalThis.pack`
   object with zones containing non-contiguous `i` values (`[2, 5, 8]`
   with `pack.zones` laid out at indices 0, 1, 2) to prove the tool
   matches on `.i` rather than array index. Also verifies `drawZones`
   is called on mutation and NOT called on no-op.

6. **README_AI.md** — new row in the tool table under `list_zones`
   with a couple of example prompts.

## Verification

- `npm test -- --run src/ai/tools/set-zone-visibility` — green.
- `npm test -- --run` — entire suite still green (514 tests before → 
  more after).
- `npm run lint` — baseline unchanged (7 warnings / 1 info).
- `npm run build` — succeeds.

## Success criteria

- Tool registered and callable.
- The AI can run "hide zone 3" or "show the disease zone" and the zone
  overlay updates immediately in the live app.
- Idempotent: asking to hide an already-hidden zone doesn't redraw
  unnecessarily.
- Works with non-contiguous zone ids (critical — the existing UI
  assumes this, and generators produce them).
