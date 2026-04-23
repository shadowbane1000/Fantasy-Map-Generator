# Tasks 114 — set_state_labels_mode AI tool

- [ ] Create `src/ai/tools/set-state-labels-mode.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `STATE_LABELS_MODES = ["auto", "short", "full"]
       as const`.
    - `StateLabelsMode` type.
    - `resolveStateLabelsMode(value)` —
      case-insensitive lookup.
    - `StateLabelsModeRuntime { read, apply }`.
    - `defaultStateLabelsModeRuntime`:
      - read: `getGlobal<{stateLabelsMode?: string}>
        ("options")?.stateLabelsMode` → canonical or null.
      - apply(value):
        - window.options.stateLabelsMode = value (if
          options exists).
        - document.getElementById("stateLabelsModeInput")
          .value = value (if available).
        - localStorage.setItem("stateLabelsMode", value).
        - best-effort drawStateLabels().
    - `createSetStateLabelsModeTool(runtime?)` and
      `setStateLabelsModeTool`.
  - Tool name: `set_state_labels_mode`.
  - Description: references Options dialog State Labels
    selector.
  - Schema: `mode` (string enum, required).
  - Validation: typeof/empty/resolve.
  - Noop: current read matches target.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write test parallel to set-cultures-set.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` — all pass.
- [ ] `npm run lint` — still 7 / 1.
- [ ] `npm run build` — succeeds.
- [ ] Commit: `feat(ai): add set_state_labels_mode tool`.

## Verification: tasks → plan

- File + registration = "callable".
- 3-mode enum + case-insensitive resolution.
- apply pattern: options + select + localStorage +
  drawStateLabels (best-effort).

## Verification: plan → use case

- UI writes options.stateLabelsMode. Tool does the
  same plus select + localStorage + optional redraw.

## Verification: tests → regressions

- If apply skipped any of options/DOM/localStorage, a
  specific assertion fails.
- If drawStateLabels missing wasn't caught, that test
  fails.
- If noop semantics regressed, noop test fails.
