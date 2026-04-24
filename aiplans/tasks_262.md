# Tasks — plan 262 (`get_terrain_stats`)

1. Read reference tools:
   - `src/ai/tools/find-cells-by-height-range.ts` (+ test) — height semantics.
   - `src/ai/tools/find-coast-cells.ts` (+ test) — coast semantics.
   - `src/ai/tools/get-population-stats.ts` (+ test) — aggregate analog.
   - `src/ai/tools/_shared/index.ts` — helpers available.

2. Write `src/ai/tools/get-terrain-stats.ts`:
   - `PackLike { cells?: { h?: ArrayLike<number>; t?: ArrayLike<number> } }`.
   - `BandName` union + `BAND_RANGES` table.
   - `TerrainStats` interface.
   - `readTerrainStatsFromPack(pack): TerrainStats | "not-ready"`.
     - Return `"not-ready"` when pack / cells / h missing or length-less.
     - Single pass over `cells.h` for counts, bands, min/max/mean.
     - Second pass over `cells.t` if present for coast count; else 0.
   - `TerrainStatsRuntime` + `defaultTerrainStatsRuntime` using `getPack`.
   - `createGetTerrainStatsTool(runtime)` returning a `Tool`.
   - `getTerrainStatsTool` default export instance.

3. Write `src/ai/tools/get-terrain-stats.test.ts`:
   - `as unknown as { ... }` casts on fake packs.
   - Pure / seam block covering:
     - not-ready paths (no pack, no cells, no h).
     - Correct aggregate counts for a mixed fixture.
     - Band-boundary edges (`h = 4,5,19,20,25,26,39,40,59,60,79,80,100`).
     - Coast count when `t` present.
     - Coast count = 0 when `t` missing (does NOT fall back to not-ready).
     - `height_min` / `max` / `mean`.
     - Empty `cells.h` → all zero stats, still `ok`.
   - Surface block covering:
     - `execute({})` ok shape.
     - Not-ready → structured error.
     - Ignores unrelated input keys.
     - Tool name / schema.
   - defaultTerrainStatsRuntime integration block using globalThis.pack.

4. Register in `src/ai/index.ts`:
   - Import `getTerrainStatsTool`.
   - Export block (`createGetTerrainStatsTool`, `defaultTerrainStatsRuntime`,
     `getTerrainStatsTool`, `readTerrainStatsFromPack`, `TerrainStats`,
     `TerrainStatsRuntime`).
   - `registry.register(getTerrainStatsTool);` near population stats.

5. Update `README_AI.md`:
   - Add a `get_terrain_stats` row near `get_population_stats` with the
     usual API-key + read-only note and 3-4 usage examples.

6. Verify:
   - `npm run build` ok.
   - `npm test` all pass.
   - `npm run lint` still matches baseline (7 warnings / 1 info).

7. Commit with `feat(ai): add get_terrain_stats tool` + 1-2 line body.
