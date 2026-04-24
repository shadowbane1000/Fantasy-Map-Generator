# Tasks — plan 252 (`find_highest_peaks`)

- [ ] Read `find-largest-burgs.ts` + test, `find-longest-rivers.ts` + test, `find-cells-by-height-range.ts` + test, `_shared/index.ts` to lock in the pattern.
- [ ] Record lint + test baseline: 7 warnings / 1 info / 0 errors, 4431 tests.
- [ ] Write `src/ai/tools/find-highest-peaks.ts`:
  - `PackLike` with `cells?: { h?: ArrayLike<number>; p?: ArrayLike<[number, number] | ArrayLike<number>> }`.
  - `DEFAULT_FIND_HIGHEST_PEAKS_N = 10`, `MAX_FIND_HIGHEST_PEAKS_N = 500`, `LAND_HEIGHT_MIN = 20`.
  - Pure scanner `findHighestPeaksInPack(pack, n)`.
  - Runtime seam + `defaultFindHighestPeaksRuntime` using `getPack`.
  - Tool factory `createFindHighestPeaksTool(runtime)` + module-level `findHighestPeaksTool`.
  - Long, precise description string, schema with `n` optional integer in `[1, 500]`, default `10`.
- [ ] Write `src/ai/tools/find-highest-peaks.test.ts`:
  - Pure scanner tests: top-n sort desc, land-only filter (skips h < 20), tie-break stability, missing coords fall back to 0, empty result, `not-ready` on missing pack / cells / h / p.
  - Tool surface tests: default n=10, n=3 returns ordered, invalid n rejected, schema, exported tool, constants.
  - `defaultFindHighestPeaksRuntime` integration block (swap `globalThis.pack`).
- [ ] Register in `src/ai/index.ts`: import, export barrel, `registry.register(findHighestPeaksTool)` near `findCellsByHeightRangeTool`.
- [ ] Add a row in `README_AI.md` near `find_cells_by_height_range` with API-key note + example prompts.
- [ ] `npm run build` clean, `npm test` full suite passes with +N new tests, `npm run lint` matches baseline 7w/1i/0e.
- [ ] Commit: `feat(ai): add find_highest_peaks tool` with short body.
