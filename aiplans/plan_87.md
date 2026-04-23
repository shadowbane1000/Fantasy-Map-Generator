# Plan 87 — set_route_lock AI tool

## Use case

The Routes Editor (`public/modules/ui/routes-editor.js:377`)
and Routes Overview (`public/modules/ui/routes-overview.js:136`)
both expose a lock-icon toggle per route. Clicking it
flips a single boolean:

```js
route.lock = !route.lock;
```

Locked routes are preserved when regenerating / rerouting.
`set_entity_lock` covers state/burg/culture/religion/
province — but not routes. This tool fills that gap.

## Scope

Add one tool: `set_route_lock(route, locked)`.

- `route` — numeric id (> 0) or case-insensitive name.
  Reuses `findRouteByRef` from `./rename-route`.
- `locked` — boolean. Sets `route.lock = true` or clears
  the flag.
- Idempotent: noop when already at target.
- No redraw — route lock is purely metadata; the UI's
  lock icon update is cosmetic and happens within the
  editor panels, not on the main map.

## Implementation

1. **New file `src/ai/tools/set-route-lock.ts`**:
   - Imports: errorResult, getPackCollection, okResult,
     parseEntityRef, type RawRoute, from `./_shared`;
     findRouteByRef from `./rename-route`.
   - `RouteLockRef { i, name, previousLocked }`.
   - `RouteLockRuntime { find, apply }`.
   - `defaultRouteLockRuntime`:
     - find: findRouteByRef → `{ i, name, previousLocked:
       !!route.lock }`.
     - apply(i, locked): find route, on true write
       `route.lock = true`; on false `delete route.lock`
       (matches the `set-marker-lock` pattern of
       deleting the key to keep serialization clean).
   - Schema: `route` (int|string required), `locked`
     (boolean required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-route-lock.test.ts`:
   - Unit (stubbed runtime):
     - locks by id
     - unlocks by id
     - resolves by case-insensitive name
     - noop when already locked
     - noop when already unlocked
     - rejects non-boolean locked
     - rejects invalid refs
     - rejects unknown route
     - surfaces runtime errors
   - Integration:
     - stubs `globalThis.pack.routes`.
     - locks a route (adds `.lock = true`).
     - unlocks a route (removes the `lock` key entirely,
       not `lock = false`).

4. **README_AI.md** — row near `rename_route`.

## Verification

- `npm test -- --run src/ai/tools/set-route-lock` green.
- `npm test -- --run` — 1082 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- Writes `route.lock = true` on lock; deletes the key on
  unlock.
- Idempotent; rejects invalid input.
