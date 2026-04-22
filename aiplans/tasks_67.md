# Tasks 67 — rename_route AI tool

## Task 1 — findRouteByRef helper

- [ ] In `src/ai/tools/rename-route.ts`, export
  `findRouteByRef(routes, ref): RawRoute | null`:
  - Null if routes not array.
  - Numeric ref: iterate; return first non-removed entry where
    `route.i === ref`. Requires integer ref.
  - String ref: trim+lowercase; iterate non-removed; match
    `(route.name ?? "").toLowerCase() === needle`.

## Task 2 — Implement the tool

- [ ] `src/ai/tools/rename-route.ts`:
  - Types:
    - `RouteRenameRef { i, name }`.
    - `RouteRenameRuntime { find, rename }`.
  - `defaultRouteRenameRuntime.find`: findRouteByRef →
    `{ i, name: route.name ?? "" }`.
  - `defaultRouteRenameRuntime.rename(i, name)`: refind by i;
    throw if null; write `route.name = name`.
  - Tool schema: `route` (int|string required), `name` (string
    required non-empty).
  - Execute: parseEntityRef(route); validate name non-empty;
    find → 404; try rename; return `{ i, previousName, name }`.

## Task 3 — Register

- [ ] Import + barrel re-export (including findRouteByRef) +
  register in `src/ai/index.ts`.

## Task 4 — Tests

- [ ] `src/ai/tools/rename-route.test.ts`:
  - Runtime-injected: rename by id; rename by name; trim; unknown
    ref → error; invalid ref; invalid name; surface failures.
  - `findRouteByRef`: null, numeric i, non-contiguous, skip
    removed, case-insensitive name + trim, invalid refs.
  - Default-runtime integration:
    - Stub `globalThis.pack.routes` with non-contiguous ids + one
      removed.
    - Rename by id → name updated.
    - Rename a removed route → error.

## Task 5 — README

- [ ] Row under `list_routes`:
  ```
  | `rename_route`          | Rename a route (writes `route.name` — same as the Routes Editor name field). Matches by `route.i` (non-contiguous ids) or case-insensitive current name. Skips removed routes. | "Rename route 5 to The King's Road", "Rename the Silk Trail to Iron Passage" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/rename-route` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add rename_route tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (findRouteByRef + tool) → Tasks 1, 2.
- Plan step 2 (register) → Task 3.
- Plan step 3 (tests) → Task 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Routes Editor name field; AI can't rename.
- Plan writes the same `route.name` field the UI writes. The
  Overview re-renders from `pack.routes` on next open.
- Non-contiguous / removed-skip semantics match the existing
  river pattern so AI code can reason about route refs consistently.

## Verification that tests prove the use case

- findRouteByRef unit tests cover the id resolution helper.
- Runtime-injected tests validate input + dispatch.
- Integration test proves the live mutation lands on the right
  array slot.
