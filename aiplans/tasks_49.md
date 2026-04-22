# Tasks 49 — set_marker_lock AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/set-marker-lock.ts`:
  - Imports: `errorResult`, `getNotes`, `getPack`, `okResult`,
    `parseEntityRef`, `RawMarker`, `RawNote` from `_shared`;
    `findMarkerNoteRef`, `type MarkerNotePackLike` from
    `./set-marker-note`.
  - Exports `MarkerLockRef { i, name, previousLocked }`,
    `MarkerLockRuntime { find, setLock }`, `defaultMarkerLockRuntime`,
    `createSetMarkerLockTool`, `setMarkerLockTool`.
- [ ] `defaultMarkerLockRuntime.find(ref)`:
  - Reuse `findMarkerNoteRef(getPack(), getNotes(), ref)`.
  - Look up `pack.markers.find(m => m?.i === i)?.lock` for
    `previousLocked`.
- [ ] `defaultMarkerLockRuntime.setLock(i, locked)`:
  - Get `pack.markers`; throw if not array.
  - Find marker; throw if missing.
  - `locked` true → `marker.lock = true`.
  - `locked` false → `delete marker.lock`.
- [ ] Tool schema: `marker` (int|string required), `locked`
  (boolean required).
- [ ] Execute:
  - `parseEntityRef(input.marker, "marker")`.
  - Validate `input.locked` is boolean.
  - `runtime.find(ref)` → 404 error on miss.
  - Noop when `previousLocked === input.locked`.
  - Try/catch `runtime.setLock`; return
    `{ i, name, locked, previousLocked, noop }`.

## Task 2 — Register in ai/index

- [ ] `import { setMarkerLockTool } from "./tools/set-marker-lock";`.
- [ ] Barrel re-export.
- [ ] `registry.register(setMarkerLockTool)` after
  `setMarkerPinnedTool`.

## Task 3 — Runtime-injected tests

- [ ] `src/ai/tools/set-marker-lock.test.ts`:
  - Locks an unlocked marker.
  - Unlocks a locked marker.
  - Resolves by case-insensitive note name.
  - Returns `noop` when already in requested state.
  - Rejects unknown marker.
  - Rejects invalid refs.
  - Rejects non-boolean `locked`.
  - Surfaces runtime errors.

## Task 4 — Default-runtime integration test

- [ ] beforeEach: stub `globalThis.pack.markers` = `[{i:2,lock:true},
  {i:5},{i:8}]`; stub `globalThis.notes` =
  `[{id:"marker5",name:"Dragon Lair"}]`.
- [ ] afterEach: restore.
- [ ] Tests:
  - Lock unlocked marker 5 → `pack.markers[1].lock === true`.
  - Unlock locked marker 2 → `pack.markers[0]` has no `lock` key.
  - Resolve by note name "dragon lair" → locks marker 5.
  - Noop (lock already-locked) → marker object unchanged (still
    `{i:2,lock:true}`).

## Task 5 — README

- [ ] Add row under `set_marker_pinned`:
  ```
  | `set_marker_lock`       | Lock or unlock a marker (same as the Markers Overview lock icon). Locked markers are preserved across regeneration. Idempotent. Writes/deletes `marker.lock`. Matches by id or case-insensitive current note name. | "Lock the Rookhold marker", "Unlock marker 5" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-marker-lock` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7 / 1 baseline intact. Check the new file
  for `useOptionalChain` patterns (`m && m.lock` → `m?.lock`) before
  finishing.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] Stage and commit. Message: `feat(ai): add set_marker_lock tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan step 5 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can lock markers via Overview lock icon, AI cannot.
- Plan writes the same `marker.lock` field the UI writes and deletes
  the key on unlock — identical observable behaviour.
- The UI additionally toggles its own icon class; our tool doesn't
  need to replicate that because the tool doesn't own editor DOM.
  The next time the user opens the Markers Overview, the icon class
  will be re-derived from `marker.lock`.

## Verification that tests prove the use case

- Injected-runtime tests cover every decision branch (lock, unlock,
  noop, invalid input, runtime failure).
- Integration test proves the field is actually set/deleted on a
  real-ish pack object, not merely that the runtime seam was called.
- Noop integration test ensures we don't mutate or redraw when no
  change is needed (consistent with set_marker_pinned).
