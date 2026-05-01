# Plan 350 — `remove_coastline_group` AI tool

## Use case

The Coastline Editor (`public/modules/ui/coastline-editor.js` lines
175-200) renders a "Remove" button bound to `removeCoastlineGroup`:

```js
function removeCoastlineGroup() {
  const group = elSelected.node().parentNode.id;
  if (["sea_island", "lake_island"].includes(group))
    return tip("This is one of the default groups, it cannot be removed", false, "error");

  const count = elSelected.node().parentNode.childElementCount;
  alertMessage.innerHTML = `Are you sure you want to remove the group? All coastline elements of the group (${count}) will be moved under <i>sea_island</i> group`;
  // ... confirm dialog → on Remove:
  const sea = byId("sea_island");
  const groupEl = byId(group);
  while (groupEl.childNodes.length) {
    sea.appendChild(groupEl.childNodes[0]);
  }
  groupEl.remove();
  byId("coastlineGroup").selectedOptions[0].remove();
  byId("coastlineGroup").value = "sea_island";
}
```

Plan 349 added `add_coastline_group` (creates an empty `<g>` under
`#coastline`); this plan adds the natural counterpart, the missing
`remove_coastline_group`. Sibling families already have their `remove_*_group`
tool (`remove_lake_group`, `remove_burg_group`, `remove_route_group`,
`remove_label_group`). The closest pattern is `remove_lake_group` — same
DOM-only operation with a default fallback group, except coastline features
are NOT mirrored in `pack` so there is no pack-side reassignment to do.

## Lint baseline (before any changes)

`npm run lint` on plan-350 base (`master @ ecc80ef`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 805 files in 643ms. No fixes applied.
```

Clean. No warnings, no errors. Post-implementation lint must remain clean.

## Tool name

`remove_coastline_group`

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Coastline group name to remove. Will be sanitized identically to add_coastline_group."
    }
  },
  "required": ["name"]
}
```

Only the `name` field is supported. Sanitization uses the same pipeline as
`add_coastline_group` so callers can pass a human-friendly name like
`"Storm Coast"` and have it resolved to `storm_coast`.

## Behavior

1. Validate `name` is a non-empty string (error if missing / not string /
   empty after trim).
2. Sanitize via `sanitizeGroupName` re-exported from
   `add-route-group.ts` (the same function used by `add-coastline-group.ts`).
   Pipeline: `lowercase → spaces→underscores → strip non-\w/\s`. NO prefix
   added — coastline group ids are bare.
3. Reject empty sanitized result with
   `"Group name must contain at least one valid character."`.
4. Reject the two default groups: `sea_island` and `lake_island`
   (legacy explicitly rejects both via
   `["sea_island", "lake_island"].includes(group)`):
   `"Cannot remove the default '<id>' coastline group."`.
5. Verify a `<g id={id}>` exists as a direct child of `#coastline`. Error
   `"No coastline group with id '<id>' exists under #coastline."` otherwise.
6. Verify `<g id="sea_island">` exists as a direct child of `#coastline`
   (we need it as the move target). Error
   `"Cannot remove '<id>': the default 'sea_island' group is missing."`.
7. Move every child of `<g id={id}>` into `<g id="sea_island">` via
   `appendChild` (which moves nodes — preserves order and is what the
   legacy `while (groupEl.childNodes.length)` loop does).
8. Remove the now-empty `<g id={id}>`.
9. Best-effort: remove the matching `<option>` from
   `<select id="coastlineGroup">` if it exists. Soft-skip on failure.
10. Return `{ ok: true, id, moved_count, dropdown_option_removed }`.

Coastline features are NOT mirrored in `pack` (unlike lakes whose
`pack.features[i].group` mirrors the SVG group). So this tool is purely
DOM-side — no pack mutation step.

## Inputs/Outputs

Successful removal with 3 children and dropdown option present:
```jsonc
{
  "ok": true,
  "id": "shipping_lanes",
  "moved_count": 3,
  "dropdown_option_removed": true
}
```

Successful removal with 0 children and no dropdown:
```jsonc
{
  "ok": true,
  "id": "shipping_lanes",
  "moved_count": 0,
  "dropdown_option_removed": false
}
```

## Validation / error catalog

- `name` missing / not string / empty / whitespace-only after trim →
  `"name must be a non-empty string."`.
- Sanitized `name` empty (e.g. input `"!!!"` → `""` after sanitize) →
  `"Group name must contain at least one valid character."`.
- Sanitized id is `sea_island` or `lake_island` →
  `"Cannot remove the default '<id>' coastline group."`.
- No `<g id={id}>` as a direct child of `#coastline` →
  `"No coastline group with id '<id>' exists under #coastline."`.
- `<g id="sea_island">` not present under `#coastline` →
  `"Cannot remove '<id>': the default 'sea_island' group is missing."`.
- `#coastline` element itself not in the DOM →
  `"coastline SVG layer is not available."`.
- Runtime errors during the move/remove step are propagated verbatim via
  `errorResult(err.message)`.

## Files to add

- `src/ai/tools/remove-coastline-group.ts` — tool implementation.
- `src/ai/tools/remove-coastline-group.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Import alphabetically (after `removeBurgGroupTool`, before
    `removeCultureTool`):
    `import { removeCoastlineGroupTool } from "./tools/remove-coastline-group";`
  - Add re-export block alphabetically (between `remove-burg-group` and
    `remove-culture`):
    ```
    export {
      createRemoveCoastlineGroupTool,
      defaultRemoveCoastlineGroupRuntime,
      type RemoveCoastlineGroupRuntime,
      removeCoastlineGroupTool,
    } from "./tools/remove-coastline-group";
    ```
  - Add `registry.register(removeCoastlineGroupTool);` adjacent to the
    other `remove*Group` registrations (e.g. next to
    `removeLakeGroupTool` / `removeLabelGroupTool`).

## Runtime-injection seam

Modeled on `remove-lake-group.ts`, minus the pack-mutation surface
(coastline features have no `pack`-side mirror):

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

export { sanitizeGroupName };

export const DEFAULT_COASTLINE_GROUPS = ["sea_island", "lake_island"] as const;

export interface RemoveCoastlineGroupRuntime {
  /** True iff `#coastline` exists as an element in the DOM (or via the D3 selection). */
  coastlineLayerExists(): boolean;
  /** True iff a `<g id={id}>` is a direct child of `#coastline`. */
  groupExists(id: string): boolean;
  /** True iff `<g id="sea_island">` is a direct child of `#coastline`. */
  seaIslandExists(): boolean;
  /**
   * Move every child of `<g id={id}>` into `<g id="sea_island">` via
   * `appendChild` (which moves nodes — preserves order). Returns the
   * count moved. Throws when either group is missing.
   */
  moveChildrenAndRemoveGroup(id: string): number;
  /**
   * Best-effort: remove the matching `<option value={id}>` from
   * `<select id="coastlineGroup">`. Returns true on removal, false on
   * skip. Never throws.
   */
  removeDropdownOption(id: string): boolean;
}

export const defaultRemoveCoastlineGroupRuntime: RemoveCoastlineGroupRuntime = { ... };

export function createRemoveCoastlineGroupTool(runtime?): Tool { ... }

export const removeCoastlineGroupTool = createRemoveCoastlineGroupTool();
```

The runtime resolves `#coastline` via the `getGlobal<...>("coastline")` D3
selection (`.node()`) and falls back to `document.getElementById("coastline")`
— mirroring `add-coastline-group.ts`. Direct-child membership uses the same
`findDirectGroupChild` helper shape as `remove-lake-group.ts`.

## Tests (Vitest)

Mocked-runtime unit tests:

1. **Happy path**: name `"Shipping Lanes"` → id `shipping_lanes`,
   3 children moved, group removed; result
   `{ ok: true, id: "shipping_lanes", moved_count: 3, dropdown_option_removed: true }`.
2. **Sanitization**: `"Storm Coast"` → `storm_coast`; runtime called with
   sanitized id.
3. **Default `sea_island` rejected**: no runtime calls performed.
4. **Default `lake_island` rejected**: no runtime calls performed.
5. **Empty name** (`""`, `"   "`, `null`, `undefined`, `42`) → error.
6. **Object missing `name` key** → error.
7. **All-special-chars sanitized to empty** (`"!!!"`) → error
   `"Group name must contain at least one valid character."`.
8. **Missing group** (`groupExists` returns false) → error mentions id.
9. **Missing sea_island** (`seaIslandExists` returns false) → error
   mentions both id and `sea_island`. No move attempted.
10. **Missing #coastline layer** (`coastlineLayerExists` returns false) →
    error `"coastline SVG layer is not available."`.
11. **Dropdown option present** (`removeDropdownOption` returns true) →
    `dropdown_option_removed: true`.
12. **Dropdown option absent** (`removeDropdownOption` returns false) →
    no error, `dropdown_option_removed: false`.
13. **Tool name + schema**: `"remove_coastline_group"`, requires `name`.
14. **Registry round-trip**.
15. **Surfaces moveChildrenAndRemoveGroup throw**: error path.

Default-runtime integration tests (fake DOM with
`globalThis.coastline` and `globalThis.document`):

16. **Happy path**: real fake-DOM with `<g id="coastline">` containing
    `sea_island` and `shipping_lanes` (3 `use` elements). Tool removes
    `shipping_lanes`, moves all 3 elements into `sea_island`. Children
    move ORDER preserved.
17. **Default `sea_island`/`lake_island` rejected at integration layer**.
18. **Missing group at integration layer** → error.
19. **Missing sea_island at integration layer** → error.
20. **Missing #coastline at integration layer** → error.
21. **Dropdown option removed when `<select id="coastlineGroup">` is
    present**.
22. **Dropdown absent → still succeeds**, `dropdown_option_removed: false`.
23. **D3 path**: `globalThis.coastline.node()` resolves the layer; tool
    succeeds without `document.getElementById("coastline")`.
24. **Children-order preservation**: 4 named children inserted in order
    `[a, b, c, d]` → after move into a sea_island that already had
    `[s1, s2]`, sea_island's children are `[s1, s2, a, b, c, d]`.

## Verification

- `npm test` — full suite, all tests pass.
- `npm run lint` — clean (matches baseline: 805 files, no fixes /
  warnings / errors).
- `npx tsc --noEmit` — clean.

## Self-review

Re-read pass after drafting this plan and the tasks file:

- Both default groups (`sea_island` AND `lake_island`) are rejected per
  the legacy `["sea_island", "lake_island"].includes(group)` literal.
  Tests 3, 4, and 17 cover each.
- The "sea_island missing" case is handled distinctly from the "group
  missing" case so the operator can tell which precondition failed.
  Test 9 / 19 cover this.
- `moved_count` reflects the actual children moved (returned by
  `moveChildrenAndRemoveGroup`), not a precomputed estimate.
- Dropdown best-effort is exercised both ways: present (test 11/21)
  and absent (test 12/22).
- Sanitization is delegated to `sanitizeGroupName` (no reinvention),
  matching `add-coastline-group.ts` so the symmetric round-trip
  works (`add_coastline_group "Storm Coast"` then
  `remove_coastline_group "Storm Coast"` resolves the same id).
- Coastline features are NOT mirrored in `pack` (unlike lakes), so
  there is no pack-side reassignment step. This is documented in the
  tool description so the agent doesn't expect a pack mutation.
- The runtime's `coastlineLayerExists` is a separate seam from
  `groupExists` so the "no layer at all" case can produce a clearer
  error than "your custom group isn't there".
- Children move order is preserved because `appendChild` of the
  current `firstChild` walks left-to-right, just like the legacy
  `while (groupEl.childNodes.length) sea.appendChild(groupEl.childNodes[0])`
  loop. Test 24 verifies this with named children.
- Error wording is consistent in shape with `remove-lake-group.ts`
  (terse, lower-cased layer names, single-sentence). Where the legacy
  family uses `JSON.stringify(name)` for quoting, this tool uses
  single quotes around the sanitized id for readability — matching
  the description's literal `'<id>'` placeholders.
