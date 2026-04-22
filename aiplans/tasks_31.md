# Tasks 31 — Execution checklist for Plan 31

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 390 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-marker-note.ts`
      - `MarkerNoteRef`, `MarkerNoteRuntime`.
      - Pure helper `findMarkerNoteRef(pack, notes, ref)`.
      - `defaultMarkerNoteRuntime` that writes/creates in
        `window.notes`.
      - `createSetMarkerNoteTool(runtime?)` + `setMarkerNoteTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-marker-note.test.ts` — 12 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
