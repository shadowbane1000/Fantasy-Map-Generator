# Tasks 97 — set_marker_colors AI tool

- [ ] Create `src/ai/tools/set-marker-colors.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getNotes,
      getPack, okResult, parseEntityRef, type RawMarker,
      type RawNote.
    - `./set-marker-note`: findMarkerNoteRef,
      type MarkerNotePackLike.
    - `./set-state-color`: isValidCssColor.
  - Exports:
    - `DEFAULT_MARKER_FILL = "#ffffff"`,
      `DEFAULT_MARKER_STROKE = "#000000"`.
    - `MarkerColorsRef { i, name, previousFill,
       previousStroke }`.
    - `MarkerColorsRuntime { find, apply }` —
      `apply(i, { fill?, stroke? })`.
    - `defaultMarkerColorsRuntime`:
      - find: findMarkerNoteRef; previousFill =
        marker.fill ?? DEFAULT_MARKER_FILL;
        previousStroke = marker.stroke ??
        DEFAULT_MARKER_STROKE.
      - apply(i, colors):
        - pack.markers required; throw if missing.
        - find marker; throw if missing.
        - if colors.fill !== undefined: marker.fill =
          colors.fill.
        - if colors.stroke !== undefined: marker.stroke =
          colors.stroke.
        - best-effort drawMarkers().
    - `createSetMarkerColorsTool(runtime?)` and
      `setMarkerColorsTool`.
  - Tool name: `set_marker_colors`.
  - Description: references the two color inputs in the
    Markers Editor, per-marker scope, idempotent, notes
    at least one color is required.
  - Schema:
    - marker (int|string, required)
    - fill (string, optional — CSS color)
    - stroke (string, optional — CSS color)
  - Validation:
    - parseEntityRef(marker).
    - input.fill !== undefined && !isValidCssColor
      → error.
    - input.stroke !== undefined && !isValidCssColor
      → error.
    - Neither fill nor stroke provided → error
      "at least one of fill / stroke is required."
    - find returns null → "No marker found..."
  - Noop: every provided field already matches its
    previous value.
  - Return payload: `{ i, name, fill, stroke,
    previousFill, previousStroke, noop }`.
    (fill/stroke reflect the new value or previous when
    not provided.)

- [ ] Register in `src/ai/index.ts`:
  - Import near other `set-marker-*`.
  - Barrel re-export: `createSetMarkerColorsTool`,
    `DEFAULT_MARKER_FILL`, `DEFAULT_MARKER_STROKE`,
    `setMarkerColorsTool`, types.
  - `registry.register(setMarkerColorsTool)`.

- [ ] Write `src/ai/tools/set-marker-colors.test.ts`:
  - Unit (stubbed runtime):
    - sets fill only (apply called with `{fill}` only)
    - sets stroke only
    - sets both
    - resolves by case-insensitive note name
    - rejects invalid CSS color for fill
    - rejects invalid CSS color for stroke
    - rejects omitting both fill and stroke
    - rejects invalid refs
    - rejects unknown marker
    - noop when provided values match current
    - surfaces runtime errors
  - `defaultMarkerColorsRuntime (integration)`:
    - stubs pack.markers, notes, drawMarkers.
    - writes fill only — stroke untouched; drawMarkers
      called.
    - writes both.
    - no cascade: same-type marker untouched.
    - succeeds when drawMarkers missing.

- [ ] Update `README_AI.md` — row near `set_marker_pin`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_marker_colors tool`.

## Verification: tasks → plan

- File + registration cover plan's "callable".
- Apply writes only provided fields — matches plan.
- drawMarkers best-effort matches plan.
- Requires at least one of fill/stroke — matches plan.

## Verification: plan → use case

- UI writes marker.fill / marker.stroke when the user
  changes either color input; tool does the same with
  optional fields.
- UI cascades; tool deliberately scopes to one marker
  (documented).

## Verification: tests → regressions

- If apply writes undefined fields, the "fill only"
  integration test fails (stroke would be cleared).
- If cascade leaked in, the no-cascade assertion
  fails.
- If missing-both validation dropped, that rejection
  fails.
- If drawMarkers always threw and wasn't caught, the
  "missing" integration test fails.
- If noop semantics broke, noop test fails.
