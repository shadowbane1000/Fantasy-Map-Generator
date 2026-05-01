# Plan 363 — `set_zone_cells` AI chat tool

## Use case

Add an AI chat tool `set_zone_cells` that replaces the cell-id list of
a single zone (`zone.cells = [...]`). Mirrors the per-zone write inside
the legacy `applyZonesManualAssignent` function in
`public/modules/ui/zones-editor.js` (lines 270–286):

```js
function applyZonesManualAssignent() {
  const data = zones.selectAll("polygon").data();
  const zoneCells = data.reduce((acc, d) => {
    if (!acc[d.zoneId]) acc[d.zoneId] = [];
    acc[d.zoneId].push(d.cell);
    return acc;
  }, {});

  const filterBy = byId("zonesFilterType").value;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = pack.zones.filter(zone => !zone.hidden && (!isFiltered || zone.type === filterBy));
  visibleZones.forEach(zone => (zone.cells = zoneCells[zone.i] || []));

  drawZones();
  zonesEditorAddLines();
  exitZonesManualAssignment();
}
```

The user can already trigger this via the zones editor's "Manual" mode
(paints zone membership cell-by-cell). The AI cannot.

We already have:

- `add_zone` (creates a zone, accepts initial cells, validates &
  dedupes)
- `remove_zone`, `rename_zone`, `set_zone_color`, `set_zone_type`,
  `set_zone_visibility`
- `find_zones_by_type`, `get_zone_distribution`, `get_zone_info`,
  `list_zones`
- `regenerate_zones`

This plan adds the missing **replace zone's cell membership** action.

## Lint baseline

```
$ npm run lint 2>&1 | tail -50
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 829 files in 690ms. No fixes applied.
```

Clean baseline — zero warnings.

## Behavior

1. Resolve `zone` by numeric `i` or case-insensitive name. Reuse
   `findZoneByRef` exported from `set-zone-visibility.ts` (mirrors the
   pattern used by `set-zone-color.ts`).
2. Reject if the zone is `removed`.
3. Validate `cells` is an array of non-negative integers within
   `pack.cells.i.length` (mirror `add-zone.ts`'s validateCells —
   replicated locally because `add-zone.ts` exports a runtime that
   bundles validation with mutation).
4. Deduplicate the cells array (preserve first occurrence order — match
   `add_zone`'s behavior).
5. Capture `previous_count = zone.cells.length` and
   `previous_cells_sample` (first 10 ids — for the result; omit the
   full list since zones can have hundreds of cells). Capture BEFORE
   mutation.
6. **REASSIGN** `zone.cells = newCellsArray` (the legacy code uses
   assignment, not push). The new array is the deduplicated array
   constructed by the tool — never the caller-supplied array reference.
7. Best-effort: call `drawZones()` if available. Swallow any throw.
8. Return the success summary documented below.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "zone":  { "type": ["integer", "string"], "description": "Zone id or name." },
    "cells": {
      "type": "array",
      "items": { "type": "integer", "minimum": 0 },
      "description": "Cell ids that belong to the zone. Duplicates are collapsed; order preserved by first occurrence."
    }
  },
  "required": ["zone", "cells"]
}
```

## Validation

- `zone` required, must resolve to a non-removed zone.
- `cells` required, must be an array (empty array is allowed —
  represents "clear all cells").
- Each entry must be an integer >= 0 and within
  `[0, pack.cells.i.length)`.
- `pack.zones` and `pack.cells.i` must exist.

## Errors (verbatim)

- `Zone ${ref} not found.`
- `Cannot set cells on removed zone ${i}.`
- `cells must be an array.`
- `cells[${idx}] must be a non-negative integer.`
- `cells[${idx}] (${value}) is out of range (max ${maxId}).`
- `window.pack.zones is not available; the map hasn't finished loading.`
- `window.pack.cells.i is not available; the map hasn't finished loading.`
- Runtime errors (`zone.cells = ...` failures, etc.) propagated as-is.

## Success result

```jsonc
{
  "ok": true,
  "zone": { "i": 5, "name": "Plague Outbreak" },
  "previous_count": 23,
  "count": 41,
  "previous_cells_sample": [101, 102, 103, "..."],
  "cells_sample": [201, 202, "..."]
}
```

Both samples capped at 10 entries. If the underlying array exceeds 10
entries, the response includes `previous_cells_sample_truncated: true`
and/or `cells_sample_truncated: true` accordingly. Truncation flags are
omitted when the sample is the entire array.

## Files

NEW:

- `src/ai/tools/set-zone-cells.ts`
- `src/ai/tools/set-zone-cells.test.ts`

MODIFY:

- `src/ai/index.ts` — add import (alphabetical, near `set-zone-color`),
  re-export, and `registry.register(setZoneCellsTool)` near the other
  zone registrations.

## Tests (Vitest)

Tool-layer (mocked runtime):

1. happy path: zone resolved, cells=[10, 20, 30, 40] →
   `runtime.setCells` called with normalized array; result
   `previous_count=3`, `count=4`.
2. empty cells: `cells: []` → `setCells(i, [])` called; result
   `count=0`.
3. duplicates: input `[1, 2, 1, 3, 2]` → `setCells` called with
   `[1, 2, 3]`; result `count=3`.
4. cells out of range → `runtime.setCells` not called; error references
   the offending index and value.
5. cells non-integer (e.g. `"x"` at index 1) → error names the index;
   `setCells` not called.
6. cells negative → error names the index.
7. cells not an array (object, number) → error.
8. cells field missing entirely → error.
9. zone not found (find returns null) → `Zone ${ref} not found.`;
   `setCells` not called.
10. zone removed (find returns `removed: true`) →
    `Cannot set cells on removed zone ${i}.`; `setCells` not called.
11. invalid zone ref (0, negative, empty string, undefined) → error.
12. runtime.setCells throws → propagated as error.
13. registry round-trip: `buildDefaultRegistry().list()` includes
    `set_zone_cells`.
14. sample truncation: when the input has > 10 cells, response includes
    `cells_sample_truncated: true` and `cells_sample.length === 10`.
    Same for `previous_cells_sample_truncated` when the previous array
    has > 10.
15. `previous_count` and `previous_cells_sample` captured BEFORE
    mutation: this is enforced by the tool layer reading the values
    from `runtime.find()` rather than re-reading post-`setCells`. We
    assert the runtime is called in order: find → validate range →
    setCells, and that the success body's `previous_count` matches the
    value `find` returned even if `setCells` were to mutate state
    (verified by spying).

Default-runtime integration (populated `globalThis.pack`):

16. **REASSIGNMENT verified**: capture
    `originalRef = pack.zones[k].cells` before the tool call;
    afterwards, `pack.zones[k].cells !== originalRef` (a brand-new
    array was assigned, not mutated in place).
17. Other zone fields preserved (color, type, name, hidden, i).
18. Best-effort `drawZones()` called once on success.
19. drawZones missing → no error (call still succeeds).
20. drawZones throws → call still succeeds (data already mutated).
21. missing `pack.zones` → error
    `window.pack.zones is not available; the map hasn't finished loading.`.
22. missing `pack.cells.i` → error
    `window.pack.cells.i is not available; the map hasn't finished loading.`.
23. duplicate collapse end-to-end: input `[5, 7, 5, 9, 7]` →
    `pack.zones[k].cells` ends as `[5, 7, 9]`.
24. previous_count captured BEFORE mutation: pre-populate `cells` with
    3 entries; tool returns `previous_count: 3` even though the
    post-call array has a different length.

## Verification

- `npm test` — all green
- `npx tsc --noEmit` — passes
- `npm run lint` — clean (no new warnings)

## Self-review

Re-read plan + tasks. Verified the mandatory checklist:

- **REASSIGNMENT**: integration test #16 captures
  `originalRef = pack.zones[k].cells` before the call and asserts
  `pack.zones[k].cells !== originalRef` after. The runtime constructs
  a fresh deduped array; we never alias the caller's input.
- **Duplicate collapse with explicit input**: tool-layer test #3
  (`[1, 2, 1, 3, 2] → [1, 2, 3]`) and integration test #23
  (`[5, 7, 5, 9, 7] → [5, 7, 9]`).
- **Range validation**: tool-layer test #4 (out of range → error
  references offending index AND value), plus integration test #22 for
  missing `pack.cells.i`.
- **Sample truncation**: test #14 covers both `cells_sample_truncated`
  and `previous_cells_sample_truncated` (input > 10, previous > 10),
  asserting both length cap (10) and the boolean flag.
- **previous_count / previous_cells_sample captured BEFORE mutation**:
  test #15 enforces call order (find → getValidCellRange → setCells)
  and that the response's `previous_count` matches the snapshot
  returned by `find` (not a re-read after `setCells`). Integration
  test #24 covers the same end-to-end.
- **Errors verbatim**: `Zone ${ref} not found.`,
  `Cannot set cells on removed zone ${i}.`, `cells must be an array.`,
  `cells[${idx}] must be a non-negative integer.`,
  `cells[${idx}] (${value}) is out of range (max ${maxId}).`,
  `window.pack.zones is not available; the map hasn't finished loading.`,
  `window.pack.cells.i is not available; the map hasn't finished loading.`.

Corrections applied: none — both files already line up with the
required workflow.

