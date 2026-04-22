# Tasks 37 — Execution checklist for Plan 37

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 452 tests.

## Implementation

- [ ] T2. `src/ai/tools/remove-marker.ts`
      - `RemoveMarkerRef`, `MarkerRemovalRuntime`.
      - `defaultMarkerRemovalRuntime`:
        - `find` uses `findMarkerNoteRef` from `set-marker-note` for
          consistent lookup.
        - `remove(i)` splices `window.notes` and `pack.markers` in
          place and removes `#marker{i}` from the DOM.
      - `createRemoveMarkerTool(runtime?)` + `removeMarkerTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/remove-marker.test.ts` — 6 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
