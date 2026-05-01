# Plan 288: `list_route_groups` AI chat tool

## Use case

Add a new read-side AI chat tool, `list_route_groups`, that returns the
existing route groups on the current map — mirroring the read/display
logic of the `addLines()` function in
`public/modules/ui/route-group-editor.js`.

The Route Groups Editor UI iterates `routes.selectAll("g")._groups[0]`
and displays each group's id and child (route) count. The AI chat has
no equivalent right now: a user asking "what route groups exist on this
map and how many routes does each have?" cannot be answered by any
existing AI tool. This tool fills that gap.

## Behaviour to mirror

From `public/modules/ui/route-group-editor.js`:

```js
function addLines() {
  byId("routeGroupsEditorBody").innerHTML = "";

  const lines = Array.from(routes.selectAll("g")._groups[0]).map(el => {
    const count = el.children.length;
    return /* html */ `<div data-id="${el.id}" class="states" ...>
        <span>${el.id} (${count})</span>
        ...
      </div>`;
  });

  byId("routeGroupsEditorBody").innerHTML = lines.join("");
}
```

The tool must:

1. Take **no input** parameters (read-only listing).
2. Read the direct `<g>` children of the `routes` D3 selection (i.e.
   the `<g>` children of the `#routes` SVG layer). Preserve document
   order — do NOT re-sort.
3. For each `<g>`, report:
   - `id` — the SVG group id (e.g. `"roads"`, `"trails"`, `"searoutes"`,
     or a custom group like `"route-pilgrim"`).
   - `route_count` — number of routes in `pack.routes` whose
     `route.group === id` and that are not `removed: true`. This
     mirrors `remove_route_group`'s logic, which is the most reliable
     count of live routes in that group. If `pack.routes` is missing
     (early-load / headless), fall back to the SVG `<g>`'s child
     element count (`<g>.children.length`), matching the UI's
     `el.children.length`.
   - `is_default` — `true` iff the id is one of
     `["roads", "trails", "searoutes"]` (the same constant
     `DEFAULT_ROUTE_GROUPS` used by `add_route_group` /
     `remove_route_group`).
4. Return a structured `okResult({ groups: [...], count: N })` with
   the array in document order.
5. If the `routes` D3 selection is missing OR `#routes` cannot be
   located in the DOM, return a clear `errorResult` — never silently
   return an empty list (an empty list correctly means "no groups").

## Files

- `src/ai/tools/list-route-groups.ts` — new tool. Models the runtime
  injection seam after `add-route-group.ts` / `remove-route-group.ts`.
- `src/ai/tools/list-route-groups.test.ts` — new tests.
- `src/ai/index.ts` — alphabetical-ish import (next to the other
  `listX` imports), barrel re-export, registry registration adjacent
  to the existing route-group tools (`add_route_group`,
  `remove_route_group`).

## Runtime injection seam

To stay consistent with `add-route-group.ts` / `remove-route-group.ts`:

```ts
export const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"] as const;

export interface RouteGroupSummary {
  id: string;
  route_count: number;
  is_default: boolean;
}

export interface ListRouteGroupsRuntime {
  /**
   * Returns the ordered list of <g> children directly under the
   * #routes SVG layer (i.e. one entry per route group). Each entry
   * carries the id and a fallback child count from the SVG. Returns
   * `null` when the routes layer is unavailable.
   */
  readGroupElements(): Array<{ id: string; childCount: number }> | null;
  /**
   * Returns pack.routes when available so we can compute the live
   * (non-removed) route count per group. Returns null when the pack
   * (or its routes array) is missing — in that case the tool falls
   * back to the SVG child counts.
   */
  readPackRoutes(): RawRoute[] | null;
}

export const defaultListRouteGroupsRuntime: ListRouteGroupsRuntime = { ... };
export function createListRouteGroupsTool(runtime?): Tool { ... }
export const listRouteGroupsTool = createListRouteGroupsTool();
```

`defaultListRouteGroupsRuntime`:

- `readGroupElements()`:
  - Prefer the legacy `window.routes` D3 selection. Use
    `routes.selectAll("g")` and walk its `_groups[0]` (the same path
    `addLines` uses). Each yielded element exposes `id` and
    `children.length`.
  - Fall back to `document.getElementById("routes")` and use its direct
    `<g>` children (filtered via `el.children` and `tagName === "g"`,
    case-insensitive) for headless / browser-only environments where
    `window.routes` isn't a D3 selection.
  - Returns `null` (signalling "layer missing → error") when neither
    source resolves.
- `readPackRoutes()`: returns `pack.routes` when it's an array, else
  `null`.

The split (`readGroupElements` for SVG order + ids, `readPackRoutes`
for live counts) matches the plan's behavior of preferring
`pack.routes` for the count and falling back to SVG child count when
absent.

## Validation rules

- No input parameters. Accepts `{}`, `null`, `undefined` uniformly.
- If `runtime.readGroupElements()` returns `null` → return
  `errorResult("Routes layer is unavailable; ...")`.
- An empty array of group elements (zero `<g>` children) is a valid
  successful response with `groups: []` and `count: 0`.
- If `runtime.readPackRoutes()` returns `null`, fall back per-group to
  `childCount` from the SVG. The tool still succeeds.
- Routes with `removed: true` are excluded from the count (mirrors
  `remove_route_group`'s `listRoutesInGroup`).

## Result shape

```
okResult({
  count: <number>,        // groups.length, mirrors list_style_presets.count
  groups: [
    {
      id: "roads",
      route_count: <number>,
      is_default: true,
    },
    ...
  ],
})
```

Document order is preserved as it appears in the SVG (no sorting on
our side) — this matches the editor UI which renders them in DOM
order.

## Test strategy

`src/ai/tools/list-route-groups.test.ts` mirrors
`add-route-group.test.ts` / `remove-route-group.test.ts`:

Tool-level (with a fake runtime):

- **Happy path**: 3 groups (one default with routes, one default with
  zero routes, one custom non-default with routes). Verify each entry
  has the expected `id`, `route_count`, `is_default`, and the array
  matches the runtime's iteration order (document/SVG order — no
  sorting).
- **Skips `removed: true` routes** in the per-group count.
- **Pack-routes fallback**: when `readPackRoutes()` returns `null`, the
  tool falls back to the SVG `childCount` per group.
- **Unknown / missing routes layer**: `readGroupElements()` returns
  `null` → error result, no mutation.
- **No input**: accepts `{}`, `null`, `undefined` uniformly without
  error.
- **Empty list**: `readGroupElements()` returns `[]` →
  `okResult({ count: 0, groups: [] })`.
- **Tool metadata**: name `list_route_groups`, schema is `{ type:
  "object", properties: {} }` (no required fields).
- **`createListRouteGroupsTool()` round-trip**: confirms the default
  factory and exported `listRouteGroupsTool` produce equivalent
  metadata.
- **Registry round-trip**: register through `ToolRegistry`, list it,
  confirm the tool name is discoverable.

`defaultListRouteGroupsRuntime` (integration with `globalThis`
patched):

- Stub `window.routes` as a D3-shaped selection with `selectAll("g")`
  yielding `_groups[0]` containing fake `<g>` elements with `id` /
  `children.length`. Confirm `readGroupElements()` returns them in
  order.
- Stub `window.pack` with a `routes` array containing routes for
  several groups (some `removed: true`). Confirm `readPackRoutes()`
  returns the array.
- When `window.routes` is undefined, fall back to
  `document.getElementById("routes")` populated with `<g>` children;
  confirm the fallback path is taken.
- When neither `window.routes` nor `#routes` element exists, confirm
  `readGroupElements()` returns `null` and the tool surfaces an error.

## Lint baseline

`npm run lint` BEFORE any changes:

```
Checked 676 files in 531ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(0 errors, 7 warnings, 1 info — pre-existing.)

## Review

- Tasks → Plan: tasks 1–7 cover (1) reading sibling tools to confirm
  the pattern, (2) creating the tool, (3) creating the tests, (4)
  wiring through `src/ai/index.ts` (alphabetical import + barrel
  re-export + registry registration adjacent to the route-group
  tools), (5) running tsc / tests / lint, (6) verifying the lint
  baseline isn't regressed, (7) committing on the branch with the
  agreed message style. They map 1:1 to plan files.
- Plan → Use case: the use case requires reading the existing route
  groups (id + live count + is_default) in SVG order and surfacing a
  clear error when the layer is missing. The plan's runtime seam
  (`readGroupElements` / `readPackRoutes`) and the
  `okResult({ count, groups })` shape with `is_default` flagging cover
  every clause. The fallback rule (use SVG child count when
  `pack.routes` is absent) and the `removed: true` skip rule are
  spelled out explicitly to match `remove_route_group`'s logic.
- Tests → Use case: each clause maps to a test — happy path → "3
  groups with correct id/count/is_default in SVG order"; `removed:
  true` skip → "skips removed-flag routes from the count"; pack-routes
  fallback → "falls back to childCount when pack.routes absent";
  layer-missing → "error result"; empty array OK; tool metadata +
  registry round-trip. The integration block additionally verifies the
  legacy seam (`window.routes`, `_groups[0]`, `pack.routes`,
  `document.getElementById("routes")`) wires through correctly.
- No edits needed beyond confirming that document-order preservation
  is mentioned in the runtime contract (it is) AND that "no input
  params" is asserted by both schema and tests (it is). The plan
  faithfully covers the use case.
