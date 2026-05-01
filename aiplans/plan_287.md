# Plan 287: `remove_route_group` AI chat tool

## Use case

Add a new write-side AI chat tool, `remove_route_group`, that removes
a route group (and every route in it) — mirroring the user-facing
`removeGroup` function in `public/modules/ui/route-group-editor.js`.

The Route Groups editor lets the user delete a route group in one click;
the AI chat currently has no equivalent. This tool fills that gap.

## Behaviour to mirror

From `public/modules/ui/route-group-editor.js`:

```js
const DEFAULT_GROUPS = ["roads", "trails", "searoutes"];

function removeGroup(group) {
  // ... confirmationDialog(...) wrapping ...
  pack.routes.filter(r => r.group === group).forEach(Routes.remove);
  if (!DEFAULT_GROUPS.includes(group)) routes.select(`#${group}`).remove();
  addLines();
}
```

The tool must:

1. Take a single input: `group` (string) — the route-group id
   (e.g. `"roads"`, `"trails"`, `"searoutes"`, or a custom group such as
   `"route-pilgrim"`).
2. Validate that a `<g>` element with that id exists under the
   `#routes` D3 selection. If it does not, return an error result
   without mutating anything.
3. For every route `r` in `pack.routes` where `r.group === group` (and
   that is not already `removed: true`), call the project's
   `window.Routes.remove(r)` exactly like the UI does. This delegates
   cell-adjacency cleanup (`pack.cells.routes`), `pack.routes` removal,
   and `#route{i}` SVG node removal to the generator, mirroring the
   pre-existing `remove_route` tool.
4. If the group id is **not** in the default-groups list
   (`["roads", "trails", "searoutes"]`), additionally remove the
   `<g id="${group}">` element from the `routes` D3 selection
   (`routes.select("#" + group).remove()`). Default groups keep their
   SVG container so the editor's standard tabs stay populated even when
   empty.
5. Return a structured `okResult({ group, removed_count, svg_removed })`.

The tool intentionally does NOT call `addLines()` (UI re-render of the
groups editor body) — the groups editor is closed when the chat runs and
re-opens its body lazily on next show.

The UI's `confirmationDialog` is skipped — every other AI write tool
runs non-interactively (`remove_route`, `remove_state`, etc.).

## Default groups

Hard-coded in the UI; the tool replicates the same list verbatim:

```ts
export const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"] as const;
```

These match the canonical `ROUTE_GROUPS` already exported from
`list-routes.ts`. We re-define the constant locally rather than coupling
to `list-routes` so a future extension of canonical groups (e.g. adding
"airroutes") doesn't accidentally make the default-groups list grow.
The contract here is "match the UI literal" not "match canonical
groups".

## Files

- `src/ai/tools/remove-route-group.ts` — new tool. Modelled after
  `set-route-group.ts` (which touches both `pack.routes` and the SVG
  routes selection) and `remove-route.ts` (which uses `Routes.remove`).
- `src/ai/tools/remove-route-group.test.ts` — new tests (see below).
- `src/ai/index.ts` — alphabetical import, barrel re-export, registry
  registration (insert next to `removeRouteTool`).
- `README_AI.md` — add a new table row for `remove_route_group` next to
  `remove_route` / `set_route_group`.

## Runtime injection seam

To stay consistent with `set-route-group.ts` and `remove-route.ts`:

```ts
export interface RemoveRouteGroupRuntime {
  /** Returns `true` when an SVG <g id="${group}"> exists under #routes. */
  groupExists(group: string): boolean;
  /** Returns the active routes whose `route.group === group`. */
  listRoutesInGroup(group: string): RawRoute[];
  /** Same contract as Routes.remove from the legacy module. */
  removeRoute(route: RawRoute): void;
  /** Removes the <g id="${group}"> element from the routes selection. */
  removeGroupElement(group: string): void;
}

export const defaultRemoveRouteGroupRuntime: RemoveRouteGroupRuntime = { ... };
export function createRemoveRouteGroupTool(runtime?): Tool { ... }
export const removeRouteGroupTool = createRemoveRouteGroupTool();
```

`defaultRemoveRouteGroupRuntime`:

- `groupExists(group)`: prefers the legacy `routes` D3 selection
  (`window.routes.select("#" + group)` → check `.empty()`/`.size()`)
  but falls back to `document.getElementById(group)` for headless
  environments. Returns `true` when either source resolves a node.
- `listRoutesInGroup(group)`: walks `pack.routes`, skipping
  `removed: true` entries and falsy slots, returns those whose
  `route.group === group`.
- `removeRoute(route)`: looks up `window.Routes` (capital-R module),
  asserts `Routes.remove` is a function, calls it. This is the exact
  same shape `defaultRouteRemovalRuntime.remove` uses in
  `remove-route.ts`.
- `removeGroupElement(group)`: prefers
  `window.routes.select("#" + group).remove()` (a D3 selection
  no-op-on-empty); falls back to
  `document.getElementById(group)?.remove()`.

## Validation rules

- `input.group` must be a non-empty trimmed string. `null`, `undefined`,
  numbers, empty / whitespace-only strings → error.
- The group id must correspond to an existing SVG `<g>` under
  `#routes`. If `runtime.groupExists(group)` returns `false`, return
  `errorResult("No route group element found with id: ...")` without
  any mutation.
- `Routes.remove` not being available (legacy module not loaded) is
  surfaced as an error from `runtime.removeRoute` and bubbled back to
  the caller — matching `remove-route.ts` behaviour.

## Result shape

```
okResult({
  group: <string>,         // group id, echoed back
  removed_count: <number>, // number of routes passed to Routes.remove
  svg_removed: <boolean>,  // true iff non-default and the <g> was removed
})
```

## Test strategy

`src/ai/tools/remove-route-group.test.ts` mirrors
`set-route-group.test.ts` / `remove-route.test.ts`:

Tool-level (with a fake runtime):

- **Happy path on a non-default group** (`"route-pilgrim"`): all routes
  whose `group === "route-pilgrim"` are passed to `removeRoute`, the
  group element is removed, result reports `removed_count` and
  `svg_removed: true`.
- **Default group `"roads"`**: routes are removed but
  `removeGroupElement` is NOT called. `svg_removed: false`. Same for
  `"trails"` and `"searoutes"`.
- **Unknown group**: `groupExists` returns `false`. Returns an error
  result; neither `listRoutesInGroup` nor `removeRoute` nor
  `removeGroupElement` are called.
- **Empty group** (group exists but no routes): `removed_count: 0`,
  `svg_removed: true` for non-default, `false` for default.
- **Invalid input**: `null`, `undefined`, numbers, empty / whitespace
  strings → error; no runtime mutation.
- **Surfaces runtime failures** from `removeRoute` (e.g. legacy
  `Routes.remove` not available) as an error result.
- **Tool metadata**: name `remove_route_group`, schema requires
  `group`.

`defaultRemoveRouteGroupRuntime` (integration with `globalThis`
patched):

- Uses live `window.pack.routes` to filter the matching routes.
- Calls `window.Routes.remove` with each live route object.
- For non-default groups, `routes.select("#" + group).remove()` is
  invoked (verified via a fake D3-shaped object with an `empty`/`size`/
  `remove` chain).
- For default groups, the selection's `.remove()` is NOT called.
- Errors when `Routes.remove` is missing.
- Errors when `groupExists` is false (no `<g>` for that id).

Registry round-trip: confirm the exported `removeRouteGroupTool` has
the expected `name`, and that `createRemoveRouteGroupTool()` produces
an equivalent `Tool` (mirroring how `remove-route.test.ts` exercises
the live-runtime tool).

## Lint baseline

`npm run lint` BEFORE any changes:

```
Checked 672 files in 527ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(0 errors, 7 warnings, 1 info — pre-existing.)

## Review

- Tasks → Plan: tasks 1–8 cover (1) reading sibling tools to confirm
  the pattern, (2–3) creating the tool + tests, (4) wiring through
  `src/ai/index.ts`, (5) README row, (6) verify tsc/tests/lint, (7)
  commit. They map 1:1 to plan files.
- Plan → Use case: the use case requires removing every route in a
  group via `Routes.remove`, removing the `<g>` for non-default groups,
  refusing on unknown ids, and reporting structured counts. The plan's
  runtime seam (`groupExists` / `listRoutesInGroup` / `removeRoute` /
  `removeGroupElement`) and `okResult({ group, removed_count,
  svg_removed })` directly cover all of those.
- Tests → Use case: each clause of the use case maps to a test —
  happy-path-non-default → "all routes passed to remove + svg removed",
  default-group → "routes removed, svg untouched", unknown id → "error,
  no mutation", empty group → "succeeds, count=0", plus invalid-input
  hardening and registry round-trip. The integration block additionally
  verifies the legacy seam (`window.Routes.remove`,
  `routes.select(...).remove()`) wires through correctly.
- Edited plan to clarify the rationale for re-defining
  `DEFAULT_ROUTE_GROUPS` locally rather than reusing `ROUTE_GROUPS`
  from `list-routes.ts` (mirror UI literal, not "canonical groups").
