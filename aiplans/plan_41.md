# Plan 41 — list_zones AI tool

## Use case

The user can open the Zones Overview (`public/modules/ui/zones-editor.js`)
and see every zone on the map — invasions, rebellions, diseases, crusades,
disasters, eruptions, avalanches, etc. Each zone has an id, display name,
type, colour, and the cells it covers, plus an optional `hidden` flag for
zones the user has toggled off.

The AI chat currently has no way to read this collection. Every other
`pack.*` collection (states, burgs, cultures, religions, provinces,
markers, rivers, routes) has a `list_*` tool, and `zones` is the only
remaining gap. Without it, the AI cannot answer "are there any ongoing
invasions?" or "what zones cover this state?" or pipe zone ids into
follow-up operations.

## Scope

Add one new tool: `list_zones`. Read-only — no zone creation, renaming,
recolouring, or deletion in this iteration (each will be its own future
use case).

## Implementation

1. **New file `src/ai/tools/list-zones.ts`**, following the existing
   `list-*` pattern (list-burgs, list-rivers, list-routes are the closest
   relatives since they also do filtering):

   - Import `createPaginatedListTool`, `getPack` from `_shared`.
   - Extend `src/ai/tools/_shared/pack-types.ts` with a `RawZone`
     interface (`i: number; name?: string; type?: string; color?: string;
     cells?: number[]; hidden?: boolean`). Add `zones?: RawZone[]` to
     `Pack`. Export `RawZone` from the barrel.
   - Define a `ZoneSummary` output type: `i, name, type, color, cells
     (count, not the array), hidden`.
   - Helper `readZonesFromPack(pack)` mapping each non-removed zone to
     `ZoneSummary`. Zones don't have a `removed` flag in practice, so
     filter by truthiness only.
   - `ZonesRuntime` seam with `readZones()` for test injection.
   - Paginated tool: `limit` (1-500, default 100), `offset` (>=0).
     Optional filters: `type` (case-insensitive exact match) and
     `include_hidden` (default false — matches the UI which dims hidden
     zones but keeps them in the list, so we default to showing all but
     the hidden ones unless asked).
   - `collectionKey: "zones"` and a `notReadyError` matching the
     pattern used by other list tools.

2. **Register the tool** in `src/ai/tools/index.ts` barrel (both the
   import and the `TOOLS` array — follow the list-rivers pattern).

3. **Tests `src/ai/tools/list-zones.test.ts`** modelled on
   `list-rivers.test.ts`:
   - Returns null / empty when pack has no zones array.
   - Maps fields correctly for a normal zone.
   - `cells` is returned as a count, not the raw array.
   - Hidden zones are excluded by default.
   - `include_hidden: true` includes them.
   - `type` filter is case-insensitive exact match.
   - Pagination honours limit + offset.
   - Rejects invalid filter types (boolean for `type`, non-boolean for
     `include_hidden`).
   - Invalid/not-ready pack returns the expected error payload.

4. **README_AI.md** — add `list_zones` to the tool catalogue section
   and include one example prompt ("Tell me about the invasions and
   diseases currently on the map").

## Verification

- `npm test -- --run src/ai/tools/list-zones` → new tests green.
- `npm test -- --run` → all 502+ existing tests still green.
- `npm run lint` → count of warnings / infos does not exceed baseline
  (7 warnings / 1 info before this change; unchanged because the new
  tool lives in `src/ai/tools/` which is already strict-lint clean).
- `npm run build` → tsc + Vite build succeed.

## Success criteria

- Tool is registered and callable from the chat controller via the
  same tool-use loop all the other tools use.
- AI can answer "list zones" / "what invasion zones are on the map?"
  against a real generated map.
- Tests, lint, build all pass.
