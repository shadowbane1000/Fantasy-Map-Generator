# Tasks 109 — set_river_width AI tool

- [ ] Check `RawRiver` in
  `src/ai/tools/_shared/pack-types.ts` for `sourceWidth`
  and `widthFactor` fields; add if missing.

- [ ] Create `src/ai/tools/set-river-width.ts`:
  - Imports from `./_shared`: errorResult, getPack,
    okResult, parseEntityRef, type RawRiver.
  - Import `findRiverByRef` from `./rename-river`.
  - Exports:
    - `SOURCE_WIDTH_MIN = 0`, `SOURCE_WIDTH_MAX = 3`.
    - `WIDTH_FACTOR_MIN = 0.1`, `WIDTH_FACTOR_MAX = 4`.
    - `RiverWidthRef { i, name, previousSourceWidth,
       previousWidthFactor }`.
    - `RiverWidthPatch { sourceWidth?, widthFactor? }`.
    - `RiverWidthRuntime { find, apply }`.
    - `defaultRiverWidthRuntime`:
      - find: findRiverByRef on pack.rivers;
        previousSourceWidth = river.sourceWidth ?? 0,
        previousWidthFactor = river.widthFactor ?? 1.
      - apply: get pack.rivers; throw if missing; find
        river; throw if missing; write the provided
        fields.
    - `createSetRiverWidthTool(runtime?)` /
      `setRiverWidthTool`.
  - Tool name: `set_river_width`.
  - Description: references Rivers Editor width inputs,
    lists ranges, notes data-only (UI will recompute
    river.width on next open).
  - Schema: river (int|string, required), sourceWidth
    (number, optional, min 0, max 3), widthFactor
    (number, optional, min 0.1, max 4).
  - Validation:
    - parseEntityRef(river).
    - If sourceWidth present: must be number, finite,
      in [0, 3].
    - If widthFactor present: must be number, finite,
      in [0.1, 4].
    - Neither provided → error.
    - find returns null → "No river found..."
  - Noop: every provided field already matches.
  - Return payload: `{ i, name, sourceWidth,
    widthFactor, previousSourceWidth,
    previousWidthFactor, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near setRiverTypeTool.
  - Barrel re-export.
  - `registry.register(setRiverWidthTool)`.

- [ ] Write `src/ai/tools/set-river-width.test.ts`:
  - Unit (stubbed):
    - sets sourceWidth only
    - sets widthFactor only
    - sets both
    - rejects missing both
    - rejects out-of-range sourceWidth (>3, <0)
    - rejects out-of-range widthFactor (>4, <0.1)
    - rejects non-finite / non-number values
    - rejects invalid river refs
    - rejects unknown river
    - noop when provided values match current
    - surfaces runtime errors
  - `defaultRiverWidthRuntime (integration)`:
    - stubs pack.rivers.
    - writes sourceWidth only; widthFactor untouched.
    - writes both.
    - rejects removed river (findRiverByRef skips).

- [ ] Update `README_AI.md` — row near `set_river_type`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_river_width tool`.

## Verification: tasks → plan

- File + registration = "callable".
- Range validation matches UI input constraints.
- Data-only behavior matches plan (no recompute / redraw).

## Verification: plan → use case

- UI writes sourceWidth / widthFactor then recomputes
  + redraws. Tool writes them and leaves recompute to
  UI on next open / regenerate.

## Verification: tests → regressions

- If apply wrote undefined fields, the "only one"
  integration test fails.
- If range validation regressed, boundary tests fail.
- If noop path dropped, noop test fails.
- If missing-both validation dropped, the
  no-fields test fails.
