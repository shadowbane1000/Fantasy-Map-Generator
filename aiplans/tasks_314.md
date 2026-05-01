# Tasks — Plan 314 (`randomize_iceberg_shape`)

## Pre-implementation
- [x] Capture lint baseline: `npm run lint 2>&1 | tail -40`
- [x] Read `src/modules/ice.ts` (`randomizeIcebergShape` lives ~lines 127-148)
- [x] Read `public/modules/ui/ice-editor.js` (`randomizeShape` ~line 38)
- [x] Read closest analogue: `src/ai/tools/set-iceberg-size.ts` (plan 312 — same
      structure: id-based lookup, type-check iceberg-only, call Ice method,
      redraw)
- [x] Read shared helpers in `src/ai/tools/_shared/`
- [x] Confirm `redrawIceberg` is a window global

## Plan & review
- [x] Write `aiplans/plan_314.md`
- [x] Write `aiplans/tasks_314.md`
- [x] Self-review pass: re-read both files, verify and edit, append
      "Self-review" notes to the plan

## Implementation
- [x] Create `src/ai/tools/randomize-iceberg-shape.ts` with:
  - `RandomizeIcebergShapeIceRef` interface (`i`, `type`, `point_count`)
  - `RandomizeIcebergShapeRuntime` interface (`findIce`,
    `randomizeIcebergShape`, `redrawIceberg`)
  - `defaultRandomizeIcebergShapeRuntime`
  - `createRandomizeIcebergShapeTool(runtime?)`
  - `randomizeIcebergShapeTool` (default-runtime instance)
  - `id` validation: number / finite / integer / non-negative
  - find entry via runtime; if missing → `errorResult` "No ice element found"
  - if `entry.type === "glacier"` → `errorResult` "Glaciers cannot be
    randomized"
  - call `runtime.randomizeIcebergShape(id)` in try/catch
  - call `runtime.redrawIceberg(id)` in try/catch
  - re-look-up entry via `runtime.findIce(id)` to capture new point_count
    (fallback to 0 if somehow null)
  - return `okResult({ id, point_count })`
- [x] Wire into `src/ai/index.ts`:
  - import (alphabetically near other tool imports)
  - re-export block
  - `registry.register(randomizeIcebergShapeTool)` call near other ice
    tool registrations

## Tests
- [x] Create `src/ai/tools/randomize-iceberg-shape.test.ts` covering:
  - happy path (id=7, 6 points → 5 points; entry.points mutated; result
    reports new count; redraw called once)
  - glacier id rejected with "Glaciers cannot be randomized"; mutators
    not called
  - unknown id → error
  - non-integer / negative / non-finite id → error
  - id missing / null / undefined → error
  - default runtime, no `pack.ice` → error
  - `randomizeIcebergShape` throws → error forwarded; `redrawIceberg`
    not called
  - `redrawIceberg` throws → error forwarded
  - default runtime happy path: stubs `pack`, `Ice.randomizeIcebergShape`,
    `redrawIceberg`; entry.points mutated; redraw called
  - default runtime: missing `Ice` → error
  - default runtime: missing `Ice.randomizeIcebergShape` → error
  - default runtime: missing `redrawIceberg` → error
  - default runtime: missing `pack.ice` → error
  - default runtime: missing `pack` → error
  - tool name + registry round-trip

## Verification
- [x] `npm test` passes (focus on the new file)
- [x] `npm run lint` does NOT regress (still 7 warnings, 1 info, 0 errors)
- [x] `npx tsc --noEmit` clean
- [x] Verify only intended files are dirty

## Commit
- [x] Stage exactly: `src/ai/tools/randomize-iceberg-shape.ts`,
      `src/ai/tools/randomize-iceberg-shape.test.ts`, `src/ai/index.ts`,
      `aiplans/plan_314.md`, `aiplans/tasks_314.md`
- [x] Commit with message `feat(ai): add randomize_iceberg_shape tool`
- [x] Do NOT push
- [x] Do NOT touch `.claude/`, `current-ralph-loop.prompt`, or any
      unrelated pre-existing dirty file (e.g. `src/ai/chat-controller.ts`)
