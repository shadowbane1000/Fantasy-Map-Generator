# Tasks 326: `regenerate_route_name` tool

## 1. Lint baseline (done)

- [x] Run `npm run lint 2>&1 | tail -50` and record the existing
      warnings/info/errors as the baseline (0 warnings, 0 info, 0
      errors). See `aiplans/plan_326.md` § "Lint baseline".

## 2. Plan + self-review (done)

- [x] Author `aiplans/plan_326.md`.
- [x] Author `aiplans/tasks_326.md` (this file).
- [x] Self-review section appended to plan.

## 3. Implement `src/ai/tools/regenerate-route-name.ts`

- [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
      `RawRoute` from `./_shared`; `Tool`, `ToolResult` from `./index`;
      `findRouteByRef` from `./rename-route`.
- [ ] `interface RegenerateRouteNameRef { i: number; name: string;
      group: string; points: number[][]; }`.
- [ ] `interface RegenerateRouteNameRuntime` with:
      - `find(ref: number | string): RegenerateRouteNameRef | null`.
      - `generate(ref: RegenerateRouteNameRef): string`.
      - `apply(i: number, name: string): void`.
- [ ] `interface RoutePackLike { routes?: RawRoute[] }`.
- [ ] `interface RoutesModuleLike { generateName?: (route: { group:
      string; points: number[][] }) => string }`.
- [ ] `defaultRegenerateRouteNameRuntime`:
      - `find(ref)` → `findRouteByRef(getPack<RoutePackLike>()?.routes,
        ref)` → return `{ i, name: route.name ?? "", group: route.group
        ?? "", points: Array.isArray(route.points) ? route.points : []
        }`.
      - `generate(ref)` → check `getGlobal<RoutesModuleLike>("Routes")`
        exists, then check `generateName` is a function, then call it
        with `{ group: ref.group, points: ref.points }`.
      - `apply(i, name)` → `findRouteByRef` again; throw if missing;
        else `route.name = name`.
- [ ] `parseRouteRef(value)`: helper returning either `{ ok: true, ref
      }` or `{ ok: false, error }`. Accepts non-negative integer (>= 0)
      or non-empty trimmed string. Reject negative, non-integer,
      non-numeric/non-string, empty, whitespace-only.
- [ ] `createRegenerateRouteNameTool(runtime?)`:
      - Name: `"regenerate_route_name"`.
      - Description mentions: re-rolls the procedural name via
        `Routes.generateName`, mirrors editor's "Generate name" button,
        ids start at 0, removed routes skipped, no SVG redraw.
      - Schema: `{ route: integer|string }`, `required: ["route"]`.
      - `execute`:
        1. Validate `route` via the helper; error → return.
        2. `runtime.find(parsed.ref)` → if null, error `"No route found
           matching <json>."`.
        3. `runtime.generate(target)` in try/catch → surface error.
        4. Validate generated is non-empty trimmed string → error
           `"Name generator returned an empty/invalid name."`.
        5. Trim, then `runtime.apply(target.i, newName)` in try/catch.
        6. `okResult({ i: target.i, previousName: target.name, name:
           newName })`.
- [ ] Export `regenerateRouteNameTool =
      createRegenerateRouteNameTool()`.
- [ ] No comments that just describe the code; only WHY-comments where
      non-obvious (e.g. "route ids start at 0" rationale on the
      validator).

## 4. Tests `src/ai/tools/regenerate-route-name.test.ts`

- [ ] `makeRuntime(overrides?)` helper using `vi.fn`, returning a
      runtime + the individual fns for assertions (mirror
      `regenerate-lake-name.test.ts`).
- [ ] Stub-runtime suite covers (per plan §Tests 1-15):
      - happy path id;
      - happy path name (case-insensitive);
      - happy path id 0;
      - trims generator output;
      - empty/whitespace/non-string generator output;
      - generator throws → error surfaces;
      - apply throws → error surfaces;
      - route not found by id;
      - route not found by name;
      - missing route param;
      - bad route types (`null`, `undefined`, `-1`, `1.5`, `""`,
        `"   "`, `{}`, `true`);
      - previousName defaults to "" when find returns name "";
      - tool name + required schema check.
- [ ] Registry round-trip suite (per plan §Tests 16):
      - beforeEach seeds `globalThis.pack = { routes: [...] }` and
        `globalThis.Routes = { generateName: () => "Renamed" }`;
      - afterEach restores originals;
      - registers `regenerateRouteNameTool` and runs through registry;
      - asserts payload + `pack.routes[k].name` mutation.
- [ ] Default-runtime integration suite (per plan §Tests 17):
      - happy path id 0;
      - happy path id 5 with route at non-contiguous slot;
      - id 9 (removed) → not-found error, route name unchanged;
      - happy path name match;
      - confirms `generateName` was called with `{ group, points }`
        from the matching route;
      - missing `globalThis.Routes` → error mentions `Routes`;
      - `Routes.generateName` not a function → error mentions
        `Routes.generateName`;
      - missing `pack.routes` → not-found path returns `"No route
        found matching..."`.

## 5. Wire into `src/ai/index.ts`

- [ ] Add `import { regenerateRouteNameTool } from
      "./tools/regenerate-route-name";` between
      `regenerateRiverNamesTool` and `regenerateStateCoaTool` imports
      (alphabetical: River < Route < State).
- [ ] Add re-export block `{ createRegenerateRouteNameTool,
      defaultRegenerateRouteNameRuntime,
      type RegenerateRouteNameRef, type RegenerateRouteNameRuntime,
      regenerateRouteNameTool }` between the river-names and state-coa
      re-export blocks.
- [ ] Add `registry.register(regenerateRouteNameTool);` adjacent to
      the other regenerate-name registrations (between
      `regenerateRiverNamesTool` and `regenerateZonesTool`).

## 6. Verify

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint 2>&1 | tail -50` — still 0 warnings, 0 info, 0
      errors. No new noise.

## 7. Commit

- [ ] Stage only:
      `src/ai/tools/regenerate-route-name.ts`,
      `src/ai/tools/regenerate-route-name.test.ts`,
      `src/ai/index.ts`,
      `aiplans/plan_326.md`,
      `aiplans/tasks_326.md`.
- [ ] Commit message:
      ```
      feat(ai): add regenerate_route_name tool

      Implements plan 326. Adds an AI chat tool that calls
      window.Routes.generateName(route) to refresh a single route's name,
      mirroring the "Generate name" button in the route editor.
      ```
- [ ] Do NOT commit `.claude/`, `current-ralph-loop.prompt`, `temp/`,
      or pre-existing dirty files.
- [ ] Do NOT push.
