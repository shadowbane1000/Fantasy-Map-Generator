# Tasks 123 — set_marker_icon_size

- [ ] Capture baselines (lint + test counts).
- [ ] Create `src/ai/tools/set-marker-icon-size.ts`:
  - [ ] Export `DEFAULT_MARKER_ICON_SIZE = 12`,
        `MARKER_ICON_SIZE_MIN = 2`,
        `MARKER_ICON_SIZE_MAX = 20`.
  - [ ] `SetMarkerIconSizeRuntime { find, apply }`.
  - [ ] `defaultSetMarkerIconSizeRuntime` uses
        `findMarkerNoteRef` + `getPack` + `drawMarkers`.
  - [ ] `createSetMarkerIconSizeTool(runtime)` returning a
        `Tool` with kebab name `set_marker_icon_size`.
  - [ ] Input schema: `marker` (int|string), `size`
        (number).
  - [ ] Reject non-finite size + out-of-range.
  - [ ] Noop when unchanged.
  - [ ] Surface runtime errors.
- [ ] Create `src/ai/tools/set-marker-icon-size.test.ts`:
  - [ ] sets px by numeric id
  - [ ] resolves by case-insensitive note name
  - [ ] rejects non-finite size
  - [ ] rejects out-of-range size
  - [ ] rejects invalid marker refs
  - [ ] rejects unknown marker
  - [ ] noop when unchanged
  - [ ] surfaces runtime errors
  - [ ] `defaultSetMarkerIconSizeRuntime` integration
        (describe block): writes `px`, calls drawMarkers,
        resolves by name, no cascade, drawMarkers missing.
- [ ] Register in `src/ai/index.ts`:
  - [ ] Import `setMarkerIconSizeTool`.
  - [ ] Re-export factory + tool + constants.
  - [ ] `registry.register(setMarkerIconSizeTool)` near
        `setMarkerSizeTool`.
- [ ] Add README_AI.md table row under `set_marker_size`.
- [ ] Run `npm test -- --run` — all green.
- [ ] Run `npm run lint` — matches baseline.
- [ ] Run `npm run build` — succeeds.
- [ ] Commit with message
      `feat(ai): add set_marker_icon_size tool`.
