# Tasks 48 — set_marker_pinned AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/set-marker-pinned.ts`:
  - Imports: `errorResult`, `getGlobal`, `getNotes`, `getPack`,
    `okResult`, `parseEntityRef`, `RawMarker`, `RawNote` from
    `_shared`; `findMarkerNoteRef`, `type MarkerNotePackLike` from
    `./set-marker-note`.
  - Exports `MarkerPinnedRef { i, name, previousPinned }`,
    `MarkerPinnedRuntime { find, setPinned }`,
    `defaultMarkerPinnedRuntime`, `createSetMarkerPinnedTool`,
    `setMarkerPinnedTool`.
- [ ] `defaultMarkerPinnedRuntime.find(ref)`:
  - Resolve via `findMarkerNoteRef(getPack(), getNotes(), ref)`; null
    if absent.
  - Then look up the live `pack.markers` entry for `previousPinned`:
    `!!pack.markers.find(m => m.i === result.i)?.pinned`.
- [ ] `defaultMarkerPinnedRuntime.setPinned(i, pinned)`:
  - Get `pack.markers`; throw if not array or no matching entry.
  - `pinned` true → set `marker.pinned = true`.
  - `pinned` false → `delete marker.pinned`.
  - Compute `anyPinned = pack.markers.some(m => m.pinned)`.
  - If `document` defined: `document.getElementById("markers")`:
    - If `anyPinned`: `.setAttribute("pinned", "1")`.
    - Else: `.removeAttribute("pinned")`.
  - Best-effort `getGlobal<() => void>("drawMarkers")?.()` (try/catch).
- [ ] Tool schema: `marker` (int|string, required), `pinned` (boolean,
  required).
- [ ] Execute:
  - `parseEntityRef(input.marker, "marker")`.
  - Validate `input.pinned` is boolean.
  - `runtime.find(ref)` → 404 errorResult.
  - If `previousPinned === pinned` → return `noop: true` without
    calling setPinned.
  - Try/catch setPinned; return `{ i, name, pinned, previousPinned,
    noop: false }`.

## Task 2 — Register in ai/index

- [ ] `import { setMarkerPinnedTool } from "./tools/set-marker-pinned";`.
- [ ] Barrel re-export.
- [ ] `registry.register(setMarkerPinnedTool)` after
  `setMarkerNoteTool`.

## Task 3 — Runtime-injected tests

- [ ] `src/ai/tools/set-marker-pinned.test.ts`:
  - Pins a marker.
  - Unpins a marker.
  - Resolves by note name case-insensitively.
  - Returns `noop: true` when already pinned / unpinned.
  - Rejects unknown marker.
  - Rejects invalid marker refs.
  - Rejects non-boolean `pinned`.
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration test

- [ ] `describe("defaultMarkerPinnedRuntime (integration)")`:
  - beforeEach: stub `globalThis.pack` with markers `[{i:2,pinned:true},
    {i:5},{i:8,pinned:true}]` and notes
    `[{id:"marker5",name:"Dragon Lair"}]`. Stub `globalThis.document`
    with a fake `#markers` element (vi.fn setAttribute /
    removeAttribute). Stub `globalThis.drawMarkers` mock.
  - afterEach: restore.
  - Test: pin marker 5 → `pack.markers[1].pinned === true`,
    `setAttribute("pinned","1")` called, `drawMarkers` called.
  - Test: unpin marker 2 (one of two still pinned) →
    `setAttribute("pinned","1")` still called (anyPinned remains true).
  - Test: unpin both initially-pinned markers; after the last unpin,
    `removeAttribute("pinned")` is called.
  - Test: noop — pin an already-pinned marker → no `drawMarkers`, no
    setAttribute/removeAttribute call.
  - Test: resolves by note name "dragon lair" → pins marker 5.

## Task 5 — README

- [ ] Add row under `remove_marker`:
  ```
  | `set_marker_pinned`     | Pin or unpin a marker (same side-effect as the Markers Overview pin icon). Idempotent — noop if already in the requested state. Updates `marker.pinned`, the `#markers` `pinned` attribute, and calls `drawMarkers()`. Matches by marker id or case-insensitive current note name. | "Pin the Rookhold marker", "Unpin marker 5" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-marker-pinned` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — baseline intact.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] Stage and commit. Message: `feat(ai): add set_marker_pinned tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new tool file + runtime) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (injected-runtime tests) → Task 3.
- Plan step 4 (default-runtime integration) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can pin/unpin markers via Overview pin icon; AI
  cannot.
- Plan writes the same `marker.pinned` field, maintains the same
  `#markers[pinned]` attribute the UI uses to filter, and calls the
  same `drawMarkers()` global. Result indistinguishable from a
  click-based pin.
- Reuses `findMarkerNoteRef` so id/name resolution matches every
  other marker tool.

## Verification that tests prove the use case

- Injected-runtime tests cover every decision in the tool
  (validation, lookup, noop, mutation, error surfacing).
- Default-runtime integration test exercises the delicate
  group-attribute logic (which flips based on how many markers are
  pinned) — the UI depends on this for filtering, so it's the most
  likely place for subtle divergence. Every branch (first pin, mid
  unpin, last unpin, noop) is explicitly tested.
