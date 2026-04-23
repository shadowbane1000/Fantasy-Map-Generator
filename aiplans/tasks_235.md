# Tasks — Plan 235: `find_burgs_by_population_range`

## 1. Scaffolding
- [x] Merge master into worktree branch (ff-only).
- [x] Capture baseline: `npm run lint` → 7 warnings / 1 info / 0 errors. `npm test` → 246 files / 3882 tests.

## 2. Implement `src/ai/tools/find-burgs-by-population-range.ts`
- Exports: `DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT` (10000), `MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT` (100000), `MIN_POPULATION` (0).
- Types: `FindBurgsByPopulationRangeHit`, `FindBurgsByPopulationRangePayload`, `FindBurgsByPopulationRangeResult`, `FindBurgsByPopulationRangeRuntime`, `PackLike`.
- Pure scanner `findBurgsByPopulationRangeInPack(pack, min, max, limit)` — iterate `pack.burgs`, skip i=0, skip `removed`, skip burgs with non-number `population`, match `pop >= min && pop <= max`; push `{ i, name, x, y, population, capital }`; return `{ burgs, count }` or `"not-ready"`.
- `defaultFindBurgsByPopulationRangeRuntime.find()` wraps the scanner over `getPack<PackLike>()`.
- `parsePopulation(value, label)` — rejects non-numbers, non-finite, negative; returns either number or error string.
- `parseLimit(value)` — default 10000, integer in [1, 100000].
- `createFindBurgsByPopulationRangeTool(runtime)` factory returning `Tool`.
- Execute path:
  1. Read `rawInput` as `{ min?, max?, limit? }`.
  2. If both `min` and `max` are `undefined`/`null` → error `"At least one of min or max is required."`
  3. Parse `min` (default 0 when missing), parse `max` (default `Number.POSITIVE_INFINITY` when missing).
  4. `min > max` → error.
  5. Parse `limit`.
  6. Call `runtime.find` → `"not-ready"` → structured error.
  7. `okResult({ min, max, burgs, count })`.

## 3. Implement `src/ai/tools/find-burgs-by-population-range.test.ts`
Sections:
### Pure scanner
- mid-range band → subset of burg ids.
- inclusive boundaries (`min = first.pop`, `max = last.pop`).
- single-value range (e.g. `{min: 0, max: 0}` → every empty-pop burg).
- wide range collects every active burg.
- empty result when no burg matches.
- truncates `burgs` at limit, preserves `count`.
- skips i=0 placeholder and `removed: true`.
- burgs with non-number `population` are skipped.
- `not-ready` when `pack` / `pack.burgs` missing.

### Tool surface
- ok=true with echoed min/max.
- accepts fractional min/max.
- default `min = 0` when omitted (only `max` supplied).
- default `max = Infinity` when omitted (only `min` supplied) — note: must NOT surface the literal Infinity to the user unless it's fine; verify `count` shape.
- limit truncation + full count.
- rejects both min/max missing.
- rejects invalid min.
- rejects invalid max (including explicit `Number.POSITIVE_INFINITY`).
- rejects min > max.
- rejects invalid limit.
- surfaces not-ready as structured error.
- applies default limit when omitted.
- `findBurgsByPopulationRangeTool` export has expected schema.
- `DEFAULT` / `MAX` / `MIN_POPULATION` constants match.

### `defaultFindBurgsByPopulationRangeRuntime` integration
- Seed `globalThis.pack` with fake in `beforeEach`, restore in `afterEach`.
- reads real pack (happy path).
- tool uses default runtime end-to-end.
- `not-ready` when `pack` missing → tool surfaces error.

All casts via `as unknown as { ... }`.

## 4. Register in `src/ai/index.ts`
- Alphabetical import near `findBurgsByStateTool`.
- Re-export block next to the other find-burgs exports.
- `registry.register(findBurgsByPopulationRangeTool);` in `buildDefaultRegistry`.

## 5. README_AI.md
- Insert a row after the `find_burgs_by_type` row with full description + 3 example prompts + API key boilerplate.

## 6. Verify
- `npm run build` ✔
- `npm test` ✔ (test count rises)
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).

## 7. Commit
- Stage specific files:
  - `src/ai/tools/find-burgs-by-population-range.ts`
  - `src/ai/tools/find-burgs-by-population-range.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_235.md`
  - `aiplans/tasks_235.md`
- Message: `feat(ai): add find_burgs_by_population_range tool` + short body.
