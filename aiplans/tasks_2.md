# Tasks 2 — Execution checklist for Plan 2

## Setup

- [ ] T1. Confirm baseline: `npm run lint` → 7 warnings / 1 info / 0 errors;
      `npm test -- --run` → 80 tests pass.

## Implementation

- [ ] T2. Create `src/ai/tools/set-layer-visibility.ts`
      - Export `interface LayerRuntime { isOn(buttonId): boolean;
        toggle(toggleFn): void; }`.
      - Export `defaultLayerRuntime: LayerRuntime` that reads
        `window.layerIsOn` and `window[toggleFn]` (with a fallback that
        reads the `.buttonoff` class directly so the tool still works
        before the legacy JS finishes loading, though it will have no one
        to call for `toggle` in that case).
      - Export a `LAYERS` map keyed by canonical layer name with aliases.
      - Export `createSetLayerVisibilityTool(runtime = defaultLayerRuntime): Tool`.
      - Export `setLayerVisibilityTool` constant that uses the default
        runtime.

- [ ] T3. Update `src/ai/index.ts`
      - Register `setLayerVisibilityTool` in `buildDefaultRegistry`.
      - Re-export `setLayerVisibilityTool`.

- [ ] T4. Update `README_AI.md`
      - Add the new tool to the tool table with example prompts.

## Testing

- [ ] T5. Create `src/ai/tools/set-layer-visibility.test.ts`
      - Exercises success + no-op + unknown + aliases + case-insensitive +
        bad `visible` type + missing `layer`.

## Gates

- [ ] T6. `npm run lint` — same baseline.
- [ ] T7. `npm test -- --run` — all green.
- [ ] T8. `npm run build` — succeeds.

## Plan↔tasks↔tests verification

- Use case ("toggle a named layer"): T2 implements, T3 wires, T5 verifies.
- Success criterion #1 (actually toggles): Test 1 in T5.
- Success criterion #3 (idempotent): Test 2 in T5.
- Success criterion #4 (structured error): Test 4 in T5.
- README documentation: T4 updates the visible contract for users.
- Lint/test/build gates: T6–T8.
