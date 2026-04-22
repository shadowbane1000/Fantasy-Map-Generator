# Tasks 3 — Execution checklist for Plan 3

## Setup

- [ ] T1. Confirm baseline (7 warnings / 1 info / 0 errors; 88 tests).

## Implementation

- [ ] T2. Create `src/ai/tools/apply-layers-preset.ts`
      - Exports `PresetRuntime` interface + `defaultPresetRuntime`.
      - Canonical list + alias table, single lookup Map.
      - `createApplyLayersPresetTool(runtime?)` + default
        `applyLayersPresetTool`.
      - Error shape matches the style used by the other tools.

- [ ] T3. Update `src/ai/index.ts`
      - Import `applyLayersPresetTool`, register it, re-export it.

- [ ] T4. Update `README_AI.md` — tool table row with aliases + prompts.

## Testing

- [ ] T5. Create `src/ai/tools/apply-layers-preset.test.ts`
      Cases: canonical call, alias mapping (`"culture map"` →
      `"cultural"`), unknown preset returns supported list, missing/empty
      input, runtime throws, case-insensitive.

## Gates

- [ ] T6. `npm run lint` — baseline unchanged.
- [ ] T7. `npm test -- --run` — all pass.
- [ ] T8. `npm run build` — succeeds.

## Plan↔tasks↔tests verification

- Use-case criterion #1 (canonical call) → Test 1 / Test 6.
- #2 (aliases) → Test 2.
- #3 (structured unknown-preset error) → Test 3.
- #4 (graceful pre-load error) → Test 5.
- No infra changes — only a new tool file + registry wiring.
