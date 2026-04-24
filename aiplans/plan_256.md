# Plan 256 — `find_largest_provinces` AI tool

## Goal
Add a new read-only AI tool that returns the top N provinces ranked by `area`, `cells`, or derived `population`. Parallel to `find_largest_states` / `find_largest_cultures` / `find_largest_religions`, but provinces do not have pre-aggregated `area`/`cells`/`rural`/`urban` fields on the raw entry, so all three metrics must be derived from `pack.cells` and `pack.burgs`.

## Design

### Shape
- `createFindLargestProvincesTool(runtime?)` — returns `Tool`.
- `findLargestProvincesInPack(pack, n, by)` — pure ranker returning `{ provinces }` or `"not-ready"`.
- `defaultFindLargestProvincesRuntime` — resolves `getPack<PackLike>()` from globals.
- Runtime-seam pattern mirrors `find-largest-states.ts`.

### Inputs
- `n` (integer, optional, default 10, [1, 500]).
- `by` (string, optional, case-insensitive, default `"area"`): one of `"area"` | `"cells"` | `"population"`.

### Output hit
`{ i, name, fullName, formName, color, area, cells_count, population }`.

- `name`/`fullName`/`formName`/`color` from `RawProvince`.
- `area`: rounded sum of `pack.cells.area[c]` for cells where `pack.cells.province[c] === i`.
- `cells_count`: count of cells where `pack.cells.province[c] === i`.
- `population`: **raw** total — `sum(pack.cells.pop[c] for matching c) + sum(burg.population for non-removed burgs whose cell is in the province)`. Matches the spirit of `find_largest_states` `population` (raw units, not rate-scaled). Note: this differs from `get_province_info.population_total` which scales by `populationRate × urbanization`; rationale: other `find_largest_*` tools return raw rural+urban, so we keep parity.

### Aggregation strategy
To avoid an O(provinces × cells) scan, walk `pack.cells.province` once to accumulate `{cellsCount, area, ruralRaw}` per province id into a `Map<number, Agg>`. Then walk `pack.burgs` once to accumulate `urbanRaw` per province id (using `pack.cells.province[burg.cell]`). Finally iterate `pack.provinces` and produce hits, skipping i=0 / removed.

### Tool registration
- Register after `findLargestReligionsTool` in `./src/ai/index.ts`.
- Add imports + exports following existing patterns (no duplicate-export of shared constants).
- README_AI.md row inserted after the `find_largest_religions` entry (or near `find_largest_states`) with appropriate description + example prompts, plus API-key note.

### Test coverage
Mirror `find-largest-states.test.ts` structure:
- Pure ranker tests: ranks by area / cells / population; slices to n; handles n > population; skips i=0 / removed; populates fields; handles missing numeric fields; `"not-ready"` when pack / `pack.provinces` is missing; empty pack yields empty result.
- Tool surface: defaults n and by; case-insensitive by; invalid by / n; empty pack; not-ready; exported constants; schema shape; `requested_n` / `by` echo.
- `defaultFindLargestProvincesRuntime` integration: sets `globalThis.pack`; reads via default runtime; handles missing pack.

### Risks
- Aggregation order matters for urbanRaw: `burg.cell` may be out of bounds. Guard with `cell < cellProvince.length`.
- Burg removed flag: exclude `removed` burgs and `i === 0` placeholder from urban count (matches `get-province-info`).
- Province 0 placeholder must be excluded.

## Files
- Add: `src/ai/tools/find-largest-provinces.ts`
- Add: `src/ai/tools/find-largest-provinces.test.ts`
- Edit: `src/ai/index.ts` — import, export block, `registry.register(...)`.
- Edit: `README_AI.md` — new row.
