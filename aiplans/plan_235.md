# Plan 235: `find_burgs_by_population_range` AI tool

## Goal
Add a read-only AI tool that returns every active burg whose raw `burg.population` falls inside an inclusive `[min, max]` range. This is the burg-centric parallel of `find_cells_by_population_range` (which iterates `pack.cells.pop`) and a population-filtered companion to `find_burgs_by_state` / `find_burgs_by_type` / `find_burgs_by_culture`.

## Motivation
Today the AI can filter burgs by state / culture / religion / type / area, but there is no way to slice burgs by size. A direct population-range scan over `pack.burgs` unlocks bulk workflows like:
- audit the top N largest cities (pair with a high `min`),
- find empty / uninhabited burgs (`{min: 0, max: 0}`),
- feed burg ids into `rename_burg` / `set_burg_population` / `move_burg` for range-specific edits,
- seed candidates for `get_burg_info` mass-lookups.

## Reference tools studied
- `src/ai/tools/find-cells-by-population-range.ts` + test — direct structural analog (same min/max/limit shape, same pure-collector + runtime-seam pattern, same inclusive-range semantics).
- `src/ai/tools/find-burgs-by-state.ts` + test — burg iteration convention: skip `b.i === 0`, skip `b.removed`, emit `{ i, name, x, y, population, capital }`.
- `src/ai/tools/list-burgs.ts` — confirms burg population is `burg.population` (raw engine value) and `capital` derives from `burg.capital === 1`.
- `src/ai/tools/_shared/index.ts` — `errorResult`, `okResult`, `getPack`, `RawBurg` types.

## Shape

### Input
```
{
  min?: number (finite, >= 0, default 0),
  max?: number (finite, >= 0, default Infinity — but caller must supply finite value),
  limit?: integer in [1, 100000] (default 10000)
}
```
At least one of `min` / `max` is required (matches the use-case spec). If only `min` is supplied, `max` defaults to `Number.POSITIVE_INFINITY`. If only `max` is supplied, `min` defaults to `0`. Both inclusive. `min <= max`.

### Output
```
{
  ok: true,
  min: number,
  max: number,
  burgs: [{ i, name, x, y, population, capital }],
  count: number
}
```
`burgs` length is capped by `limit`; `count` is the full unlimited total.

### Errors
- un-generated map (`pack.burgs` missing) → `"Map is not ready yet..."`
- both `min` and `max` missing → `"At least one of min or max is required."`
- non-finite / negative `min` (when supplied) → `"min must be a finite number >= 0."` — note: only finite values are rejected; `Infinity` rejected here.
- negative / non-finite `max` (when supplied) → `"max must be a finite number >= 0."` — `Infinity` IS allowed as the implicit default but rejected as an explicit input for parity with `find_cells_by_population_range`.
- `min > max` → `"min must be <= max."`
- invalid `limit` → `"limit must be an integer in [1, 100000]."`

## Files
- NEW `src/ai/tools/find-burgs-by-population-range.ts` — runtime-seam implementation.
- NEW `src/ai/tools/find-burgs-by-population-range.test.ts` — pure-scanner tests + tool-surface tests + `defaultFindBurgsByPopulationRangeRuntime` integration block.
- EDIT `src/ai/index.ts` — import, re-export, register.
- EDIT `README_AI.md` — add row near `find_burgs_by_state`.

## Registration
- `import { findBurgsByPopulationRangeTool } from "./tools/find-burgs-by-population-range";`
- Add to the `export { ... } from "./tools/find-burgs-by-population-range";` block (factory, constants, types, default runtime, pure-scanner fn, tool instance).
- `registry.register(findBurgsByPopulationRangeTool);` alongside `findBurgsByStateTool` / `findBurgsByTypeTool`.

## README_AI.md row
Insert after the `find_burgs_by_type` row (or right next to the burg cluster). Include the full description, example prompts, and the boilerplate Anthropic API key reference.

## Validation gates
- Baseline lint: 7 warnings / 1 info / 0 errors.
- `npm run build` succeeds.
- `npm test` — existing 3882 tests still pass, plus new tests added.
- Post-lint matches baseline.
