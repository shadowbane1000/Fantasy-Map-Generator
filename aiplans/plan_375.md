# Plan 375 — `regenerate_all_route_names` AI tool

## Use case

The AI already has a single-route `regenerate_route_name` tool plus a
"regenerate all <X> names" companion for every other named domain:

| Domain     | Single                       | Bulk                            |
| ---------- | ---------------------------- | ------------------------------- |
| burgs      | `regenerate_burg_name`       | `regenerate_all_burg_names`     |
| states     | `regenerate_state_name`      | `regenerate_all_state_names`    |
| cultures   | (per-culture editor button)  | `regenerate_all_culture_names`  |
| provinces  | `regenerate_province_name`   | `regenerate_all_province_names` |
| rivers     | `regenerate_river_name`      | `regenerate_river_names`        |
| regiments  | `regenerate_regiment_name`   | `regenerate_regiment_names`     |
| religions  | (per-religion editor button) | `regenerate_religion_names`     |
| **routes** | `regenerate_route_name`      | **(missing — this plan)**       |

This plan fills the last gap. It adds `regenerate_all_route_names`,
which iterates `pack.routes` and re-rolls the name of every non-locked
route via the same `Routes.generateName({ group, points })` call the
single-route tool already drives.

## Lint baseline (before any changes)

`npm run lint` on plan-375 base (branch
`plan-375-regenerate-all-route-names`, based on `master @ 9118fd3`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 853 files in 699ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

## Behavior

- For each `route` in `pack.routes`:
  - Skip `route.i <= 0` (placeholder convention — matches the rest of
    the regenerate-all family: states skip i=0 Neutrals, provinces
    skip province 0, religions skip religion 0). This is a deliberate
    bulk-mode policy; the single-route `regenerate_route_name` tool
    still allows targeting id 0 explicitly.
  - Skip `route.removed` (filtered out — not counted in `total`).
  - If `route.lock` truthy → don't re-roll; increment `locked`.
  - Otherwise → call `Routes.generateName({ group, points })`,
    `.trim()`, and write to `route.name` in place. Increment
    `regenerated`.
- Routes with no current name (`route.name` undefined / `""`) are
  treated like any other unlocked route: they receive a freshly
  generated name. (Symmetric to the burg version, where a burg with no
  prior name still gets one written.)
- Routes have no on-map text labels (the renderer only emits SVG
  paths), so no DOM refresh / no `drawRoutes()` call is needed.
- Non-idempotent — each call produces fresh random names.

## Inputs

JSON schema:

```json
{
  "type": "object",
  "properties": {}
}
```

No inputs. Locks are honored automatically; no `mode` knob (routes
have no culture/random split — `Routes.generateName` already weights
across naming models internally).

## Validation

None — the tool accepts an empty object. Any extra fields are ignored.

## Errors

Exact strings:

- `pack.routes is not available.` — `getRoutes()` throws when
  `getPackCollection<RawRoute>("routes")` is missing or non-array.
- `pack.routes is empty.` — `routes.length === 0` after `getRoutes()`.
- `Route ${i}: <generator-message>` — pass-through wrapper when
  `runtime.generateName(route)` throws (e.g. `"Route 5: Routes.generateName boom"`).
- `Route ${i}: name generator returned an empty/invalid name.` —
  generator returned non-string or whitespace-only.
- `Route ${i}: <apply-message>` — pass-through wrapper when in-place
  apply fails (e.g. `"Route 5: Route 5 not found."` if the live
  pack array changed between `getRoutes()` and apply).

The default-runtime layer adds two more upstream errors that surface
through the throwing `generateName`:

- `Routes is not available; the map hasn't finished loading.`
- `Routes.generateName is not available.`

These reach the user wrapped as `Route ${i}: …`.

## Success result shape

```ts
okResult({ total, regenerated, locked });
```

`okResult` already prepends `ok: true`. So the JSON body is:

```json
{
  "ok": true,
  "total": <number>,
  "regenerated": <number>,
  "locked": <number>
}
```

- `total` = count of considered routes (excludes index 0 and removed).
- `regenerated` = count of routes whose `name` was re-rolled.
- `locked` = count of routes skipped due to `route.lock`.

`regenerated + locked === total` always holds for a successful call
(early-error paths bail out before the loop completes).

## Files

New files:

- `src/ai/tools/regenerate-all-route-names.ts` — exports:
  - `interface RouteLike { i, name?, group?, points?, lock?, removed? }`
  - `interface RegenerateAllRouteNamesRuntime { getRoutes(): RouteLike[]; generateName(route: RouteLike): string; }`
  - `defaultRegenerateAllRouteNamesRuntime` — reads `pack.routes` via
    `getPackCollection`, generates via
    `getGlobal<RoutesModuleLike>("Routes")?.generateName({ group, points })`.
  - `createRegenerateAllRouteNamesTool(runtime?)`
  - `regenerateAllRouteNamesTool` — default-runtime instance.
- `src/ai/tools/regenerate-all-route-names.test.ts` — full coverage
  (see Tests below).

Modified file:

- `src/ai/index.ts`:
  - Import `regenerateAllRouteNamesTool` between
    `regenerateAllProvinceNamesTool` and `regenerateAllStateNamesTool`.
  - Re-export block alphabetically between the same two existing
    blocks. Re-exports `createRegenerateAllRouteNamesTool`,
    `defaultRegenerateAllRouteNamesRuntime`, the two interface
    types, and `regenerateAllRouteNamesTool`.
  - `registry.register(regenerateAllRouteNamesTool);` between the
    `regenerateAllProvinceNamesTool` and `regenerateAllStateNamesTool`
    registrations.

## Tests

Implemented in `regenerate-all-route-names.test.ts`:

1. **Happy path** — three unlocked non-zero routes, all get fresh
   names; `total=3, regenerated=3, locked=0`.
2. **Locked routes preserved** — two routes with `lock: true`; both
   names unchanged; `regenerated=0, locked=2`; `generateName` not
   called.
3. **Mixed locked + unlocked** — only unlocked re-rolled; locked
   preserved; counts accurate.
4. **No current name** — route with `name` undefined gets a written
   name.
5. **Empty `pack.routes` → error** with exact string `"pack.routes is empty."`.
6. **Missing `pack.routes` → error** with exact string `"pack.routes is not available."`.
7. **Skips index 0** — single-element array `[{i:0,…}]` returns
   `total=0, regenerated=0, locked=0`; `generateName` not called.
8. **Tool name** — `regenerateAllRouteNamesTool.name === "regenerate_all_route_names"`.
9. **Stub runtime call counts** — `getRoutes` called once,
   `generateName` called once per unlocked non-zero route, with the
   right `i` per call.
10. **Registry round-trip** — registers via `new ToolRegistry()`,
    runs, mutates `globalThis.pack.routes[i].name` correctly.
11. **Default-runtime integration** — populated `globalThis.pack.routes`
    + `globalThis.Routes`, executes the default-runtime tool, checks
    the live pack mutation and that `Routes.generateName` was called
    with the right `{ group, points }` per non-locked route.
12. **Runtime failure pass-through** — `generateName` throws → error
    surfaces with `"Route ${i}: <message>"`.
13. **Empty/whitespace generator output** → error with
    `"Route ${i}: name generator returned an empty/invalid name."`.
14. **Trims generator output** before storing.
15. **Removed routes ignored** — not counted, not re-rolled.

Default-runtime integration block also covers:

- `pack.routes` missing → `"pack.routes is not available."`.
- `globalThis.Routes` missing → error mentions `Routes`.
- `Routes.generateName` not a function → error mentions
  `Routes.generateName`.
- `pack.routes` empty → `"pack.routes is empty."`.

## Verification commands

From the worktree root:

```sh
cd /workspace/.claude/worktrees/plan-375
npm test 2>&1 | tail -10
npx tsc --noEmit
npm run lint 2>&1 | tail -10
```

All three must come up clean.

## Self-review

- **Completes the family.** Bullet-by-bullet check against
  `regenerate_all_burg_names` / `regenerate_all_state_names` /
  `regenerate_all_province_names` / `regenerate_all_culture_names` /
  `regenerate_river_names` / `regenerate_regiment_names` /
  `regenerate_religion_names`: this tool now provides the same
  user-facing capability for routes (re-roll every non-locked entity
  in one call).
- **Lock honoring.** `route.lock` truthy → skip + counter; verified by
  test #2 and #3.
- **Index 0 convention.** Although routes start at i=0 (the
  single-route tool accepts ref=0 explicitly), the bulk tool skips
  index 0 to keep the "regenerate all" family's semantics uniform —
  states, provinces, religions, and cultures all skip their i=0
  placeholder. The single-route tool still works on id 0 if the AI
  explicitly targets it. Documented in the description and test #7.
- **No SVG redraw.** Routes have no on-map labels. The single-route
  tool already documents this; we keep parity.
- **Result-shape choice.** The user spec (this plan) explicitly asks
  for `{ ok: true, total, regenerated, locked }`. We follow that
  shape rather than the burg version's
  `{ regenerated, skippedLocked, skippedRemoved }` because the spec
  is unambiguous.
- **Removed routes.** Not counted in `total` and never written. This
  keeps `regenerated + locked === total` clean.
- **No-name routes.** Get written. Symmetric to the burg version.
  Documented in the description and test #4.
- **Apply path.** Not seamed through the runtime interface — apply
  writes to the live `pack.routes` directly. This matches the
  user-stated runtime shape (`getRoutes` + `generateName` only).
  Stub-runtime tests therefore set up `globalThis.pack.routes` in
  `beforeEach` so the apply step has a target.
- **Error wording.** `pack.routes is not available.` matches the
  burg version's `"pack.burgs is not available."`. `pack.routes is
  empty.` is a plan-375-specific addition (the burg version doesn't
  error on empty — but the spec asks for this).
- Commit message:

  ```
  feat(ai): add regenerate_all_route_names tool

  Implements plan 375. Fills the last gap in the "regenerate all names"
  tool family: bulk-regenerates every non-locked route's name via
  Routes.generateName({ group, points }), honoring route.lock and
  skipping index 0 by convention.
  ```
