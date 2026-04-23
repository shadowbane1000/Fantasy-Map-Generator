# Tasks 125 — set_marker_shift

- [ ] Capture baselines (lint + test counts).
- [ ] Create `src/ai/tools/set-marker-shift.ts`:
  - [ ] Export `DEFAULT_MARKER_SHIFT = 50`,
        `MARKER_SHIFT_MIN = 0`,
        `MARKER_SHIFT_MAX = 100`.
  - [ ] `SetMarkerShiftRuntime { find, apply }`.
  - [ ] `defaultSetMarkerShiftRuntime` uses
        `findMarkerNoteRef` + `getPack` + `drawMarkers`.
  - [ ] `createSetMarkerShiftTool(runtime)` returning a
        `Tool` with kebab name `set_marker_shift`.
  - [ ] Input schema: `marker` (int|string), `dx`
        (number, optional), `dy` (number, optional).
  - [ ] Require at least one of dx / dy.
  - [ ] Partial update preserves existing field.
  - [ ] Reject non-finite / out-of-range dx / dy.
  - [ ] Noop when both unchanged.
  - [ ] Surface runtime errors.
- [ ] Create `src/ai/tools/set-marker-shift.test.ts`:
  - [ ] sets both dx and dy by numeric id
  - [ ] sets only dx (preserves dy)
  - [ ] sets only dy (preserves dx)
  - [ ] resolves by case-insensitive note name
  - [ ] rejects when both dx and dy are missing
  - [ ] rejects non-finite dx / dy
  - [ ] rejects out-of-range dx / dy
  - [ ] accepts boundary values 0 and 100
  - [ ] rejects invalid marker refs
  - [ ] rejects unknown marker
  - [ ] noop when both unchanged
  - [ ] surfaces runtime errors
  - [ ] `defaultSetMarkerShiftRuntime` integration
        (describe block): writes dx/dy, calls drawMarkers,
        partial update preserves untouched field, resolves
        by name, no cascade, drawMarkers missing.
- [ ] Register in `src/ai/index.ts`:
  - [ ] Import `setMarkerShiftTool`.
  - [ ] Re-export factory + tool + constants.
  - [ ] `registry.register(setMarkerShiftTool)` near
        `setMarkerIconSizeTool`.
- [ ] Add README_AI.md table row under
      `set_marker_icon_size`.
- [ ] Run `npm test -- --run` — all green.
- [ ] Run `npm run lint` — matches baseline.
- [ ] Run `npm run build` — succeeds.
- [ ] Commit with message
      `feat(ai): add set_marker_shift tool`.
