# Tasks 89 — set_marker_icon AI tool

- [ ] Create `src/ai/tools/set-marker-icon.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getNotes,
      getPack, okResult, parseEntityRef, type RawMarker,
      type RawNote.
    - `./set-marker-note`: findMarkerNoteRef,
      type MarkerNotePackLike.
  - Exports:
    - `MarkerIconRef { i, name, previousIcon }`.
    - `MarkerIconRuntime { find, setIcon }`.
    - `defaultMarkerIconRuntime`:
      - find: use findMarkerNoteRef, hydrate previousIcon
        from marker.icon (default empty string).
      - setIcon(i, icon):
        - get pack.markers; throw if missing.
        - find marker by i; throw if missing.
        - `marker.icon = icon`.
        - best-effort drawMarkers().
    - `createSetMarkerIconTool(runtime?)`, `setMarkerIconTool`.
  - Tool name: `set_marker_icon`.
  - Description: notes it mirrors the Markers Editor icon
    picker, writes `marker.icon`, calls drawMarkers, and
    explicitly calls out per-marker scope (no same-type
    cascade like the UI).
  - Schema: `marker` (int|string, required), `icon`
    (string, required, non-empty after trimming).
  - Validation:
    - parseEntityRef(marker).
    - typeof icon !== "string" OR trimmed empty → error.
  - Noop: `previousIcon === trimmed`.
  - Return payload:
    `{ i, name, icon, previousIcon, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `set-marker-*`.
  - Barrel re-export.
  - `registry.register(setMarkerIconTool)` near other
    set-marker-* registrations.

- [ ] Write `src/ai/tools/set-marker-icon.test.ts`:
  - Unit (stubbed runtime):
    - sets by numeric id
    - resolves by case-insensitive note name
    - trims whitespace
    - noop when already the same icon
    - rejects empty / whitespace-only icon
    - rejects non-string icon
    - rejects invalid refs
    - rejects unknown marker
    - surfaces runtime errors
  - `defaultMarkerIconRuntime (integration)`:
    - stubs `globalThis.pack.markers` (3 markers,
      one with type "volcano" id 5, one with same type
      id 8, one without type id 2).
    - stubs `globalThis.notes = [{id:"marker5",name:"Lair"}]`.
    - stubs `globalThis.drawMarkers = vi.fn()`.
    - writes icon by id — verifies pack.markers[i].icon
      updated and drawMarkers called once.
    - resolves by "lair" name.
    - no cascade: changing marker 5's icon does NOT
      change marker 8's icon despite same type.
    - succeeds when drawMarkers missing.

- [ ] Update `README_AI.md` — row near `set_marker_type`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_marker_icon tool`.

## Verification: tasks → plan

- File + registration cover "tool registered and
  callable".
- Per-marker scope matches plan's explicit scope choice.
- Integration covers drawMarkers invocation and the
  no-cascade guarantee.

## Verification: plan → use case

- UI writes `marker.icon = value`; tool does the same.
- UI cascades; tool deliberately does not. Documented.

## Verification: tests → regressions

- If apply forgot to write icon, integration assertion
  fails.
- If apply accidentally cascaded to same-type markers,
  the no-cascade assertion fails.
- If drawMarkers wasn't called, the call assertion fails.
- If drawMarkers missing threw, the "missing"
  integration test fails.
- If noop semantics broke, the noop test fails.
