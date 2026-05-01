# Tasks — Plan 313 (`list_ice`)

## Pre-implementation
- [x] Capture lint baseline: `npm run lint 2>&1 | tail -40`
- [x] Read `src/modules/ice.ts` (entry shapes for glacier / iceberg)
- [x] Read closest analogues: `remove-ice.ts` (pack.ice reading pattern,
      cellId null-handling), `list-routes.ts`, `list-rivers.ts`,
      `list-burgs.ts` (filtering patterns), `list-route-groups.ts`
      (non-paginated list-tool pattern)
- [x] Read shared helpers in `src/ai/tools/_shared/`
- [x] Confirm registration site in `src/ai/index.ts` (between
      `list-heightmap-templates` and `list-label-groups`)

## Plan & review
- [x] Write `aiplans/plan_313.md`
- [x] Write `aiplans/tasks_313.md`
- [ ] Self-review pass: re-read both files, fix anything wrong, append a
      "Review notes" section to the plan (already included in plan)

## Implementation
- [ ] Create `src/ai/tools/list-ice.ts` with:
  - `ListIceEntry` interface (raw shape we read from `pack.ice`)
  - `ListIceRuntime` interface (`getIceArray`)
  - `defaultListIceRuntime` (throws with specific messages for missing pack
    vs missing pack.ice)
  - `createListIceTool(runtime?)`
  - `listIceTool` (default-runtime instance)
  - input validation: `type` undefined/null → no filter; `"glacier"` /
    `"iceberg"` → filter; anything else → error
  - read pack.ice via runtime; compute total from pre-filter length
  - filter by type if provided
  - map each entry: `{ id, type, cell_id, size, has_offset }` (null/false
    fallbacks; defensive against malformed `offset` / `cellId` / `size`)
  - return `okResult({ count, total, items })`
- [ ] Wire into `src/ai/index.ts`:
  - import (alphabetical between `list-heightmap-templates` and
    `list-label-groups`)
  - re-export block in same alphabetical position
  - `registry.register(listIceTool)` call

## Tests
- [ ] Create `src/ai/tools/list-ice.test.ts` covering:
  - happy path no filter (1 glacier + 2 icebergs in order)
  - filter type=glacier (count=1, total=3)
  - filter type=iceberg (count=2, total=3)
  - empty pack.ice (count=0, total=0, items=[])
  - glacier without cellId/size → cell_id=null, size=null
  - iceberg with offset present → has_offset=true
  - iceberg without offset → has_offset=false
  - iceberg with malformed offset (string, number, plain object) →
    has_offset=false (no crash)
  - invalid type filter ("snow", uppercase "Glacier", number, object,
    empty string) → error
  - default runtime: pack missing → error mentions pack
  - default runtime: pack.ice not an array → error mentions pack.ice
  - default runtime happy path with stubbed globalThis.pack
  - tool name + registry round-trip

## Verification
- [ ] `npm test` passes (focus on the new file)
- [ ] `npm run lint` does NOT regress (still 7 warnings, 1 info, 0 errors)
- [ ] `npx tsc --noEmit` clean
- [ ] Verify only intended files are dirty

## Commit
- [ ] Stage exactly: `src/ai/tools/list-ice.ts`,
      `src/ai/tools/list-ice.test.ts`, `src/ai/index.ts`,
      `aiplans/plan_313.md`, `aiplans/tasks_313.md`
- [ ] Commit with message `feat(ai): add list_ice tool`
- [ ] Do NOT push
- [ ] Do NOT touch `.claude/`, `current-ralph-loop.prompt`, or any
      unrelated pre-existing dirty file
