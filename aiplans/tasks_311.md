# Tasks — Plan 311 (`remove_ice`)

## Pre-implementation
- [x] Capture lint baseline: `npm run lint 2>&1 | tail -40`
- [x] Read `src/modules/ice.ts` (`removeIce` lives ~lines 114-125)
- [x] Read `src/renderers/draw-ice.ts` (`redrawIceberg`, `redrawGlacier`)
- [x] Read closest analogues: `remove-burg.ts`, `remove-state.ts`,
      `remove-route.ts`, `remove-marker.ts`
- [x] Read shared helpers in `src/ai/tools/_shared/`
- [x] Confirm ice ids start at 0 (so cannot reuse `parseEntityRef`, which
      enforces `> 0`)

## Plan & review
- [x] Write `aiplans/plan_311.md`
- [x] Write `aiplans/tasks_311.md`
- [x] Self-review pass: re-read both files, fix anything wrong, append a
      "Review notes" section to the plan

## Implementation
- [x] Create `src/ai/tools/remove-ice.ts` with:
  - `RemoveIceRef` interface
  - `RemoveIceRuntime` interface (`findIce`, `removeIce`, `getIceArray`)
  - `defaultRemoveIceRuntime`
  - `createRemoveIceTool(runtime?)`
  - `removeIceTool` (default-runtime instance)
  - input validation: number / finite / integer / non-negative
  - find entry via runtime; if missing → `errorResult` "ice element not found"
  - call `runtime.removeIce(id)` in try/catch
  - post-call check: entry still present → `errorResult` "removal failed"
  - return `okResult({ id, type, cell_id })`
- [x] Wire into `src/ai/index.ts`:
  - import (alphabetically near other `remove-*`)
  - re-export block
  - `registry.register(removeIceTool)` call

## Tests
- [x] Create `src/ai/tools/remove-ice.test.ts` covering:
  - happy path iceberg → result + remove called + entry gone
  - happy path glacier
  - id not present → error
  - id is float → error
  - id is NaN → error
  - id is Infinity → error
  - id is non-number → error
  - id missing → error
  - id is negative integer → error
  - id is null → error
  - default runtime, no `pack` → error
  - default runtime, no `pack.ice` → error
  - default runtime, no `Ice` global → error
  - `Ice.removeIce` throws → error forwarded; pack.ice unchanged
  - `Ice.removeIce` no-ops → "removal failed"
  - default runtime happy path with stubs → entry removed
  - tool name + registry round-trip

## Verification
- [x] `npm test` passes (focus on the new file)
- [x] `npm run lint` does NOT regress (still 7 warnings, 1 info, 0 errors)
- [x] `npx tsc --noEmit` clean
- [x] Verify only intended files are dirty

## Commit
- [x] Stage exactly: `src/ai/tools/remove-ice.ts`,
      `src/ai/tools/remove-ice.test.ts`, `src/ai/index.ts`,
      `aiplans/plan_311.md`, `aiplans/tasks_311.md`
- [x] Commit with message `feat(ai): add remove_ice tool`
- [x] Do NOT push
- [x] Do NOT touch `.claude/`, `current-ralph-loop.prompt`, or any unrelated
      pre-existing dirty file
