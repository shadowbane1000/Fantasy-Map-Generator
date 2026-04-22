# Plan 49 — set_marker_lock AI tool

## Use case

The Markers Overview has a lock icon next to every row
(`public/modules/ui/markers-overview.js:160 toggleLockStatus`) — it
sets / deletes `marker.lock`. Locked markers are preserved across
regeneration (like other locked entities).

The existing `set_entity_lock` tool covers states, burgs, cultures,
religions, and provinces — but NOT markers (they use non-contiguous
ids, which the shared `findEntityByRef` can't resolve). So the user
can lock a marker via the UI, but the AI can't. Matching the marker
tool family's structure (id or note-name resolution), a dedicated
`set_marker_lock` is cleaner than retrofitting `set_entity_lock`.

## Scope

Add one tool: `set_marker_lock(marker, locked)`. Explicit boolean.
Idempotent (noop if already in the requested state). Writes
`marker.lock` and deletes it when unlocking — exactly what
`toggleLockStatus` does. No redraw required: the UI only changes its
own icon class, which is an editor-local concern; the map overlay
doesn't depend on `lock`.

Refs resolve via `findMarkerNoteRef` (same helper already shared by
set_marker_note / remove_marker / set_marker_pinned).

## Implementation

1. **New file `src/ai/tools/set-marker-lock.ts`** — nearly identical
   structure to `set-marker-pinned.ts`, minus the DOM/group attribute
   handling:
   - Imports: `errorResult`, `getNotes`, `getPack`, `okResult`,
     `parseEntityRef`, `RawMarker`, `RawNote` from `_shared`;
     `findMarkerNoteRef`, `type MarkerNotePackLike` from
     `./set-marker-note`.
   - `MarkerLockRef { i, name, previousLocked }`.
   - `MarkerLockRuntime { find(ref), setLock(i, locked) }`.
   - `defaultMarkerLockRuntime.find`: reuse `findMarkerNoteRef`, look
     up `marker.lock` from pack.markers.
   - `defaultMarkerLockRuntime.setLock(i, locked)`:
     - Get `pack.markers`; throw if not array or no matching entry.
     - `locked` true → `marker.lock = true`.
     - `locked` false → `delete marker.lock`.
   - Tool schema: `marker` (int|string required), `locked` (boolean
     required).
   - Execute: parseEntityRef → validate locked → find → noop if
     already in state → try/catch setLock → respond.

2. **Register** in `src/ai/index.ts`: import, barrel export,
   register after `setMarkerPinnedTool`.

3. **Tests `src/ai/tools/set-marker-lock.test.ts`** (runtime-injected):
   - Locks an unlocked marker.
   - Unlocks a locked marker.
   - Resolves by case-insensitive note name.
   - Noop when already locked / unlocked.
   - Rejects unknown marker.
   - Rejects invalid `marker` refs.
   - Rejects non-boolean `locked`.
   - Surfaces runtime failures.

4. **Default-runtime integration test**:
   - Stub `globalThis.pack.markers` with at least one marker already
     `lock: true`.
   - Stub `globalThis.notes` for name resolution.
   - Test: lock unlocked marker → `marker.lock === true`.
   - Test: unlock locked marker → `marker.lock` key deleted.
   - Test: resolves by note name.
   - Test: noop does not mutate the marker.

5. **README_AI.md** — new row under `set_marker_pinned`.

## Verification

- `npm test -- --run src/ai/tools/set-marker-lock` green.
- `npm test -- --run` — full suite green (598 before).
- `npm run lint` — 7 / 1 baseline intact. (Must catch any
  `useOptionalChain` / similar autofixable things before commit — the
  previous iteration caught one of these.)
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "lock the Rookhold marker" / "unlock marker 5" and the
  marker's lock flag matches the UI's icon toggle exactly.
- Idempotent.
- Refs resolve by id OR by current note name, same as every other
  marker tool.
