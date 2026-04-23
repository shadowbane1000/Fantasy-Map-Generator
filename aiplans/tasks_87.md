# Tasks 87 — set_route_lock AI tool

- [ ] Create `src/ai/tools/set-route-lock.ts`:
  - Imports from `./_shared`: errorResult, getPackCollection,
    okResult, parseEntityRef, type RawRoute.
  - Import `findRouteByRef` from `./rename-route`.
  - Exports:
    - `RouteLockRef { i, name, previousLocked }`.
    - `RouteLockRuntime { find, apply }`.
    - `defaultRouteLockRuntime`:
      - find: findRouteByRef on pack.routes; returns null
        if not found. `{ i, name: route.name ?? "",
        previousLocked: !!route.lock }`.
      - apply(i, locked):
        - Get pack.routes; throw if missing.
        - Find route by i; throw if missing.
        - If locked: `(route as RawRoute).lock = true`.
        - Else: `delete (route as RawRoute).lock`.
    - `createSetRouteLockTool(runtime?)` / `setRouteLockTool`.
  - Tool name: `set_route_lock`.
  - Description: references Routes Editor / Overview lock
    icon, notes "locked routes survive regeneration",
    mentions idempotent.
  - Schema: `route` (int|string), `locked` (boolean). Both
    required.
  - Validation:
    - parseEntityRef(route).
    - typeof locked !== "boolean" → error.
  - Noop: `previousLocked === locked`.

- [ ] Register in `src/ai/index.ts`:
  - Import near `setRouteGroupTool`.
  - Barrel re-export.
  - `registry.register(setRouteLockTool)` near other
    set-route-* registrations.

- [ ] Write `src/ai/tools/set-route-lock.test.ts`:
  - Unit (stubbed runtime):
    - locks by numeric id
    - unlocks by numeric id
    - resolves by case-insensitive name
    - noop when already locked
    - noop when already unlocked
    - rejects non-boolean locked
    - rejects invalid refs
    - rejects unknown route
    - surfaces runtime errors
  - `defaultRouteLockRuntime (integration)`:
    - stubs `globalThis.pack.routes` with 3 entries:
      { i: 1, name: "Silk Trail" },
      { i: 5, name: "Iron Passage", lock: true },
      { i: 9, name: "Gone", removed: true }.
    - locks a route (write `.lock = true`).
    - unlocks a route (key removed, not false).
    - rejects a removed route (should findRouteByRef
      skip removed? Check — if yes, expect "not found").

- [ ] Update `README_AI.md`: row near `rename_route`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_route_lock tool`.

## Verification: tasks → plan

- File + registration covers the plan's "tool registered
  and callable".
- apply branches on locked match the plan's "write true /
  delete key" detail.
- Noop path matches plan.

## Verification: plan → use case

- UI does `route.lock = !route.lock`. Tool does
  `route.lock = true` or `delete route.lock` — same
  observable state.
- Noop when already at target matches UI's idempotent
  click behavior.

## Verification: tests → regressions

- If unlock wrote `false` instead of deleting, the
  integration test asserting `!("lock" in route)` fails.
- If lock wrote `1` instead of `true`, the identity check
  fails.
- If noop path was removed, the noop tests fail.
- If validation loosened (non-boolean slipping through),
  the bad-input test fails.
