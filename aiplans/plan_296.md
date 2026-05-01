# Plan 296 — `add_label_group` AI tool

## Use case

Implement an AI-chat tool `add_label_group` that creates a new (empty) label
group container `<g>` under the `#labels` SVG layer. This is the labels
analogue of `add_lake_group` (plan 294) and `add_route_group` (plan 286).

The legacy UI's `createNewGroup` in `public/modules/ui/labels-editor.js`
creates the group AND moves the currently-selected label into it. We want
the simpler primitive: "create the group; assignment is a separate
operation." Pair with a future `set_label_group` for assignment.

## Lint baseline (pre-change)

`npm run lint 2>&1 | tail` summary:

```
Checked 692 files in 532ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

## Behavior

- Sanitize the supplied name with the existing `sanitizeGroupName` helper
  imported from `src/ai/tools/add-route-group.ts`:
  `lowercase → spaces→underscores → strip non-\w/\s`.
- No prefix is added — label group ids are bare (e.g. `states`,
  `addedLabels`, or any custom name), matching how lake group ids are
  bare.
- Reject empty/whitespace-only inputs, sanitization-empty results,
  numeric-leading sanitized ids, and global-id collisions (matches UI's
  `byId()` semantics — global to the document, not just under
  `#labels`).
- Append a new `<g id={sanitized}>` under the `#labels` layer. Prefer
  the `window.labels` D3 selection's `.node()` if available; fall back
  to `document.getElementById("labels")`.
- Donor inheritance: when an existing label `<g id="states">` is
  present, shallow-clone its attributes via `cloneNode(false)` so the
  new group inherits any default styling. Set the new id explicitly.
- When no donor is present, create a bare `<g>` via `createElementNS`
  (SVG namespace) or `createElement` fallback.
- When neither `window.labels` nor `#labels` is available, error out.

## Input schema

```ts
{
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, description: "..." }
  },
  required: ["name"]
}
```

## Files

- `src/ai/tools/add-label-group.ts` — new tool. Exports
  `AddLabelGroupRuntime`, `defaultAddLabelGroupRuntime`,
  `createAddLabelGroupTool`, `addLabelGroupTool`.
- `src/ai/tools/add-label-group.test.ts` — tests.
- `src/ai/index.ts` — register import + barrel export + registry.

## Errors

- `name` missing/empty/whitespace → "name must be a non-empty string."
- Sanitized name empty → "Invalid group name (sanitized to empty)."
- Sanitized name starts with a digit → "Group name must start with a
  letter."
- Sanitized id collides with an existing element → "Element with id
  {id} (<{tag}>) already exists." (`<{tag}>` only when known)
- Append failure (no labels layer) → surfaced from runtime via
  `try/catch` → "#labels SVG layer is unavailable."

## Self-review

Read after writing:
- Mirrors `add-lake-group.ts` 1:1 with `lakes` → `labels` and donor
  `freshwater` → `states` (which `selectLabelGroup` checks first;
  reliable in fresh maps).
- `sanitizeGroupName` is imported from `add-route-group`, not
  redefined. The route-group's `prefixWithRoute` is NOT used (and a
  regression test guards against accidentally prefixing).
- All collision checks use `byId()` semantics (global), matching the
  UI.
- Default runtime falls back gracefully from D3 selection → DOM lookup;
  errors clearly when neither is present.
- Tool is registered in `src/ai/index.ts` near the other label / lake
  group tools.
- Will record final lint, tsc, and test results after implementation.

## Final verification

- `npm run lint`: Checked 694 files, 7 warnings, 1 info (matches
  baseline: 7 warnings + 1 info; +2 files = the new ts + test).
- `npx tsc --noEmit`: clean (no output).
- `npm test`: 309/309 test files, 5391/5391 tests passed (added 19
  new tests in `add-label-group.test.ts`).
