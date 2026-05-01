# Plan 289 — `list_burg_groups` AI tool

## Use case

Add a new AI chat tool **`list_burg_groups`** so the model can read the
configured burg groups from `window.options.burgs.groups` and report
their per-group burg counts. Mirrors the read/display logic of the
burg-group editor (`public/modules/ui/burg-group-editor.js` →
`addLines()` / `createLine()` — count is computed there as
`pack.burgs.filter(b => !b.removed && b.group === group.name).length`).
The user can already open that editor and see the table; the AI now has
the same view as a structured payload.

## Lint baseline (master @ 42af381)

`npm run lint`:

- Found 7 warnings.
- Found 1 info.
- 0 errors.
- 676 files checked.

The new code must keep the count at the same numbers (no new warnings,
no new infos, no errors).

## Behavior

- Tool name: `list_burg_groups`.
- Input: optional `include_inactive` boolean (default `true`). When
  `false`, groups whose `active === false` are omitted from the result.
- Output: `okResult` with:
  - `groups`: array preserving the original index order in
    `options.burgs.groups` (NOT alphabetical, NOT by `order` — array
    order). After filtering when `include_inactive: false`, the
    surviving groups stay in their original relative order.
  - `count`: number of groups returned (after filtering).
  - `total`: total number of configured groups (before filtering).
  - When `pack.burgs` is missing, response also has
    `pack_burgs_missing: true` and a `note` string ("`pack.burgs`
    unavailable; per-group burg_count reported as 0.").
- Errors:
  - `options.burgs.groups` missing or not an array →
    `errorResult("options.burgs.groups is missing or not an array.")`.
  - `include_inactive` provided but not boolean →
    `errorResult("include_inactive must be a boolean.")`.

### Field mapping (per group)

Maps the createLine input shape (legacy stored form) to the response
shape; matches the editor's HTML attributes 1:1.

| Source field           | Output field   | Type / null rule                                                               |
| ---------------------- | -------------- | ------------------------------------------------------------------------------ |
| `name`                 | `name`         | string (always present; group identifier; matches `burg.group`)                |
| `order`                | `order`        | number \| null (null when missing/non-finite)                                  |
| `preview`              | `preview`      | string \| null — null when missing or empty `""`                               |
| `min`                  | `min`          | number \| null (null when missing/non-finite)                                  |
| `max`                  | `max`          | number \| null (null when missing/non-finite)                                  |
| `percentile`           | `percentile`   | number \| null (null when missing/non-finite)                                  |
| `biomes`               | `biomes`       | string \| null — null when missing or empty                                    |
| `states`               | `states`       | string \| null — null when missing or empty                                    |
| `cultures`             | `cultures`     | string \| null — null when missing or empty                                    |
| `religions`            | `religions`    | string \| null — null when missing or empty                                    |
| `features`             | `features`     | object — `{}` when absent, otherwise the stored object (shallow copied)        |
| `active`               | `active`       | boolean — coerced via `=== true`; missing → `false`                            |
| `isDefault`            | `is_default`   | boolean — coerced via `=== true`; missing → `false`                            |
| derived from pack.burgs| `burg_count`   | number — `pack.burgs.filter(b => !b.removed && b.group === group.name).length` (0 when pack.burgs missing) |

Nothing else is exposed (no editor-only HTML fragments).

## Files

- **New** `src/ai/tools/list-burg-groups.ts`
  - Exports the `BurgGroupSummary` shape, the `ListBurgGroupsRuntime`
    interface, `defaultListBurgGroupsRuntime`,
    `createListBurgGroupsTool(runtime?)`, and `listBurgGroupsTool`
    (default-runtime version).
  - Pure helpers split out so tests can exercise the mapping directly:
    - `mapBurgGroup(group, burgCount): BurgGroupSummary` — pure mapper.
    - `countBurgsForGroup(burgs, name): number` — counts non-removed
      matching burgs.
    - `readBurgGroupsFromState(options, pack)` — combines the two and
      returns either `{ groups, packBurgsMissing }` or an error string.
- **New** `src/ai/tools/list-burg-groups.test.ts`
- **Edit** `src/ai/index.ts`
  - Import `listBurgGroupsTool`.
  - Re-export `createListBurgGroupsTool, listBurgGroupsTool` (and the
    `BurgGroupSummary` type) from `./tools/list-burg-groups`.
  - Register `listBurgGroupsTool` in the `registerDefaultTools` block,
    near `listBurgsTool`.

## Wiring details

- Import block (alphabetical-ish): place
  `import { listBurgGroupsTool } from "./tools/list-burg-groups";`
  immediately before `import { listBurgsTool } from "./tools/list-burgs";`.
- Re-export block: place the `export { createListBurgGroupsTool,
  listBurgGroupsTool } from "./tools/list-burg-groups";` block before
  the existing `list-burgs` re-export block.
- Registration: `registry.register(listBurgGroupsTool);` immediately
  before `registry.register(listBurgsTool);` in
  `registerDefaultTools`.

## Validation rules

- `include_inactive`: when defined, must be boolean — else
  `errorResult`.
- `options.burgs.groups`: must be an array — else `errorResult`.
- Inputs that are not plain objects (null/undefined) are treated as
  empty input (use defaults).

## Test plan (Vitest)

`src/ai/tools/list-burg-groups.test.ts`:

1. **Happy path**: two groups configured (`cities`, `villages`); pack
   has 5 burgs, three in `cities`, one in `villages`, one in `cities`
   but `removed:true`. Response:
   - `count` = 2, `total` = 2, `groups.length` = 2.
   - Order matches array order.
   - `cities.burg_count` = 2 (removed one excluded).
   - `villages.burg_count` = 1.
   - All field mappings reflect the stored object exactly (preview,
     min, max, percentile, biomes, states, cultures, religions,
     features, active, is_default).
2. **Empty / null normalization**: a group with `preview: ""`,
   `biomes: ""`, `min: undefined`, `features: undefined` ends up with
   nullified scalar fields and `features: {}`.
3. **`include_inactive: false`**: an inactive group is excluded;
   active group(s) remain in original relative order; `count` reflects
   the post-filter size, `total` reflects the pre-filter size.
4. **`include_inactive: true` (default)**: same data set as case 3 but
   inactive group is present.
5. **`removed: true` burgs ignored** in `burg_count`. (Covered by case
   1 but called out explicitly via a focused test for visibility.)
6. **`pack.burgs` missing**: returns `groups` with `burg_count: 0` and
   `pack_burgs_missing: true` plus `note` string.
7. **`options.burgs.groups` missing entirely**: error result,
   `isError: true`, message `"options.burgs.groups is missing or not
   an array."`.
8. **`options.burgs.groups` is not an array**: same error.
9. **`include_inactive` non-boolean**: error result,
   `"include_inactive must be a boolean."`.
10. **Tool name + registry round-trip**: tool's `name` is
    `list_burg_groups`; a fresh `ToolRegistry` with
    `listBurgGroupsTool` registered runs it via `registry.run` and
    returns a parseable JSON body.
11. **`is_default` coercion**: a group with `isDefault: true` →
    `is_default: true`; one without the field → `is_default: false`.
12. **`active` coercion**: a group with `active: true` → `active:
    true`; without the field → `active: false` (and is filtered out
    when `include_inactive: false`).
13. **Default runtime smoke** (paralleling other tools'
    integration-style block): stub `globalThis.options` and
    `globalThis.pack`, call `listBurgGroupsTool.execute({})`, and
    confirm the body is shaped correctly. Restore globals after.
14. **Array order preserved (NOT sorted by `order`)**: configure three
    groups whose stored `order` values would sort differently from
    array order (e.g. array = [A(order=3), B(order=1), C(order=2)])
    and assert response `groups[*].name` is `[A, B, C]`.
15. **Non-object input tolerated**: `execute(null)` and
    `execute(undefined)` use defaults (include_inactive=true) and
    succeed.

## Patterns to copy

- `src/ai/tools/list-burgs.ts` for the runtime-injection seam shape
  (interface + default + create function + default-runtime export).
- `src/ai/tools/list-style-presets.ts` for a no-pagination Tool that
  returns `okResult({ items, count })`.
- `src/ai/tools/_shared/{globals,results}` helpers (`getGlobal`,
  `getPack`, `okResult`, `errorResult`).

## Review

Self-review pass (mandatory step 4):

- **Tasks accomplish plan?** Yes. Task 2 maps to the `Files` section
  point-for-point. Task 3 covers every test case in the plan's Test
  plan. Task 4 matches the Wiring details. Tasks 5-7 enforce the
  Verify constraints.
- **Plan accomplishes use case?** Yes — field mapping table is exact
  to `createLine`'s read shape (every input HTML attr is sourced from
  `group.<name>`, the editor's HTML-only `up/down/remove` buttons are
  intentionally omitted), count derivation matches the editor's
  `count` line verbatim, and the `include_inactive` filter mirrors
  what a user would see when only browsing active groups in the
  editor.
- **Tests verify the use case?** After this review, yes. Added test
  #14 to lock in array-order preservation (independent of `order`
  field) — without it, a sort-by-order regression could pass. Added
  test #15 to lock in non-object input tolerance (`null` /
  `undefined`) since the tool description allows omission.
- **Behavior changes from review**: none beyond test additions; the
  field mapping and error rules remain as originally specified.
- **No gold-plating**: the plan deliberately omits enriched lookup
  fields (e.g. resolving comma-separated state ids to names) — that's
  out of scope for a "list" tool that mirrors the editor. The editor
  shows the user the raw csv and uses `selectLimitation` to translate
  on demand; matching its surface keeps this tool small.
