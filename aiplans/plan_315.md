# Plan 315 — `move_ice` AI tool

## Use case

The AI currently has tools to add (`add_iceberg`), remove (`remove_ice`),
resize (`set_iceberg_size`), randomize the shape of (`randomize_iceberg_shape`,
plan 314), and list (`list_ice`) ice elements — but no way to re-position
them. The Edit Ice dialog supports drag-to-move (see
`public/modules/ui/ice-editor.js#dragElement`), which writes both the SVG
`transform` attribute and `pack.ice[matched].offset`. This tool exposes the
same end-state as a non-interactive operation.

## Behavior

Inputs:
- `id` (integer, required) — the ice element's `i` field
  (`pack.ice[*].i`). Non-negative.
- `x` (number, required) — new translate x in map space. Finite. Negative
  and non-integer accepted.
- `y` (number, required) — new translate y in map space. Finite. Negative
  and non-integer accepted.

`x` / `y` are **absolute** positions in map-space, not deltas. This
matches the semantic of the existing `move_label` and `move_burg` tools,
and matches the meaning of `iceData.offset` in the legacy editor (it
stores the result of `dx + x` from drag math, which is the absolute
translate applied to the element). To compute a relative move, the
caller can read `pack.ice` first via `list_ice` to find the current
offset and then add the delta.

Effect (mirrors the end-state of `dragElement` in
`public/modules/ui/ice-editor.js`):

1. Validate `id`, `x`, `y`.
2. Look up the entry in `pack.ice` via `i === id`. If missing →
   error.
3. Resolve the SVG element with attribute `data-id="{id}"` under the
   `#ice` SVG root. If the root is missing AND the `window.ice` D3
   selection is missing → error. If the root is found but no element
   matches → error (data exists but DOM doesn't — out of sync).
4. Set `transform="translate(x,y)"` on the SVG element via
   `setAttribute`.
5. Set `iceData.offset = [x, y]` on the pack entry.

Return shape (`okResult`):

```json
{
  "ok": true,
  "id": 7,
  "type": "iceberg",
  "old_offset": [10, 20],
  "new_offset": [100, 200]
}
```

- `type` is `"glacier"` or `"iceberg"`.
- `old_offset` is the previous `iceData.offset` value (`[x, y]` array
  or `null` if not previously set).
- `new_offset` is `[x, y]`.

## Validation / error cases

- `id` missing/non-finite/non-integer/negative → `errorResult("id must be a non-negative integer.")` (or `"id is required."`).
- `x` not finite → `errorResult("x must be a finite number.")`.
- `y` not finite → `errorResult("y must be a finite number.")`.
- `pack` / `pack.ice` missing → throws caught and surfaced as error.
- No ice element with that `id` → `errorResult("No ice element found with id <n>.")`.
- `#ice` SVG root + `window.ice` both missing → `errorResult("#ice SVG element not found.")`.
- `<*[data-id={id}]>` not present under `#ice` → `errorResult("SVG element not found for ice id <n>.")`.

No range clamping — ice may legitimately move anywhere.

## Files

- `src/ai/tools/move-ice.ts` — implementation, with:
  - `MoveIceRef` (interface — `i`, `type`, `oldOffset`).
  - `MoveIceLookup` discriminated union (`{kind: "found", ref, svgEl, iceData}`,
    `{kind: "not_found"}`, `{kind: "ice_root_missing"}`, `{kind: "svg_not_found"}`).
  - `MoveIceRuntime` interface with:
    - `findIce(id)` — returns the lookup union (resolves both pack
      entry and SVG element together so the runtime can be mocked
      cleanly).
    - `setTransform(svgEl, value)` — write `transform` on the element.
    - `setOffset(iceData, x, y)` — assign `[x, y]` to `iceData.offset`.
  - `defaultMoveIceRuntime` — uses `getPack`, `getGlobal("ice")` (D3
    selection) for the layer root, `document.getElementById("ice")` as
    fallback. Looks up the element via
    `iceRoot.querySelector('[data-id="<id>"]')`.
  - `createMoveIceTool(runtime?)` — factory.
  - `moveIceTool` — default exported tool instance.
- `src/ai/tools/move-ice.test.ts` — Vitest unit + integration tests.
- `src/ai/index.ts` — register `moveIceTool` and add the import.

## Wiring

In `src/ai/index.ts`:
- Add `import { moveIceTool } from "./tools/move-ice";` near the other
  ice-tool imports.
- Add `moveIceTool` to the exported tool array near the other ice
  tools.
- Register via `registry.register(moveIceTool);` near
  `registry.register(removeIceTool);` and the other ice registrations.

## Tests (Vitest)

Unit tests with a mocked `MoveIceRuntime`:

- Happy path iceberg: pack.ice has iceberg id=7 with offset=[10,20]; SVG
  element with `data-id="7"` exists. `move_ice` id=7 x=100 y=200 →
  `setTransform` called with element + `"translate(100,200)"`;
  `setOffset` called with iceData + (100, 200); response reports
  `old_offset=[10,20]`, `new_offset=[100,200]`, `type="iceberg"`.
- Happy path glacier: same shape but `type="glacier"`.
- First move (no prior `offset`): `old_offset=null`.
- Negative coords accepted: x=-50, y=-100.
- Non-integer coords accepted: x=1.5, y=2.7.
- `findIce` kind=`not_found` → error matching the id, no setTransform.
- `findIce` kind=`svg_not_found` → error mentioning the id, no
  setTransform; pack.ice unchanged.
- `findIce` kind=`ice_root_missing` → error mentioning `#ice`, no
  setTransform; pack.ice unchanged.
- `setTransform` throwing surfaces as error.
- `id` validation: missing/null/non-number/non-integer/negative/non-finite → errors.
- `x` validation: missing/non-number/NaN/+Infinity/-Infinity → error.
- `y` validation: missing/non-number/NaN/+Infinity/-Infinity → error.
- Tool name is `"move_ice"` and round-trips through `ToolRegistry`.

Integration tests with the default runtime, mocking `globalThis.pack`,
`globalThis.ice`, and `globalThis.document`:

- Happy path via the `window.ice` D3 selection: writes `transform`
  attribute on the matching `<g data-id="7">` element AND mutates
  `pack.ice[idx].offset` to `[x, y]`.
- Falls back to `document.getElementById("ice")` when `window.ice` D3
  selection is missing.
- Both window.ice and `#ice` missing → error.
- Pack present but `pack.ice` missing → error.

## Self-review notes

- See `aiplans/tasks_315.md` for the implementation steps. Self-review
  check: confirmed runtime seam matches existing patterns
  (`move-label.ts` exposes `findLabel`, `getTransform`, `setTransform`;
  `set-lake-group.ts` returns a discriminated union from `find`).
  We do **not** need a `getOffset` runtime call because the lookup
  already returns the `iceData` reference whose `offset` we read. Old
  offset is captured BEFORE writing the new transform/offset.
- Picked an "absolute" semantic to match `move_label` and `move_burg`
  (consistent across position-mutating tools); documented in the tool
  description and in this plan.
- Querying `[data-id="<n>"]` mirrors the legacy editor: `editIce` reads
  `+elSelected.attr("data-id")` and the drag handler writes the
  transform on the same element. The data attribute is set by the ice
  renderer (`src/renderers/draw-ice.ts`) on each rendered element.
- No need to re-trigger redraw — like the legacy drag handler, we set
  the transform directly on the live SVG element. The next full
  re-render (on layer toggle / load) will read the offset back from
  `pack.ice[*].offset` if the renderer respects it; this is consistent
  with the persistence done in `dragElement`.

## Lint baseline

`npm run lint` from master @ 85ed4ab (clean tree on plan-315 base):
7 warnings, 1 info, no errors. Warnings are pre-existing
(`d3[curveType]` dynamic namespace access in `draw-heightmap.ts` and
similar). The new tool must not introduce additional findings.
