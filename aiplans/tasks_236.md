# Tasks — Plan 236 (`find_rivers_by_basin`)

## 1. Baselines

- [x] `pwd` + confirm isolated worktree.
- [x] `git fetch` + `git merge master --ff-only`.
- [x] Lint baseline: 7 warnings / 1 info / 0 errors.
- [x] Test baseline: 3933 passing / 248 files.

## 2. Research

- [x] Read `./src/ai/tools/get-river-info.ts` (`findRiverByRef` usage).
- [x] Read `./src/ai/tools/list-rivers.ts` (`RiverSummary` shape,
      basin filter semantics).
- [x] Read `./src/ai/tools/rename-river.ts` (canonical ref resolver).
- [x] Read `./src/ai/tools/find-rivers-in-area.ts` + test (recent
      river filter analog; seam pattern; limit / count semantics).
- [x] Read `./src/ai/tools/find-provinces-by-state.ts` (parent-ref
      filter analog — validates "resolveState + find" runtime split).
- [x] Read `./src/ai/tools/_shared/index.ts` exports.
- [x] Confirm RawRiver.basin exists in `_shared/pack-types.ts`.

## 3. Implementation

- [ ] Create `src/ai/tools/find-rivers-by-basin.ts`:
  - Export `DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT = 10000` and
    `MAX_FIND_RIVERS_BY_BASIN_LIMIT = 100000`.
  - Export `FindRiversByBasinHit` (`{i, name, type, parent, source,
    mouth, length, discharge}`).
  - Export `FindRiversByBasinPayload` = `{basin, rivers, count}`.
  - Export `FindRiversByBasinResult = FindRiversByBasinPayload |
    "not-ready"`.
  - Export `ResolveBasinResult = {i, name} | "not-ready" |
    "not-found"`.
  - Implement `resolveBasinRefInPack(pack, ref)` using
    `findRiverByRef` from `./rename-river`.
  - Implement `findRiversByBasinInPack(pack, basinI, includeSelf,
    limit)` — iterate `pack.rivers`, skip placeholder / removed,
    match `r.basin === basinI`. Also include `r.i === basinI` when
    `includeSelf`. Count always full, rivers truncated to limit.
  - Export `FindRiversByBasinRuntime` with `resolveBasin(ref)` +
    `find(basinI, includeSelf, limit)`.
  - Export `defaultFindRiversByBasinRuntime` backed by `getPack()`.
  - Export `createFindRiversByBasinTool(runtime = default): Tool`
    with full description (mirrors `find_rivers_in_area` style,
    mentions Anthropic API key).
  - Input schema: `basin` (required integer|string), `include_self`
    (optional boolean), `limit` (optional integer 1-MAX).
  - Validate each field; map `not-ready` and `not-found` to
    `errorResult(...)`.
  - Export `findRiversByBasinTool` default instance.

- [ ] Create `src/ai/tools/find-rivers-by-basin.test.ts`:
  - Build a synthetic `FakePack` with one basin root (id 5),
    several tributaries with `basin === 5`, one unrelated river
    with `basin === 2`, a removed river, a placeholder, and a
    river with no basin. Include a river whose name is case-sensitive
    different for name-ref tests.
  - Pure scanner tests:
    - Returns root + tributaries when `includeSelf=true`.
    - Omits root when `includeSelf=false`.
    - Skips removed + placeholder + wrong-basin.
    - Limit truncates but count is full.
    - `not-ready` on missing pack / missing rivers.
  - `resolveBasinRefInPack`:
    - Numeric id hit.
    - Name (case-insensitive) hit.
    - Returns `not-found` for unknown id / removed river.
    - Returns `not-ready` on missing pack.
  - Tool surface tests (with the `as unknown as { ... }` cast for
    the fake runtime where helpful):
    - Rejects missing / invalid `basin`.
    - Rejects bad `include_self` (non-boolean).
    - Rejects out-of-range `limit`.
    - Surfaces `not-ready` + `not-found` as structured errors.
    - Ok response shape (basin echo + rivers + count).
    - Schema exposes expected property keys.
    - Default limit / max constants exported.
  - `defaultFindRiversByBasinRuntime` integration block:
    - `beforeEach` seeds `globalThis.pack`, `afterEach` restores.
    - Verifies resolveBasin + find via default runtime.
    - Verifies `not-ready` path when pack missing.

- [ ] Register the tool in `src/ai/index.ts`:
  - Alphabetical import block: add after `findReligionsByTypeTool`
    import and before `findRiversInAreaTool`.
  - Export block: add a new `export { ... } from
    "./tools/find-rivers-by-basin"` near the existing
    `find-rivers-in-area` export.
  - `registry.register(...)` near the river cluster (after
    `listRiversTool`, before `findNearestRiverTool` /
    `findRiversInAreaTool`).

- [ ] Add README_AI.md row:
  - Place near `find_rivers_in_area` (directly after it).
  - Include Anthropic API key reference + example prompts.

## 4. Verification

- [ ] `npm run build` — succeeds.
- [ ] `npm test` — all pass, +N new tests.
- [ ] `npm run lint 2>&1 | tail -5` — matches baseline (7/1/0).

## 5. Commit

- [ ] Stage: `src/ai/tools/find-rivers-by-basin.ts`,
      `src/ai/tools/find-rivers-by-basin.test.ts`,
      `src/ai/index.ts`, `README_AI.md`,
      `aiplans/plan_236.md`, `aiplans/tasks_236.md`, `CLAUDE.md`.
- [ ] Commit `feat(ai): add find_rivers_by_basin tool` with body.
