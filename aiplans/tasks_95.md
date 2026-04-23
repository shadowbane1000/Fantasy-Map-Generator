# Tasks 95 — set_marker_size AI tool

- [ ] Add `size?: number` to RawMarker in
  `src/ai/tools/_shared/pack-types.ts` if not present.

- [ ] Create `src/ai/tools/set-marker-size.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getNotes,
      getPack, okResult, parseEntityRef, type RawMarker,
      type RawNote.
    - `./set-marker-note`: findMarkerNoteRef,
      type MarkerNotePackLike.
  - Exports:
    - `DEFAULT_MARKER_SIZE = 30` (matches the UI
      default).
    - `MarkerSizeRef { i, name, previousSize }`.
    - `MarkerSizeRuntime { find, setSize }`.
    - `defaultMarkerSizeRuntime`:
      - find: findMarkerNoteRef → hydrate previousSize
        from `marker.size ?? DEFAULT_MARKER_SIZE`.
      - setSize(i, size):
        - get pack.markers; throw if missing.
        - find marker by i; throw if missing.
        - marker.size = size.
        - best-effort drawMarkers().
    - `createSetMarkerSizeTool(runtime?)` / `setMarkerSizeTool`.
  - Tool name: `set_marker_size`.
  - Description: references Markers Editor size input,
    mentions default 30, per-marker scope, idempotent.
  - Schema: `marker` (int|string required), `size`
    (number required, > 0).
  - Validation:
    - parseEntityRef(marker).
    - typeof size !== "number" || !Number.isFinite(size)
      || size <= 0 → error.
    - find returns null → "No marker found..."
  - Noop: `previousSize === size`.
  - Return payload: `{ i, name, size, previousSize, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import alongside other `set-marker-*` imports.
  - Barrel re-export: `createSetMarkerSizeTool`,
    `DEFAULT_MARKER_SIZE`, `setMarkerSizeTool`,
    types.
  - `registry.register(setMarkerSizeTool)`.

- [ ] Write `src/ai/tools/set-marker-size.test.ts`:
  - Unit (stubbed runtime):
    - sets by numeric id
    - resolves by case-insensitive note name
    - rejects non-finite size (Infinity, NaN,
      non-number)
    - rejects zero / negative size
    - rejects invalid marker refs
    - rejects unknown marker
    - noop when unchanged
    - surfaces runtime errors
  - `defaultMarkerSizeRuntime (integration)`:
    - stubs pack.markers (including a same-type pair),
      notes, drawMarkers.
    - writes size by id; asserts pack.markers[i].size
      updated and drawMarkers called once.
    - resolves by name.
    - no cascade: same-type marker keeps its size.
    - succeeds when drawMarkers missing.

- [ ] Update `README_AI.md` — row near `set_marker_icon`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_marker_size tool`.

## Verification: tasks → plan

- File layout + registration cover "callable".
- Runtime seam matches plan.
- Size validation matches plan (positive finite).

## Verification: plan → use case

- UI writes marker.size and refreshes SVG. Tool writes
  marker.size and calls drawMarkers which re-renders the
  whole layer — achieves the same visual outcome via a
  supported renderer instead of brittle per-element
  math.
- Per-marker decision matches set_marker_icon pattern
  and is documented.

## Verification: tests → regressions

- If apply forgot to write size, integration fails.
- If drawMarkers not called, assertion fails.
- If cascade to same-type markers leaked in,
  no-cascade test fails.
- If zero/negative size slipped through, the
  rejection test fails.
- If noop semantics changed, the noop test fails.
