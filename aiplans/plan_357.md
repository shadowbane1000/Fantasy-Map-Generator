# Plan 357 — `set_river_parent` AI chat tool

## Use case

Add an AI chat tool `set_river_parent` that sets a river's `parent`
(which other river it flows into) and updates its `basin` (the
parent's basin id) accordingly.

This mirrors the legacy `changeParent` function in
`public/modules/ui/rivers-editor.js` (around lines 195-205):

```js
function changeParent() {
  const r = getRiver();
  r.parent = +this.value;
  r.basin = pack.rivers.find(river => river.i === r.parent).basin;
}
```

The user can already pick a parent river from the per-river editor's
"Parent" select. The AI cannot.

A river's `basin` is the id of the trunk river that this and other
tributaries ultimately drain into (often the river itself if it's the
trunk; otherwise a downstream river's id). When the AI changes which
river a tributary flows into, the basin must be updated to the new
parent's basin so downstream lookups (e.g. `find_rivers_by_basin`)
remain consistent.

We already ship `find_rivers_by_basin`, `set_river_type`,
`set_river_width`, `rename_river`, `remove_river`, and
`regenerate_river_names`. This plan adds the missing per-river
parent/basin setter.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 817 files in 672ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Resolve the target `river` ref (numeric id or case-insensitive
   name) via the shared `findRiverByRef`. Reject if missing or removed.
2. Validate `parent` is an integer ≥ 0.
3. Special-case `parent === 0`: legitimate value meaning "no parent /
   this river is a trunk". In this case, `basin` is set to
   `river.i` (the river is its own basin root). No parent lookup is
   performed.
4. When `parent !== 0`:
   - Reject `parent === river.i` (a river cannot be its own parent —
     would create a degenerate cycle).
   - Resolve the parent in `pack.rivers` by id. Must be a non-removed
     river. Capture its `basin` (defaulting to the parent's own `i`
     if unset, mirroring the convention used by other tools).
5. Capture `previous_parent` (defaults to `0` if unset) and
   `previous_basin` (defaults to `river.i` if unset) BEFORE mutation.
6. Mutate IN PLACE:
   - `river.parent = parent`.
   - `river.basin = (parent === 0) ? river.i : parentRiver.basin ?? parentRiver.i`.
7. No best-effort redraw is needed: parent/basin don't drive any SVG
   layer rendering (the river path geometry is independent). The next
   re-open of the rivers-editor reads the live values.
8. Return the success summary.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "river":  {
      "type": ["integer", "string"],
      "description": "River id (matches river.i, not array index — ids are non-contiguous because the generator skips removed rivers) or current case-insensitive name."
    },
    "parent": {
      "type": "integer",
      "minimum": 0,
      "description": "Parent river id (0 means no parent / this river is a trunk; basin will be set to the river's own id)."
    }
  },
  "required": ["river", "parent"]
}
```

## Validation

- Both `river` and `parent` required.
- `river` parses as a valid ref via `parseEntityRef` (positive integer
  or non-empty string).
- `river` resolves in `pack.rivers`; not removed.
- `parent` must be a non-negative integer (typeof number, integer,
  ≥ 0).
- If `parent !== 0`:
  - Must resolve to a non-removed river in `pack.rivers`.
  - Must not equal `river.i` (no self-parent).
- `pack.rivers` must be an array.

## Errors (verbatim, consistent with peer setters)

- `"River ${ref} not found."` — JSON-stringified ref.
- `"Cannot set parent on removed river ${i}."`
- `"parent must be a non-negative integer."`
- `"Parent river ${id} not found."`
- `"Cannot set parent to the river itself."`
- `"Parent river ${id} is removed."`
- `"window.pack.rivers is not available; the map hasn't finished loading."`
- Runtime errors are propagated via `.message`.

## Success result

```jsonc
{
  "ok": true,
  "river": { "i": 5, "name": "Mistwater" },
  "previous_parent": 0,
  "previous_basin": 5,
  "parent": 12,
  "basin": 12
}
```

When the river has no name, `name` is `""` (empty string) — matches
the `findRiverByRef`-derived defaults used by sibling tools.

## Files

### NEW

- `src/ai/tools/set-river-parent.ts` — the tool implementation.
- `src/ai/tools/set-river-parent.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — import / re-export / register the new tool
  alphabetically slotted near `setRiverTypeTool` / `setRiverWidthTool`.

## Tests (Vitest)

Stub-runtime suite:

1. **happy path (set parent)**: river i=5 with parent=0 basin=5 →
   apply parent=12 (parent has basin=12) → river.parent=12,
   river.basin=12. Returned summary captures previous values.
2. **happy path (clear parent)**: river i=5 with parent=12,
   basin=12 → apply parent=0 → river.parent=0, river.basin=5
   (river's own id).
3. **basin propagates from parent's basin, not parent's id**:
   parent river has `i=20`, `basin=3`. Setting child's parent=20
   results in child.basin=3 (NOT 20).
4. **self-parent rejection**: parent === river.i → error
   `"Cannot set parent to the river itself."`. No mutation.
5. **removed river**: target river is removed → error
   `"Cannot set parent on removed river ${i}."`. No mutation.
6. **parent missing**: parent id doesn't resolve → error
   `"Parent river ${id} not found."`.
7. **parent removed**: parent id resolves to a removed river → error
   `"Parent river ${id} is removed."`.
8. **parent negative**: parent = -1 → error
   `"parent must be a non-negative integer."`.
9. **parent non-integer / wrong type**: parent = 1.5, "x", null,
   undefined → same error.
10. **river ref invalid**: river = 0, -1, 1.5, "" → ref parser error.
11. **river string that doesn't resolve**: → `"River \"ghost\" not found."`.
12. **previous values captured BEFORE mutation**: stub ordering
    asserts `find` returns previous values then `apply` is called
    once. Verifies `previous_parent` / `previous_basin` come from
    the snapshot, not the post-mutation state.
13. **registry round-trip**: register `setRiverParentTool` in a
    `ToolRegistry`, dispatch via name, verify result.

Default-runtime integration suite:

14. **missing pack.rivers**: `globalThis.pack = {}` → error
    `"window.pack.rivers is not available; the map hasn't finished loading."`.
15. **integration set parent**: populated `globalThis.pack` with three
    rivers; set river 5 parent to 12 (which has basin=12) →
    pack.rivers entry for 5 has parent=12, basin=12.
16. **integration clear parent**: river 5 currently has parent=12,
    basin=12; set parent=0 → pack.rivers entry for 5 has
    parent=0, basin=5.
17. **integration basin propagates from parent's basin**: parent has
    basin=3 (different from parent's id 20). Setting child parent=20
    → child.basin=3.
18. **integration removed parent**: parent id is removed → error.
19. **integration self-parent**: parent === river.i → error.
20. **in-place mutation: river object identity preserved** (default
    runtime). Capture `pack.rivers.find(...)` reference before, assert
    `===` after.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — no errors.
- `npm run lint` — no warnings.

## Self-review

After drafting `tasks_357.md`, re-read both files with the following
checklist:

- [x] Basin-from-parent's-basin (NOT parent's id) is documented
      (Behavior §6) and tested (test 3 stub + test 17 integration).
- [x] `parent === 0` special case (basin = river.i) is documented
      (Behavior §3) and tested (test 2 stub + test 16 integration).
- [x] Self-parent rejection is documented (Behavior §4) and tested
      (test 4 stub + test 19 integration).
- [x] `previous_parent` / `previous_basin` captured BEFORE mutation
      (Behavior §5) and tested (test 12).
- [x] In-place mutation: river object identity preserved (test 20).
- [x] All "Errors (verbatim)" lines match what tests assert.
- [x] Pattern matches `set-river-type.ts` (runtime injection,
      `findRiverByRef` resolution).
- [x] Index registration alphabetically near `setRiverTypeTool`.

### Corrections made during review

- Initial draft used `parseEntityRef` for `parent` too; corrected to
  parse `parent` directly as an integer (not an entity ref) because
  `parseEntityRef` rejects 0 and `parent: 0` is a legitimate value.
- Initial draft set `river.basin = parentRiver.basin` literally;
  corrected to `parentRiver.basin ?? parentRiver.i` because the
  generator does not always self-reference (a trunk river may have
  `basin` unset). This matches the convention in
  `find-rivers-by-basin.ts` which says "the generator doesn't always
  self-reference".
- Initial draft considered triggering a redraw; confirmed that
  parent/basin don't directly drive any layer rendering (river paths
  are stored as `points`/cell ids, drawn by `Rivers.draw`), so no
  best-effort redraw is needed. Documented in Behavior §7.
