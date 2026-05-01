# Tasks — Plan 312 (`set_iceberg_size`)

## Pre-implementation
- [x] Capture lint baseline: `npm run lint 2>&1 | tail -40`
- [x] Read `src/modules/ice.ts` (`changeIcebergSize` lives ~lines 150-172)
- [x] Read `public/modules/ui/ice-editor.js` (`changeSize` ~line 44)
- [x] Read `src/index.html` line 3086 to confirm slider range `[0.05, 2]`
- [x] Read closest analogues: `add-iceberg.ts` (Ice runtime seam pattern),
      `remove-ice.ts` (find-by-id pattern with type checking)
- [x] Read shared helpers in `src/ai/tools/_shared/`
- [x] Confirm `redrawIceberg` is registered on `window` in
      `src/renderers/draw-ice.ts` line 101

## Plan & review
- [x] Write `aiplans/plan_312.md`
- [x] Write `aiplans/tasks_312.md`
- [x] Self-review pass: re-read both files, fix anything wrong, append
      "Self-review" notes to the plan

## Implementation
- [x] Create `src/ai/tools/set-iceberg-size.ts` with:
  - `SetIcebergSizeIceRef` interface
  - `SetIcebergSizeRuntime` interface (`findIce`, `changeIcebergSize`,
    `redrawIceberg`)
  - `defaultSetIcebergSizeRuntime`
  - `createSetIcebergSizeTool(runtime?)`
  - `setIcebergSizeTool` (default-runtime instance)
  - `id` validation: number / finite / integer / non-negative
  - `size` validation: finite number, in `[0.05, 2]` inclusive
  - find entry via runtime; if missing → `errorResult` "No ice element found"
  - if `entry.type === "glacier"` → `errorResult` "Glaciers cannot be resized"
  - capture `old_size`
  - call `runtime.changeIcebergSize(id, size)` in try/catch
  - call `runtime.redrawIceberg(id)` in try/catch
  - return `okResult({ id, old_size, new_size })`
- [x] Wire into `src/ai/index.ts`:
  - import (alphabetically near other `set-*`)
  - re-export block
  - `registry.register(setIcebergSizeTool)` call

## Tests
- [x] Create `src/ai/tools/set-iceberg-size.test.ts` covering:
  - happy path (id=7, size=1 → 0.5; entry mutated; result reports old/new;
    redraw called once)
  - boundary 0.05 accepted
  - boundary 2 accepted
  - 0.04, 2.01, 0, -1, 100 rejected with allowed range named
  - NaN / Infinity / non-number / null size rejected
  - glacier id rejected with "Glaciers cannot be resized"; mutators not
    called
  - unknown id → error
  - non-integer / negative id → error
  - id missing / null → error
  - default runtime, no `pack.ice` → error
  - `changeIcebergSize` throws → error forwarded; `redrawIceberg` not called
  - `redrawIceberg` throws → error forwarded
  - default runtime happy path: stubs `pack`, `Ice.changeIcebergSize`,
    `redrawIceberg`; entry.size updated; redraw called
  - default runtime: missing `Ice` → error
  - default runtime: missing `Ice.changeIcebergSize` → error
  - default runtime: missing `redrawIceberg` → error
  - default runtime: missing `pack.ice` → error
  - tool name + registry round-trip

## Verification
- [x] `npm test` passes (focus on the new file)
- [x] `npm run lint` does NOT regress (still 7 warnings, 1 info, 0 errors)
- [x] `npx tsc --noEmit` clean
- [x] Verify only intended files are dirty

## Commit
- [x] Stage exactly: `src/ai/tools/set-iceberg-size.ts`,
      `src/ai/tools/set-iceberg-size.test.ts`, `src/ai/index.ts`,
      `aiplans/plan_312.md`, `aiplans/tasks_312.md`
- [x] Commit with message `feat(ai): add set_iceberg_size tool`
- [x] Do NOT push
- [x] Do NOT touch `.claude/`, `current-ralph-loop.prompt`, or any unrelated
      pre-existing dirty file (e.g. `src/ai/chat-controller.ts`)
