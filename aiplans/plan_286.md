# Plan 286: `add_route_group` AI chat tool

## Use case

Add a write-side AI chat tool, `add_route_group`, that creates a new
route group `<g>` element under the `#routes` SVG layer, mirroring the
behavior of the user-facing `addGroup` function in
`public/modules/ui/route-group-editor.js`. The Routes Editor has a
"Group" dropdown that lets users assign routes to groups (e.g. `roads`,
`trails`, `searoutes`, plus any custom groups), and the route-group
editor lets users add new groups; the AI currently has no way to add a
new group.

This complements `set_route_group` (which writes `route.group` on an
existing route and reparents the SVG under the existing group element).
Once a new group exists, `set_route_group` (or future tools) can target
it by id.

## Lint baseline

Captured before any work:

- Files checked: 672
- Errors: 0
- Warnings: 7
- Info: 1

The final lint run must not regress past this baseline.

## Exact behavior to mirror (from `route-group-editor.js`)

```js
let group = v
  .toLowerCase()
  .replace(/ /g, "_")
  .replace(/[^\w\s]/gi, "");

if (!group) return tip("Invalid group name", false, "error");
if (!group.startsWith("route-")) group = "route-" + group;
if (byId(group)) return tip("Element with this name already exists. ...");
if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

routes
  .append("g")
  .attr("id", group)
  .attr("stroke", "#000000")
  .attr("stroke-width", 0.5)
  .attr("stroke-dasharray", "1 0.5")
  .attr("stroke-linecap", "butt");
byId("routeGroup")?.options.add(new Option(group, group));
addLines();

byId("routeCreatorGroupSelect").options.add(new Option(group, group));
```

The tool must:

1. **Sanitize** the user-supplied name:
   - lowercase
   - spaces → underscores (`/ /g → "_"`)
   - strip every non-`\w` and non-`\s` char (`[^\w\s]/gi → ""`)
2. **Reject empty** sanitized result.
3. **Auto-prefix** with `route-` if the sanitized name doesn't start
   with `route-`. **UI quirk preserved**: the sanitization regex
   `[^\w\s]/gi` strips hyphens, so an already-prefixed input like
   `"route-bar"` first becomes `"routebar"` and then gets prefixed
   again to `"route-routebar"`. This matches the legacy UI exactly;
   we do not "fix" it.
4. **Reject** if the first character of the (final) id is numeric
   (`Number.isFinite(+group.charAt(0))`). Important: the prefix step
   runs first, so a name like `"42 lanes"` gets turned into
   `"route-42_lanes"` and **passes** (its first char is `r`). A name
   like `"-foo"` becomes `"route--foo"` and passes. The numeric-first
   check is mostly redundant given the prefix step, but we mirror the
   UI exactly.
5. **Reject** if `document.getElementById(group)` already exists.
6. Append a `<g>` under the D3 `routes` selection (the `#routes`
   layer) with attrs:
   - `id = <sanitized>`
   - `stroke = "#000000"`
   - `stroke-width = 0.5`
   - `stroke-dasharray = "1 0.5"`
   - `stroke-linecap = "butt"`
7. If `document.getElementById("routeGroup")` exists and exposes an
   `options.add(...)` API (an HTMLSelectElement), append a new
   `<option value=group>group</option>`.
8. If `document.getElementById("routeCreatorGroupSelect")` exists and
   exposes the same API, append a new `<option>` to it too.
   - The legacy UI calls `.options.add(...)` unconditionally on
     `routeCreatorGroupSelect` (no `?.`), but for the AI tool we treat
     either select being absent as a soft skip rather than an error,
     since the chat tool can be called outside the Routes Editor flow.
     The non-skipping behavior would surface as a runtime crash that
     leaves the data in a partially-applied state — undesirable here.

We deliberately do **not** call the UI-only helper `addLines()`; that
just rebuilds the editor table and is irrelevant when the editor isn't
open.

## Return shape

On success:

```
{ ok: true, id: <sanitized> }
```

On error: standard `errorResult` with one of:

- `"name must be a non-empty string."`
- `"Invalid group name (sanitized to empty)."`
- `"Element with id <id> already exists."`
- `"Group name must start with a letter."` (mirror UI message intent)

## Files

- `src/ai/tools/add-route-group.ts` — new tool. Exports:
  - `sanitizeGroupName(raw: string): string` — pure helper, the
    sanitize+prefix pipeline, exported for tests and reuse.
  - `AddRouteGroupRuntime` interface with:
    - `idExists(id: string): boolean`
    - `appendGroup(id: string): void` — internally applies the four
      hard-coded attrs (stroke, stroke-width, stroke-dasharray,
      stroke-linecap) on the new `<g>`. Caller passes only the id.
    - `appendSelectOption(selectId: string, value: string): void`
  - `defaultAddRouteGroupRuntime` — uses `getGlobal("routes")` for the
    D3 selection and `document.getElementById` for the `<select>`s.
  - `createAddRouteGroupTool(runtime?)` factory.
  - `addRouteGroupTool` default singleton.
- `src/ai/tools/add-route-group.test.ts` — Vitest tests.
- `src/ai/index.ts` — alphabetical import (between `add-route` and
  `add-ruler`), barrel re-export, and `registry.register(...)` call
  next to the existing route registrations (near `addRouteTool` /
  `setRouteGroupTool`).

## Tool metadata

- name: `add_route_group`
- description: One-paragraph doc mentioning the route-group-editor
  origin, the sanitize+prefix rules, the four `<g>` attrs applied,
  and the two `<select>` updates. Note that this only creates the
  group container; it does not move existing routes — use
  `set_route_group` for that.
- input_schema:
  - `name`: required string, min length 1 — the human-friendly group
    name. Will be sanitized.
  - no other params.

## Test plan

Mirror `set-route-group.test.ts` structure: a "fake runtime" block for
tool-level behavior, plus a `defaultAddRouteGroupRuntime` integration
block patching `globalThis`.

Tool-level (with a fake runtime):

1. Happy path: `"Imperial Road"` → final id `route-imperial_road`,
   `appendGroup` called with the four expected attrs, both select
   options appended.
2. Auto-prefix: `"foo"` → final id `route-foo`.
3. Sanitization: spaces → underscores, special chars stripped:
   `"My Cool Group!"` → `route-my_cool_group`.
4. Already-prefixed: `"route-bar"` stays `route-bar` (no double
   prefix).
5. Reject empty input: `""` and whitespace.
6. Reject sanitization-empties: e.g. all-punctuation input.
7. Reject numeric-first id: simulate post-sanitization id starting
   with a digit (we'll feed a sanitized name that survives prefixing
   with a digit-first — actually impossible after the `route-` prefix,
   so the test verifies the check still fires in the rare path where
   somehow the id starts with a digit. We test this by exposing the
   `sanitizeGroupName` helper and testing the validator path in the
   tool, not via input that can't reach it. Concretely: we will not
   skip this validation rule even if the prefix step renders it
   defensive; the test asserts the check is wired by mocking a
   hypothetical id that begins with `0` cannot be produced by valid
   inputs. So: test that the prefix-then-check ordering matches the
   UI by inspecting `sanitizeGroupName("9 trails")` returns
   `route-9_trails` (passes — leading `r`).
8. Reject if id already exists: runtime `idExists` returns true →
   error.
9. Tool name and registry round-trip.

Default-runtime integration (patching `globalThis.routes` to a fake
D3-like selection and `globalThis.document` to a fake DOM):

10. Calls the D3 selection's `.append("g").attr(...)` chain with the
    four attrs.
11. Calls `getElementById("routeGroup")` and adds an `<option>` to its
    `.options`.
12. Calls `getElementById("routeCreatorGroupSelect")` and adds an
    `<option>` to its `.options`.
13. Skips select updates gracefully when those elements are absent.
14. Errors when `getElementById(group-id)` returns truthy
    (collision).

## Validation rules summary

- `name` must be a non-empty string after `trim()`.
- After sanitization, must be non-empty.
- After auto-prefixing with `route-`, the first char must not be a
  digit (mirror UI; will always pass since `r` is a letter, but we
  keep the check).
- The final id must not collide with an existing element.

## Review

Self-review against the workflow checklist:

- **Do the tasks accomplish the plan?** Yes. Tasks 1 and 2 produce the
  source file and tests described in the plan; task 3 wires registration;
  task 4 verifies. Plan and tasks both call out the same sanitize → prefix
  → numeric-check → collision-check → DOM mutate ordering.
- **Does the plan accomplish the use case?** Yes. The tool exactly mirrors
  the user-facing `addGroup` in `route-group-editor.js` minus `addLines()`
  (UI-only table refresh, irrelevant outside the editor). Sanitization
  rules, auto-prefix, validation, four `<g>` attrs, and both `<select>`
  updates are all preserved.
- **Do the tests verify the use case?** Yes. The fake-runtime block
  asserts: input → sanitized id pipeline (cases 1–4), error paths
  (cases 5–8), tool name/registry round-trip (case 9). The integration
  block asserts: real DOM/`routes` selection plumbing through
  `defaultAddRouteGroupRuntime` (cases 10–14). The hard-to-reach
  numeric-first branch is covered defensively via `sanitizeGroupName`
  unit tests, which document why it can't be triggered through normal
  input after auto-prefix.
- **Caveats noted**:
  - The numeric-first check is structurally unreachable after
    auto-prefix (always `r…`). We keep it to match the UI 1:1, but
    don't try to prove a runtime hit; we test the post-prefix id
    instead.
  - The legacy UI throws if `routeCreatorGroupSelect` is missing
    (no `?.`). The tool deliberately treats that as a soft skip — a
    chat tool may run while the editor is closed. Documented above.
  - `appendGroup` runtime hardcodes the four attrs; the interface
    only takes `id`. Plan and tasks now agree on this signature.

No corrections beyond the inline edit above (interface signature
consistency).
