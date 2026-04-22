# Tasks 5 — Execution checklist for Plan 5

## Setup

- [ ] T1. Confirm baseline (7 warnings / 1 info / 0 errors; 100 tests).

## Implementation

- [ ] T2. Create `src/ai/tools/regenerate-map.ts`
      - `RegenerateRuntime` with `regenerate()` +
        `waitForRegeneration()`.
      - `defaultRegenerateRuntime` that:
        - Calls `(globalThis as any).regenerateMap(options)`.
        - Registers a one-shot `map:generated` listener on `window` with
          an `AbortController`-based timeout.
      - `createRegenerateMapTool(runtime?)` + `regenerateMapTool`.
      - Coerce `seed` to string; reject non-string/non-number values.

- [ ] T3. Update `src/ai/index.ts`: register + export.

- [ ] T4. Update `README_AI.md`: add tool row with examples.

## Testing

- [ ] T5. Create `src/ai/tools/regenerate-map.test.ts`
      - Scripted runtimes for: success path, timeout, pre-load error,
        seed coercion, invalid seed type.

## Gates

- [ ] T6. `npm run lint` — baseline unchanged.
- [ ] T7. `npm test -- --run` — all pass.
- [ ] T8. `npm run build` — succeeds.

## Plan↔tasks↔tests verification

- All five success criteria map 1:1 to test cases.
- No new infra or DOM assumptions beyond the injection seam.
