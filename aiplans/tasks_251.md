# Tasks — Plan 251 (`find_longest_rivers`)

## 1. Implementation

- [ ] Create `./src/ai/tools/find-longest-rivers.ts`
  - [ ] Export `DEFAULT_FIND_LONGEST_RIVERS_N = 10` and `MAX_FIND_LONGEST_RIVERS_N = 500`
  - [ ] Export `FindLongestRiversHit` interface `{ i, name, type, length, discharge, source, mouth }`
  - [ ] Export `FindLongestRiversPayload` interface `{ rivers, count, requested_n }`
  - [ ] Export `FindLongestRiversResult = FindLongestRiversPayload | "not-ready"`
  - [ ] Declare a local `PackLike` with `rivers?: RawRiver[]`
  - [ ] Export pure `findLongestRiversInPack(pack, n): FindLongestRiversResult`
    - [ ] Return `"not-ready"` when `pack` / `pack.rivers` missing
    - [ ] Skip i===0 and removed
    - [ ] Sort copy by length desc (missing → 0)
    - [ ] Slice top n
    - [ ] Map to hit shape with safe null / fallback values
  - [ ] Export `FindLongestRiversRuntime` + `defaultFindLongestRiversRuntime` using `getPack<PackLike>()`
  - [ ] Internal `parseN(raw) → number | string` validator
  - [ ] `createFindLongestRiversTool(runtime?)`
    - [ ] Tool `name: "find_longest_rivers"`
    - [ ] Descriptive description mentioning API key requirement
    - [ ] `input_schema` with optional `n` integer in [1, 500]
    - [ ] execute: parse `n` → runtime.find → map to `okResult` / `errorResult`
  - [ ] Export `findLongestRiversTool = createFindLongestRiversTool()`

## 2. Tests

- [ ] Create `./src/ai/tools/find-longest-rivers.test.ts`
  - [ ] `makePack()` fake with mixed lengths, removed, missing length, index-0 placeholder
  - [ ] Pure: top-N sorted desc
  - [ ] Pure: default `n=10` when omitted at tool level (assert via tool.execute)
  - [ ] Pure: skips removed + index-0
  - [ ] Pure: treats missing length as 0
  - [ ] Pure: `count` matches `rivers.length`
  - [ ] Pure: `not-ready` when `pack === undefined`
  - [ ] Pure: `not-ready` when `pack.rivers === undefined`
  - [ ] Tool: schema name / properties
  - [ ] Tool: rejects `n=0`, negative, >500, non-integer, NaN, string, infinity
  - [ ] Tool: surfaces `not-ready` as structured error
  - [ ] Tool: ok response includes `ok`, `rivers`, `count`, `requested_n`
  - [ ] `DEFAULT_` / `MAX_` constants assertion
  - [ ] `defaultFindLongestRiversRuntime` integration block (mutate `globalThis.pack`, restore)

## 3. Wiring

- [ ] Register in `./src/ai/index.ts`
  - [ ] Import `findLongestRiversTool` near other river imports
  - [ ] Re-export in barrel export block
  - [ ] `registry.register(findLongestRiversTool)` after `findRiversByStateTool`

## 4. Docs

- [ ] Add `find_longest_rivers` row in `README_AI.md` near the `find_rivers_in_area` row
  - [ ] Include API-key note
  - [ ] Example phrases

## 5. Verify

- [ ] `npm run build` succeeds
- [ ] `npm test -- --run` — no new failures, +1 test file
- [ ] `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors)

## 6. Commit

- [ ] Stage: new files, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_251.md`, `aiplans/tasks_251.md`
- [ ] Message: `feat(ai): add find_longest_rivers tool`
- [ ] Body: 1-2 lines summarising purpose
