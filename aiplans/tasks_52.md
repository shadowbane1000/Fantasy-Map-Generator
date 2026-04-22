# Tasks 52 — remove_regiment AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/remove-regiment.ts`:
  - Imports: `errorResult`, `getNotes`, `getPack`, `isActive`,
    `okResult`, `type RawNote` from `_shared`; `BurgPackLike`,
    `resolveStateRefInPack` from `./list-burgs`; `findRegimentByRef`
    from `./rename-regiment`.
  - Exports `RemoveRegimentRef { stateId, stateName, i, name }`,
    `RegimentRemovalRuntime { find, remove }`,
    `defaultRegimentRemovalRuntime`, `createRemoveRegimentTool`,
    `removeRegimentTool`.
- [ ] `defaultRegimentRemovalRuntime.find(stateRef, regRef)`:
  - `resolveStateRefInPack(getPack<BurgPackLike>(), stateRef)` → null
    if missing.
  - Grab `state = pack?.states?.[stateId]`; null if !isActive(state).
  - `findRegimentByRef(state.military, regRef)` → null if missing.
  - Return the Ref object.
- [ ] `defaultRegimentRemovalRuntime.remove(stateId, i)`:
  - Get state via pack.states[stateId]; throw if missing / inactive.
  - Get `state.military`; throw if not array.
  - `idx = military.findIndex(r => r && r.i === i)`; throw if < 0.
  - `military.splice(idx, 1)`.
  - `notes = getNotes<RawNote>()`; if Array, find index of
    `{id: "regiment" + stateId + "-" + i}`; splice if found.
  - If `document` defined:
    `document.getElementById("regiment" + stateId + "-" + i)?.remove()`.
- [ ] Tool schema: `state` (int|string required), `regiment`
  (int|string required).
- [ ] Execute:
  - Validate state/regiment refs (int ≥ 0 OR non-empty string).
  - `runtime.find` → 404 error.
  - Try/catch `runtime.remove(current.stateId, current.i)`.
  - Return `{ stateId, stateName, i, name }`.

## Task 2 — Register in ai/index

- [ ] Import.
- [ ] Barrel re-export.
- [ ] `registry.register(removeRegimentTool)` near other remove*
  tools.

## Task 3 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/remove-regiment.test.ts`:
  - Remove by (state id, regiment id).
  - Remove by (state name, regiment name).
  - Errors when state/regiment unknown.
  - Invalid state refs.
  - Invalid regiment refs.
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration

- [ ] `describe("defaultRegimentRemovalRuntime (integration)")`:
  - beforeEach: stub `globalThis.pack.states` with military array
    `[{i:0,name:"1st"},{i:2,name:"Phalanx"}]`. Stub
    `globalThis.notes` = `[{id:"regiment1-2",name:"Phalanx note"}]`.
    Stub `globalThis.document` with fake element for `#regiment1-2`
    exposing `remove` spy.
  - afterEach: restore.
  - Test: remove regiment 2 → military length 1, only i=0 left,
    notes length 0, SVG remove called.
  - Test: remove regiment 0 (no matching note) → regiment gone,
    notes still length 1 (unchanged for the 1-2 entry), no SVG
    element for `regiment1-0`, tool still succeeds.
  - Test: when document.getElementById returns null for the element,
    removal still succeeds.
  - Test: unknown regiment → error surfaced, pack unchanged.

## Task 5 — README

- [ ] Row under `rename_regiment`:
  ```
  | `remove_regiment`       | Disband a regiment — same as the Regiment Editor's Remove button (confirm dialog is skipped; tools run non-interactively). Splices it out of `pack.states[stateId].military`, drops the matching note, removes the `#regiment{stateId}-{i}` SVG element. Takes the same two-part `(state, regiment)` ref as `rename_regiment`. | "Disband Rookhold's fleet", "Remove regiment 2 from Ashholm" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/remove-regiment` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add remove_regiment tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (tests) → Tasks 3, 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can remove regiments via the Regiment Editor; AI
  cannot.
- Plan replicates every side-effect the UI handler performs: splice
  from `military`, splice matching note, remove SVG element. Result
  is indistinguishable from a UI-driven remove.
- Two-part `(state, regiment)` ref matches the ref shape used by
  `rename_regiment`, so chaining list → remove is straightforward.

## Verification that tests prove the use case

- Injected-runtime tests prove the tool's validation/orchestration
  is correct without needing a full pack.
- Default-runtime integration test exercises every live side-effect
  (army mutation, note splice, SVG remove) and the soft-failure
  branches (missing note, missing SVG element) so we know the tool
  won't break on partial state.
