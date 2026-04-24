# Tasks — Plan 276 (`get_measurement_units`)

- [x] Study `set-measurement-units.ts` + test — confirm DOM ids + stored keys.
- [x] Study `get-layer-visibility.ts` + test — runtime-seam + integration block
      pattern.
- [x] Confirm `_shared/index.ts` exports `okResult` / `errorResult` /
      `getGlobal` (used as templating reference; this tool reads via runtime
      seam instead of globals).
- [x] Write plan doc (`plan_276.md`).
- [ ] Implement `src/ai/tools/get-measurement-units.ts`:
  - [ ] Declare `MeasurementUnitsReadRuntime { readUnit(elementId, storedKey):
        string | null }`.
  - [ ] Export `defaultMeasurementUnitsReadRuntime` — reads
        `document.getElementById(elementId)?.value`; falls back to
        `localStorage.getItem(storedKey)`; returns `null` otherwise. Handles
        undefined `document` / `localStorage`.
  - [ ] Export `createGetMeasurementUnitsTool(runtime?)` factory.
  - [ ] Export `getMeasurementUnitsTool` (default instance).
  - [ ] Tool schema: object with no properties / no required array.
  - [ ] `execute`: reads distance/area/height/temperature via runtime and
        returns `{ok, units: {...}}`.
- [ ] Implement `src/ai/tools/get-measurement-units.test.ts`:
  - [ ] Unit suite (mocked runtime): returns all four fields, preserves
        runtime values, handles `null` returns, tool name + schema shape
        assertions.
  - [ ] `defaultMeasurementUnitsReadRuntime (integration)` block with
        `beforeEach`/`afterEach` that swaps `globalThis.document` /
        `globalThis.localStorage` using `as unknown as { ... }` casts.
  - [ ] Exercises: DOM input value wins; localStorage fallback when DOM
        element missing; null when neither present; undefined document
        handling.
- [ ] Register + re-export in `src/ai/index.ts`:
  - [ ] Import next to `getMapInfoTool` (alphabetical).
  - [ ] Re-export block mirroring `get-layer-visibility`.
  - [ ] `registry.register(getMeasurementUnitsTool)` near
        `getLayerVisibilityTool`.
- [ ] Update `README_AI.md`: insert row right after `set_measurement_units`.
      Mention no args, return shape, read-only, Anthropic API-key requirement,
      2-3 example prompts.
- [ ] `npm run build` — must pass.
- [ ] `npm test` — must pass (baseline 5015 → +new tests).
- [ ] `npm run lint` — must match baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit `feat(ai): add get_measurement_units tool`.
