# Tasks 96 — set_marker_pin AI tool

- [ ] Add `pin?: string`, `fill?: string`, `stroke?: string`
  to RawMarker in `src/ai/tools/_shared/pack-types.ts`.

- [ ] Create `src/ai/tools/set-marker-pin.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getNotes,
      getPack, okResult, parseEntityRef, type RawMarker,
      type RawNote.
    - `./set-marker-note`: findMarkerNoteRef,
      type MarkerNotePackLike.
  - Exports:
    - `MARKER_PIN_SHAPES` (readonly): `bubble`, `pin`,
      `square`, `squarish`, `diamond`, `hex`, `hexy`,
      `shieldy`, `shield`, `pentagon`, `heptagon`,
      `circle`, `no`.
    - `MarkerPin` type = element of MARKER_PIN_SHAPES.
    - `DEFAULT_MARKER_PIN = "bubble"`.
    - `resolveMarkerPin(value) -> MarkerPin | null`:
      case-insensitive lookup against the list.
    - `MarkerPinRef { i, name, previousPin }`.
    - `MarkerPinRuntime { find, setPin }`.
    - `defaultMarkerPinRuntime`:
      - find: findMarkerNoteRef; previousPin =
        marker.pin ?? DEFAULT_MARKER_PIN.
      - setPin(i, pin):
        - Get pack.markers; throw if missing.
        - Find by i; throw if missing.
        - marker.pin = pin.
        - best-effort drawMarkers().
    - `createSetMarkerPinTool(runtime?)` and
      `setMarkerPinTool`.
  - Tool name: `set_marker_pin`.
  - Description: references Markers Editor Pin Shape
    dropdown, lists the 13 shapes, notes default bubble,
    per-marker scope, idempotent.
  - Schema: `marker` (int|string required), `pin`
    (string enum of MARKER_PIN_SHAPES, required).
  - Validation:
    - parseEntityRef.
    - typeof pin !== "string" OR empty → error w/ supported list.
    - resolveMarkerPin(pin) returns null → error w/ supported list.
    - find returns null → "No marker found..."
  - Noop: previousPin === canonical.
  - Return payload: `{ i, name, pin, previousPin, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `set-marker-*`.
  - Barrel re-export: `createSetMarkerPinTool`,
    `DEFAULT_MARKER_PIN`, `MARKER_PIN_SHAPES`,
    `resolveMarkerPin`, `setMarkerPinTool`, types.
  - `registry.register(setMarkerPinTool)`.

- [ ] Write `src/ai/tools/set-marker-pin.test.ts`:
  - `resolveMarkerPin`:
    - canonicalizes "Bubble", "PIN", "CIRCLE".
    - returns null for unknown / empty / non-string.
  - Unit (stubbed):
    - sets by numeric id
    - resolves by case-insensitive name and canonicalizes
      pin input
    - rejects unknown pin shape (supported list in error
      body)
    - rejects empty / non-string pin
    - rejects invalid refs
    - rejects unknown marker
    - noop when unchanged
    - surfaces runtime errors
  - `defaultMarkerPinRuntime (integration)`:
    - stubs pack.markers, notes, drawMarkers.
    - writes pin by id.
    - no cascade to same-type markers (unlike UI).
    - succeeds when drawMarkers missing.

- [ ] Update `README_AI.md` — row near `set_marker_size`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_marker_pin tool`.

## Verification: tasks → plan

- File + registration cover "callable".
- Enum matches the 13 shapes from index.html.
- Per-marker scope matches plan.
- drawMarkers best-effort matches plan.

## Verification: plan → use case

- UI dropdown writes marker.pin; tool does the same.
- UI cascades to same-type; tool deliberately scopes to
  one marker (same pattern as set_marker_icon /
  set_marker_size) — documented.

## Verification: tests → regressions

- If enum drops a shape, the canonicalization test
  fails.
- If apply forgot marker.pin write, integration fails.
- If cascade slipped in, no-cascade test fails.
- If unknown shape slipped through, rejection test
  fails.
- If noop semantics changed, noop test fails.
