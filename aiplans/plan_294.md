# Plan 294: `add_lake_group` AI chat tool

## Use case

Add a write-side AI chat tool, `add_lake_group`, that creates a new
(empty) lake group `<g>` element under the `#lakes` SVG layer. The
legacy UI's `createNewGroup` in `public/modules/ui/lakes-editor.js`
combines two operations: create the group AND move the currently
selected lake into it. For the AI tool we want the simpler primitive
— "create the group; assignment is a separate step via
`set_lake_group`."

This complements:

- `set_lake_group` — moves an existing lake into a (pre-existing) group.
- `list_lake_groups` — lists groups with counts.

Once a new group exists, `set_lake_group` can target it by id.

The tool is the closest cousin of the just-merged `add_route_group`
(plan 286). The shape mirrors that tool, with two key differences:

1. **No prefix.** Lake group ids are bare (`freshwater`, `salt`, custom
   names). The `route-` prefix that `add_route_group` applies is NOT
   applied here.
2. **No companion `<select>` updates.** The Edit Lake dialog rebuilds
   its `#lakeGroup` `<select>` lazily via `selectLakeGroup` each time
   the dialog opens, so we do not need to mutate any select element
   when we add a group. Skipping that update keeps the tool minimal
   and avoids depending on an open editor.

We DO reuse the exported `sanitizeGroupName` helper from
`add-route-group.ts` to avoid duplicating the sanitization regex
pipeline.

## Lint baseline

Captured before any work (`npm run lint 2>&1 | tail`):

- Files checked: 688
- Errors: 0
- Warnings: 7
- Info: 1

The final lint run must not regress past this baseline.

## Exact behavior to mirror (from `lakes-editor.js` lines ~169-189)

```js
function createNewGroup() {
  if (!this.value) { tip("Please provide a valid group name"); return; }
  const group = this.value
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^\w\s]/gi, "");

  if (byId(group)) {
    tip("Element with this id already exists. Please provide a unique name", false, "error");
    return;
  }

  if (Number.isFinite(+group.charAt(0))) {
    tip("Group name should start with a letter", false, "error");
    return;
  }
  // ... (UI then clones the parent <g> and re-parents the selected lake)
}
```

The tool must:

1. **Trim and reject empty.** Reject if the input is missing,
   non-string, empty, or whitespace-only.
2. **Sanitize** (reusing `sanitizeGroupName` from `add-route-group.ts`):
   - lowercase
   - spaces → underscores (`/ /g → "_"`)
   - strip non-`\w` and non-`\s` chars (`[^\w\s]/gi → ""`)
3. **Reject** if sanitized result is empty (e.g. `"!!!"`).
4. **Reject** if the first sanitized char is numeric
   (`Number.isFinite(+sanitized.charAt(0))` — same UI check).
5. **Reject** if `byId(sanitized)` already exists ANYWHERE in the
   document — this matches the UI's check (`if (byId(group))`), which
   is global to the whole document, not just `#lakes`.
6. **Append** a new `<g id={sanitized}>` under the `lakes` D3 selection
   (or `#lakes` SVG element if D3 selection is unavailable).
   - When an existing `<g id="freshwater">` is present, perform a
     shallow clone of its attributes (i.e. `cloneNode(false)`) so the
     new group inherits any default styling, then explicitly set the
     new id.
   - Otherwise, append a bare `<g>` with the new id.

We do NOT touch any `<select>` (the Edit Lake dialog rebuilds it on
open) and we do NOT move any existing lake into the new group
(callers use `set_lake_group` for that).

## Return shape

On success:

```
{ ok: true, id: <sanitized> }
```

On error: standard `errorResult` with one of:

- `"name must be a non-empty string."`
- `"Invalid group name (sanitized to empty)."`
- `"Group name must start with a letter."`
- `"Element with id <id> already exists."` (mention element's tag if
  cheaply available)
- `"#lakes SVG layer is unavailable."` (when both D3 selection and
  DOM `#lakes` are missing)

## Files

- `src/ai/tools/add-lake-group.ts` — new tool. Exports:
  - `AddLakeGroupRuntime` interface with:
    - `idExists(id: string): { exists: boolean; tag?: string }` — we
      surface the existing element's tag name when cheaply available,
      so the error message can say "g already exists" vs just
      "already exists".
    - `appendGroup(id: string): void` — handles the shallow-clone-of-
      `#freshwater` (or bare-`<g>` fallback) + new id assignment.
      Throws when neither the D3 `lakes` selection nor the DOM
      `#lakes` element are available.
  - `defaultAddLakeGroupRuntime` — uses `getGlobal("lakes")` for the
    D3 selection (preferred), falling back to
    `document.getElementById("lakes")` for raw DOM access.
  - `createAddLakeGroupTool(runtime?)` factory.
  - `addLakeGroupTool` default singleton.
- `src/ai/tools/add-lake-group.test.ts` — Vitest tests.
- `src/ai/index.ts` — alphabetical import (just before
  `addLakeGroupTool` would land between `addBurgTool` and
  `addRouteGroupTool` alphabetically — concretely we'll place it near
  the other lake-group tools and the `add-route-group` import for
  visual proximity), barrel re-export, and `registry.register(...)`
  call next to the existing `setLakeGroupTool` /
  `listLakeGroupsTool` registrations.

## Tool metadata

- name: `add_lake_group`
- description: One-paragraph doc mentioning the lakes-editor origin
  (`createNewGroup`), the sanitize rules (no prefix), the
  shallow-clone-of-`#freshwater` behavior, and that no existing
  lakes are moved (use `set_lake_group` for that).
- input_schema:
  - `name`: required string, min length 1 — the human-friendly group
    name. Will be sanitized.

## Input schema

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-friendly group name. Will be lowercased, spaces converted to underscores, and non-word characters stripped. Must not collide with an existing element id."
    }
  },
  "required": ["name"]
}
```

## Sanitization rules summary

- Reuse the **exported** `sanitizeGroupName` from `add-route-group.ts`
  (matches the UI's `[^\w\s]/gi` pipeline). **DO NOT** reuse
  `prefixWithRoute` — lake groups are unprefixed.
- Trim before checking emptiness, but pass the original string into
  `sanitizeGroupName` (the lowercase + replace pipeline is
  whitespace-tolerant; trimming the input is only used to decide
  emptiness up front).

## Validation rules summary

- `name` must be a non-empty string after `trim()`.
- After sanitization, must be non-empty.
- The first char of the sanitized id must not be a digit (mirrors UI).
- The final id must not collide with an existing element anywhere in
  the document.
- The `#lakes` SVG layer must exist (either via D3 selection or DOM).

## Error cases

| Input | Error message |
| --- | --- |
| missing/non-string | `name must be a non-empty string.` |
| empty / whitespace-only | `name must be a non-empty string.` |
| sanitizes to empty (`!!!`) | `Invalid group name (sanitized to empty).` |
| starts with digit (`9foo`) | `Group name must start with a letter.` |
| id collides w/ existing element | `Element with id <id> already exists.` (with tag if available) |
| neither D3 `lakes` nor `#lakes` element available | `#lakes SVG layer is unavailable.` |

## Test plan (Vitest)

Mirror `add-route-group.test.ts` structure: a "fake runtime" block for
tool-level behavior, plus a `defaultAddLakeGroupRuntime` integration
block patching `globalThis`.

Tool-level (with fake runtime):

1. **Happy path**: `"Wetlands"` → final id `wetlands`,
   `appendGroup("wetlands")` called.
2. **Sanitization**: `"My Cool Group!"` → final id `my_cool_group`
   (spaces→underscores, `!` stripped, lowercased).
3. **No `route-` prefix** (regression guard against accidentally
   importing the wrong helper) — `"foo"` → final id `foo`, NOT
   `route-foo`.
4. **Reject** non-string, empty, whitespace-only.
5. **Reject** sanitization-empties (`"!!!"`).
6. **Reject** numeric-first sanitized name (`"9foo"`).
7. **Reject** collision when `idExists` returns true.
8. Error includes existing-element tag when runtime supplies it.
9. Surfaces runtime failures (`appendGroup` throws → `isError`).
10. Tool name = `"add_lake_group"`.
11. Registry round-trip via `new ToolRegistry()`.

Default-runtime integration (patching `globalThis`):

12. With `globalThis.lakes` D3 selection set: appends a `<g>` via the
    D3 chain with the correct id.
13. With NO `globalThis.lakes` D3 selection but `globalThis.document`
    + `#lakes` DOM element present: appends a `<g>` via DOM.
14. When `<g id="freshwater">` exists, the new `<g>` inherits its
    shallow attributes (e.g., `fill`).
15. With neither D3 nor DOM `#lakes` available: errors with
    `"#lakes SVG layer is unavailable."`.
16. Errors when `getElementById(id)` returns truthy (collision)
    with both an existing `<g id="freshwater">` and an existing
    element elsewhere with the same id.

## Wiring

- Import alphabetically — concretely just before the
  `addRouteGroupTool` import (since `add-lake-group` < `add-route` <
  `add-route-group` alphabetically). Inspect `src/ai/index.ts` to
  confirm exact placement.
- Barrel re-export the public API of the module
  (`AddLakeGroupRuntime`, `addLakeGroupTool`, `createAddLakeGroupTool`,
  `defaultAddLakeGroupRuntime`).
- Register near the other lake-group tools
  (`setLakeGroupTool`, `listLakeGroupsTool`).

## Review

Self-review against the workflow checklist:

- **Do the tasks accomplish the plan?** Yes. Tasks 1 and 2 produce
  the source file and tests described in the plan; task 3 wires the
  registration; task 4 verifies. Plan and tasks both call out the
  same trim → sanitize → empty-check → numeric-first → collision →
  DOM mutate ordering.
- **Does the plan accomplish the use case?** Yes. The tool creates
  an empty lake group; assignment is left to `set_lake_group`. The
  sanitization and validation pipeline mirrors `createNewGroup` in
  `lakes-editor.js` exactly. The shallow-clone-of-`#freshwater`
  behavior preserves any UI-set default styling on the new group.
- **Do the tests verify the use case?** Yes. The fake-runtime block
  asserts the input → sanitized id pipeline (cases 1–3), error
  paths (cases 4–9), and registry round-trip (cases 10–11). The
  integration block asserts D3 selection plumbing (12), DOM fallback
  (13), shallow attribute inheritance (14), missing-layer error (15),
  and collision detection in both `<g id="freshwater">` and elsewhere
  (16).
- **Caveats**:
  - We deliberately do NOT update any `<select>`. The Edit Lake
    dialog rebuilds `#lakeGroup` lazily; the UI's `createNewGroup`
    only does `byId("lakeGroup").options.add(...)` because it's
    inside the open editor flow. Outside that flow, the option list
    is rebuilt on next open.
  - We deliberately do NOT move any lake into the new group. That's
    `set_lake_group`'s job.
  - We import `sanitizeGroupName` from `add-route-group.ts` (already
    exported). This couples the two tools, but the shared regex is
    semantically identical (the UI literally repeats it across
    editors). Future refactor could move the helper into
    `_shared/`, but plan 286 already exposed it from
    `add-route-group.ts`, and adding a second consumer is fine.

No corrections beyond what's already inline above.
