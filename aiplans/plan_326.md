# Plan 326: `regenerate_route_name` tool

## Use case

Add an AI chat tool that mirrors the `generateName` handler in
`public/modules/ui/routes-editor.js` (around line 349):

```js
function generateName() {
  const route = getRoute();
  route.name = routeName.value = Routes.generateName(route);
}
```

`window.Routes.generateName(route)` is the existing global helper
(defined as `RoutesModule.generateName({ group, points })` in
`src/modules/routes-generator.ts`, which sets `window.Routes` at the
bottom of the file). It returns a culture/feature-aware procedural name
based on the route's `group` and `points`. The user can already trigger
this via the "Generate name" button in the route editor; the AI cannot.

The AI side already has `add_route`, `remove_route`, `rename_route`
(sets `route.name` to a user-supplied string), `set_route_group`,
`set_route_lock`, `list_routes`, `find_routes_by_group`,
`get_route_info`, `get_route_distribution`, and `list_route_groups`. It
does **not** yet have a way to re-roll the procedural name. This plan
fills that gap.

This is the per-route parallel of `regenerate_burg_name`,
`regenerate_river_names`, `regenerate_label_name`,
`regenerate_state_name`, `regenerate_lake_name`, and
`regenerate_province_name`.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-326 && npm run lint 2>&1 | tail -50`
on the worktree base (master @ 1d137af, plan-326 branch, working tree
clean) reports:

```
Checked 757 files in 623ms. No fixes applied.
```

Final summary line: **0 warnings, 0 info, 0 errors**. No issues. The
implementation MUST NOT introduce any new warnings or errors.

## Behavior (mirrors the editor exactly)

- Resolve a single route by `route` parameter — either numeric route id
  (matches `route.i`, **starts at 0** because routes have no
  placeholder slot, unlike states/burgs/religions) or case-insensitive
  exact name match. This uses the shared `findRouteByRef` helper
  exported from `rename-route.ts` (which already skips `removed`
  routes).
- Call `window.Routes.generateName({ group: route.group, points:
  route.points })` to produce a new name string.
- Write `route.name = newName` in place — same side-effect as the
  editor's "Generate name" button.
- No SVG redraw is required: route names live only in the Routes
  Overview / notes, not on the map (same as `rename_route`).
- The procedural name generator may legitimately return
  `"Unnamed route"` or `"Unnamed route segment"` (when `points.length <
  4`). These are valid outputs and should be passed through as-is —
  the editor does not reject them.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "route": {
      "type": ["integer", "string"],
      "description": "Numeric route id (matches route.i — note ids start at 0, so 0 is a real route) or current case-insensitive name. Removed routes are skipped."
    }
  },
  "required": ["route"]
}
```

### Validation

- `route` must be present.
- `route` must be a non-negative integer id OR a non-empty trimmed
  string. Routes can have id `0`, so unlike `parseEntityRef` (which
  requires `> 0`) this tool accepts `0`.
- The resolved route must exist and not be `removed`.
- `window.Routes.generateName` must be callable.
- The generator output must be a non-empty string after trimming.

### Errors

- `route` missing / wrong type / negative / non-integer / empty string →
  `"route must be a non-negative integer id or a non-empty name string."`
  (same wording as `get_route_info`'s `parseRouteRef`).
- Route not found / removed →
  `"No route found matching <ref>."` where `<ref>` is the JSON-stringified
  input (same wording as `rename_route`).
- `window.Routes` missing →
  `"Routes is not available; the map hasn't finished loading."`
- `window.Routes.generateName` missing or not a function →
  `"Routes.generateName is not available."`
- Generator returns empty/invalid string →
  `"Name generator returned an empty/invalid name."` (matches
  `regenerate_lake_name`).
- Apply step throws (route disappeared between resolve and write) →
  surface the runtime error message verbatim.

### Success result

`okResult({ ok: true, i, previousName, name })`. Field names mirror
`rename_route` exactly so the LLM and downstream consumers see a
consistent shape:

- `i` — the resolved `route.i`.
- `previousName` — the value of `route.name` before the write (`""`
  when unset / null).
- `name` — the new procedural name.

## Files

- **New** `src/ai/tools/regenerate-route-name.ts` — the tool, patterned
  on `regenerate-lake-name.ts` (runtime seam for `Routes.generateName`)
  and `rename-route.ts` (route-resolution semantics). Exports:
  - `interface RegenerateRouteNameRef { i: number; name: string;
    group: string; points: number[][] }`.
  - `interface RegenerateRouteNameRuntime { find(ref: number | string):
    RegenerateRouteNameRef | null; generate(ref:
    RegenerateRouteNameRef): string; apply(i: number, name: string):
    void; }`.
  - `defaultRegenerateRouteNameRuntime` reading `window.pack.routes`
    via `getPack` and calling `window.Routes.generateName` via
    `getGlobal`.
  - `createRegenerateRouteNameTool(runtime?)` returning `Tool`.
  - `regenerateRouteNameTool` — the default-runtime instance.
- **New** `src/ai/tools/regenerate-route-name.test.ts` — Vitest spec,
  full coverage (see Tests below).
- **Modify** `src/ai/index.ts`:
  - Add `import { regenerateRouteNameTool } from
    "./tools/regenerate-route-name";` immediately after the
    `regenerate-river-names` import (alphabetical ordering: River <
    Route < State).
  - Re-export `createRegenerateRouteNameTool`,
    `defaultRegenerateRouteNameRuntime`, type
    `RegenerateRouteNameRef`, type `RegenerateRouteNameRuntime`, and
    `regenerateRouteNameTool` between the river-names and state-coa
    re-export blocks.
  - Register via `registry.register(regenerateRouteNameTool);` in
    `defaultToolRegistry()`, adjacent to the other regenerate-name
    registrations (between `regenerateRiverNamesTool` and
    `regenerateZonesTool`).

The shared `findRouteByRef` helper (`rename-route.ts`) and the
`RawRoute` type (`_shared/pack-types.ts`) are reused. No new shared
utilities required.

## Tests (Vitest)

Mirror the structure of `regenerate-lake-name.test.ts` (stub-runtime
suite + registry round-trip + default-runtime integration) and
`rename-route.test.ts` (route-shape ergonomics):

1. **Happy path by id**: `find` returns `{ i: 5, name: "Old", group:
   "roads", points: [...] }`; `generate` returns `"Hello Road"`;
   `apply(5, "Hello Road")` called; payload `{ ok: true, i: 5,
   previousName: "Old", name: "Hello Road" }`.
2. **Happy path by case-insensitive name**: `find("SILK trail")`
   resolves; same downstream flow.
3. **Happy path with route id 0**: confirms `route: 0` is accepted (the
   ref validator must allow non-negative not just positive).
4. **Trims generator output**: `generate` returns `"  Spaced  "` →
   `apply(i, "Spaced")` and payload `name: "Spaced"`.
5. **Generator returns empty string** → error `"Name generator returned
   an empty/invalid name."`, no apply.
6. **Generator returns whitespace-only** → same error, no apply.
7. **Generator returns non-string** → same error, no apply.
8. **Generator throws** → error surfaces with the runtime message; no
   apply.
9. **Apply throws** → error surfaces with the runtime message.
10. **Route not found** → `"No route found matching 999."`, no
    generate, no apply.
11. **Route name not found** → `"No route found matching \"Ghost\"."`,
    no generate, no apply.
12. **Missing route param** → `"route must be a non-negative integer id
    or a non-empty name string."`, no find.
13. **Bad route types**: `null`, `undefined`, `-1`, `1.5`, `""`, `"   "`,
    `{}`, `true` → all rejected with the same message; no find.
14. **previousName defaults to ""** when `find` returns
    `{ name: "" }` (route had no prior name).
15. **Tool name and required schema**: `regenerateRouteNameTool.name`
    === `"regenerate_route_name"`; `input_schema.required` ===
    `["route"]`.
16. **Registry round-trip**: register the default-runtime tool, run
    against a populated `globalThis.pack` + `globalThis.Routes`, and
    confirm `pack.routes[k].name` is mutated and the payload matches.
17. **Default-runtime integration**:
    - Seeds `globalThis.pack = { routes: [{ i: 0, group: "roads",
      points: [...], name: "Old" }, { i: 5, group: "trails", points:
      [...] }, { i: 9, group: "searoutes", removed: true, name: "Old
      sea" }] }` and `globalThis.Routes = { generateName: vi.fn(() =>
      "Generated") }`.
    - Asserts: id=0 mutates `routes[0].name`; id=5 mutates
      `routes[1].name`; id=9 errors (removed); name match resolves; the
      `generateName` fake is called with `{ group, points }` from the
      matching route.
    - Asserts: missing `Routes` global → error mentions `Routes`;
      `Routes.generateName` not a function → error mentions
      `Routes.generateName`; missing `pack.routes` → not-found path.

## Verification

- `npm test` — green.
- `npm run lint` — does NOT regress (still 0 warnings, 0 info, 0
  errors).
- `npx tsc --noEmit` — clean.

## Self-review (added during step 5)

Reviewed plan + tasks against the spec:

- **Route id 0 is valid.** `parseEntityRef` from `_shared` rejects
  `0`, so this tool inlines its own non-negative check (mirroring
  `get-route-info.ts`'s `parseRouteRef`). The plan and tasks both call
  this out.
- **Runtime seam covers `Routes.generateName`** (not
  `pack.routes.find`) so tests can inject a deterministic name without
  needing a real `RoutesModule`.
- **Field names mirror `rename_route`** (`previousName` / `name`) for
  consistency. We deliberately do NOT use `old_name`/`new_name` (which
  is the `regenerate_lake_name` shape) because `rename_route` is the
  closer sibling and the LLM will already be paired with that response
  shape when working with routes.
- **Error messages** are taken verbatim from the closest existing
  tool: `parseRouteRef` from `get-route-info.ts` for the ref error;
  `rename-route.ts` for the not-found error; `regenerate-lake-name.ts`
  for the empty-output error and the missing-global error pattern.
- **Test list covers** every error branch in the plan, plus the
  registry round-trip and default-runtime integration the worktree
  briefing required, plus the route-id-0 edge case (which is the
  primary route-specific gotcha).
- **`apply` write-pattern** uses `findRouteByRef` rather than indexing
  `routes[i]`, because route ids are non-contiguous (`add-route` skips
  ids of removed routes via `getNextId`). This matches what
  `defaultRouteRenameRuntime.rename` does.
- **No SVG redraw**: route names aren't drawn on the map. The plan
  documents this explicitly so reviewers don't ask why.
- The plan's `okResult` shape is `{ ok, i, previousName, name }` —
  matches `rename-route`'s payload exactly.
- The required schema field is `route`. No `mode` parameter (unlike
  `regenerate_lake_name` / `regenerate_burg_name`) because
  `Routes.generateName` doesn't expose modes — there's just one
  generator.
