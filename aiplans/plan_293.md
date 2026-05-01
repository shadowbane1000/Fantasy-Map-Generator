# Plan 293 — `list_lake_groups` AI tool

## Use case

Mirror the dropdown-population logic in `selectLakeGroup()` of
`public/modules/ui/lakes-editor.js`:

```js
const select = byId("lakeGroup");
select.options.length = 0;
lakes.selectAll("g").each(function () {
  select.options.add(new Option(this.id, this.id, false, this.id === lake.group));
});
```

Give the AI a read-only equivalent: list every existing lake group on
the current map, in document order, alongside per-group lake counts and
an `is_default` flag. Direct analogue of `list_route_groups` (just merged
in plan 287); pairs naturally with `set_lake_group` (plan 291).

## Lint baseline

`npm run lint` on master @ 26960b3 produces:

```
Skipped 2 suggested fixes.
Checked 684 files in ~520ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

The new tool must not regress this.

## Behavior

1. Read the direct `<g>` children of the `lakes` D3 selection
   (`window.lakes`) — same source `selectLakeGroup()` uses. Fall back to
   `document.getElementById("lakes")`'s `<g>` children when the D3
   selection is unavailable (matches the symmetry route-groups uses for
   `#routes`).
2. For each group element collect:
   - `id` — the SVG `<g>`'s `id` attribute.
   - `childCount` — count of direct child elements (used as fallback
     when `pack.features` is unavailable; lake renderings under
     `#lakes > <g>` are `<use data-f="…">` elements per `set_lake_group`).
3. Read `pack.features` (when available) and build a per-group count of
   live lakes — entries with `feature.type === "lake"`, `feature.group ===
   id`, and not removed (skip `removed: true`). `pack.features[0]` is a
   placeholder; skip it. This matches the convention used by
   `rename-lake.ts` and `set-lake-group.ts`.
4. Return `{ count, groups: [...] }` where each entry is
   `{ id, lake_count, is_default }`. `is_default` is true iff `id` is in
   `["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"]`.
5. Order: SVG document order — do NOT sort.

### Fallback behavior

- `pack` / `pack.features` missing → return groups but use the SVG
  `<g>`'s child element count as `lake_count` (parity with
  `list_route_groups`'s pack-routes-missing fallback). No `note` field;
  the description documents this fallback.
- `lakes` D3 selection AND `#lakes` element both missing → error
  `errorResult("Lakes layer is unavailable; cannot list lake groups. ...")`.

## Input/return schema

Input: none (no parameters; matches `list_route_groups`).

```json
{ "type": "object", "properties": {} }
```

Return (success):

```json
{
  "ok": true,
  "count": <int>,
  "groups": [
    { "id": "freshwater", "lake_count": 4, "is_default": true },
    { "id": "salt", "lake_count": 1, "is_default": true },
    { "id": "lake-custom", "lake_count": 0, "is_default": false }
  ]
}
```

Return (error):

```json
{ "ok": false, "error": "Lakes layer is unavailable; cannot list lake groups. Wait for the map to finish loading." }
```

## Files

- New: `src/ai/tools/list-lake-groups.ts`
- New: `src/ai/tools/list-lake-groups.test.ts`
- Modify: `src/ai/index.ts` — import + export-block + `registry.register`
  (positioned near the other lake/route-group registrations).

## Module structure (mirrors `list-route-groups.ts`)

- Export `DEFAULT_LAKE_GROUPS` const tuple of the six default ids.
- Export `LakeGroupSummary { id; lake_count; is_default }`.
- Export `LakeGroupElement { id; childCount }`.
- Export `ListLakeGroupsRuntime` interface with:
  - `readGroupElements(): LakeGroupElement[] | null`
  - `readPackFeatures(): unknown[] | null` — returns `pack.features` array
    (which is heterogeneous — slot 0 is placeholder, others are objects).
- Export `defaultListLakeGroupsRuntime`:
  - `readGroupElements`: try D3 selection at `window.lakes`
    (`selectAll("g")._groups[0]`), then fall back to
    `document.getElementById("lakes").children` filtered to `<g>` tags.
  - `readPackFeatures`: read `getPack<LakeFeaturesPackLike>()?.features`,
    returning `null` when absent / not an array.
- Export `createListLakeGroupsTool(runtime?)` factory.
- Export `listLakeGroupsTool` (default-runtime instance).

## Implementation notes

- Use the same `_shared` helpers as `list-route-groups.ts`:
  `errorResult`, `getGlobal`, `getPack`, `okResult`.
- Use the same D3 / DOM probe pattern (`MinimalElementLike`,
  `D3MultiSelectionLike`, etc.) — copy structure verbatim and rename.
- Per-group count via a `Map<string,number>` populated by a single pass
  over `pack.features` (skip `[0]`, skip non-lake, skip `removed: true`).

## Error cases

| Condition | Result |
| --- | --- |
| Both `window.lakes` D3 selection and `#lakes` element missing | error: "Lakes layer is unavailable; cannot list lake groups. Wait for the map to finish loading." |
| `pack.features` missing or not an array | success; `lake_count` = SVG child count fallback |
| `pack.features` empty array | success; `lake_count` = 0 for every group |
| No `<g>` children under `#lakes` | success; `count: 0`, `groups: []` |

## Tests (Vitest)

`list-lake-groups.test.ts`:

1. Metadata block:
   - Tool name is `list_lake_groups`.
   - Empty input schema.
   - `DEFAULT_LAKE_GROUPS` matches `["freshwater","salt","sinkhole","frozen","lava","dry"]`.
   - `createListLakeGroupsTool()` produces an equivalent tool.
   - Registers and round-trips through `ToolRegistry`.

2. Tool happy path with mocked runtime:
   - 3 groups: one default with 2 lakes, one custom non-default with 1
     lake, one default with 0 lakes — counts/is_default correct, in
     document order (SVG order, not alphabetical).
   - SVG order preserved even when alphabetical would differ.
   - Skips `removed: true` lakes from per-group count.
   - Skips features whose `type !== "lake"` from per-group count.
   - Skips index-0 placeholder.
   - Falls back to `childCount` when `pack.features` is null.
   - Empty `<g>` list returns `count: 0, groups: []`.
   - Accepts `{}`, `null`, `undefined` input uniformly.
   - Returns error when `readGroupElements()` returns null; never
     calls `readPackFeatures` (fail-fast).
   - Identifies all six default groups via `is_default`.

3. `defaultListLakeGroupsRuntime` integration:
   - Reads `<g>` nodes from `window.lakes._groups[0]` in order.
   - Falls back to `document.getElementById("lakes")` when `window.lakes`
     is absent.
   - Uses childCount fallback when `pack.features` is missing.
   - Errors when neither `window.lakes` nor `#lakes` element is
     available.

## Wiring

In `src/ai/index.ts`:

- Add `import { listLakeGroupsTool } from "./tools/list-lake-groups";`
  (alphabetical with the `list-*` imports, near `listRouteGroupsTool`).
- Add the `export { … }` block next to the `list-route-groups` re-export.
- Add `registry.register(listLakeGroupsTool);` near the other
  lake/route group registrations.

## Review

Re-read both `plan_293.md` and `tasks_293.md` after writing.

- Confirms `DEFAULT_LAKE_GROUPS` matches the literal in `removeLakeGroup`.
- Tool name `list_lake_groups` is consistent with `list_route_groups`,
  `list_burg_groups` precedent.
- No inputs (parity with `list_route_groups`) — kept simplest.
- Fallback policy: SVG child count when `pack.features` is unavailable.
  Matches `list_route_groups` exactly. Documented in tool description.
- Tests cover all required cases plus document-order preservation,
  feature-type filtering, removed-lake filtering, and the integration
  default runtime.
- Wiring reuses the same export-block / register-ordering pattern used
  by `list_route_groups` and `set_lake_group`.
