# Tasks 51 — rename_regiment AI tool

## Task 1 — Implement findRegimentByRef helper

- [ ] In `src/ai/tools/rename-regiment.ts`, export
  `findRegimentByRef(military, ref): RawRegiment | null`:
  - Null if not an array.
  - Numeric ref: iterate; return first `r && r.i === ref`.
  - String ref: trim + lowercase; iterate; return first
    `(r.name ?? "").toLowerCase() === needle`.

## Task 2 — Implement the tool

- [ ] Define types:
  - `RegimentRenameRef { stateId, stateName, i, name }`.
  - `RegimentRenameRuntime { find(stateRef, regRef), rename(stateId,
    i, name) }`.
- [ ] `defaultRegimentRenameRuntime.find(stateRef, regRef)`:
  - Use `resolveStateRefInPack(getPack<BurgPackLike>(), stateRef)`.
  - Null if state missing / null.
  - Look up state: `pack.states[stateId]`.
  - Skip if `!isActive(state)`.
  - Find regiment via `findRegimentByRef(state.military, regRef)`.
  - Return `{ stateId, stateName: state.name, i, name }` or null.
- [ ] `rename(stateId, i, name)`:
  - Find state; throw if missing / inactive.
  - Find regiment; throw if missing.
  - Write `regiment.name = name`.
  - If `document` available:
    - `document.getElementById("regiment" + stateId + "-" + i)`?.
    - Set `data-name` attribute to the new name.
- [ ] Tool schema: `state` (int|string required), `regiment`
  (int|string required), `name` (string, non-empty, required).
- [ ] Execute:
  - `parseEntityRef(input.state, "state")` — but state 0 is
    Neutrals, which may or may not have a military; parseEntityRef
    rejects 0. We need to accept state 0? Looking at
    resolveStateRefInPack it accepts numeric state 0. Hmm —
    actually resolveStateRefInPack treats the numeric ref as array
    index so state 0 is legitimate. For consistency with
    `list_regiments`, I won't use parseEntityRef; I'll do manual
    validation (integer ≥ 0 OR non-empty string).
  - Validate regiment ref (int ≥ 0 OR non-empty string).
  - Validate `name` is non-empty string.
  - `runtime.find(stateRef, regRef)` → 404 on miss.
  - Try/catch `runtime.rename`, respond
    `{ stateId, stateName, i, previousName, name }`.

## Task 3 — Register in ai/index

- [ ] `import { renameRegimentTool } from "./tools/rename-regiment";`.
- [ ] Barrel re-export `createRenameRegimentTool`,
  `findRegimentByRef`, `renameRegimentTool`.
- [ ] `registry.register(renameRegimentTool)` after
  `renameReligionTool`.

## Task 4 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/rename-regiment.test.ts`:
  - Rename by (state id, regiment id).
  - Rename by (state name, regiment name).
  - Trim name whitespace.
  - Unknown state → error, rename not called.
  - Unknown regiment (state valid) → error.
  - Invalid state refs (null, -1, 1.5, "").
  - Invalid regiment refs (null, -1, 1.5, "").
  - Invalid name (non-string, empty, whitespace).
  - Rename to same name still calls rename.
  - Surface runtime failures.

## Task 5 — findRegimentByRef tests

- [ ] In the same test file:
  - Null military.
  - Numeric i match; unknown id returns null.
  - Case-insensitive name + whitespace trim.
  - Invalid refs (1.5, "", "   ").

## Task 6 — Default-runtime integration test

- [ ] `describe("defaultRegimentRenameRuntime (integration)")`:
  - beforeEach: stub `globalThis.pack.states` with a couple of
    states bearing `military` arrays. Stub `globalThis.document`
    with a fake element for `#regiment1-2` (setAttribute spy).
  - afterEach: restore.
  - Test: rename via live runtime → regiment.name updated +
    setAttribute called.
  - Test: rename when element not mounted still succeeds.
  - Test: unknown regiment → error surfaced, no mutation.

## Task 7 — README

- [ ] Add row under `list_regiments`:
  ```
  | `rename_regiment`       | Rename a specific regiment (same as the Regiment Editor name field). Regiment ids are per-state, so pass both `state` (id or name) and `regiment` (id or current regiment name). Writes `regiment.name` and updates the SVG `#regiment{stateId}-{i}` tooltip attribute. | "Rename Rookhold's 1st Army to Ashguard Legion", "Call regiment 2 of Ashholm 'The Red Phalanx'" |
  ```

## Task 8 — Verify

- [ ] `npm test -- --run src/ai/tools/rename-regiment` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7/1 baseline.
- [ ] `npm run build` succeeds (no unused-import errors).

## Task 9 — Commit

- [ ] `feat(ai): add rename_regiment tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (findRegimentByRef helper) → Task 1.
- Plan step 2 (register) is Task 3; step 1's "new file" is Task 2.
- Plan step 2 (SVG id verification) was done during planning — id
  pattern confirmed as `regiment{stateId}-{i}` via grep of
  `src/renderers/draw-military.ts:50`.
- Plan step 4 (tests) → Tasks 4, 5, 6.
- Plan step 5 (README) → Task 7.
- Plan "Verification" → Task 8.

## Verification that plan accomplishes the use case

- Use case: user renames regiments via Regiment Editor, AI cannot.
- Plan writes the same `regiment.name` the UI writes AND updates
  the same `data-name` attribute the UI updates (the attribute drives
  the hover tooltip). The Regiments Overview reads from `regiment.name`
  directly on next open, so the rename is fully observable.
- Two-part ref matches how `list_regiments` already returns data,
  so AI can chain list → rename without any ambiguity about which
  regiment is targeted.

## Verification that tests prove the use case

- findRegimentByRef tests validate the id/name resolution helper.
- Runtime-injected tool tests cover validation + error surfacing +
  happy-path arg plumbing.
- Integration test proves the live runtime actually mutates
  `state.military[k].name` and calls `setAttribute` on the right
  SVG id, end-to-end.
