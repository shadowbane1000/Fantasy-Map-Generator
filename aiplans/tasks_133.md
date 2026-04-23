# Tasks — Plan 133 (`regenerate_river_names`)

1. **Extend `RawRiver`** in `src/ai/tools/_shared/pack-types.ts` — add
   optional `lock?: boolean`. This keeps the pack-types story
   consistent with states/provinces/burgs even though rivers don't
   officially support locking today.

2. **Write** `src/ai/tools/regenerate-river-names.ts`:
   - Export `RIVER_NAME_MODES`, `RiverNameMode`, `resolveRiverNameMode`.
   - Export `RegenerateRiverNamesRiverRef` `{ i, name, mouth, lock?, removed? }`.
   - Export `RegenerateRiverNamesRuntime` with `list / generate / apply / redraw`.
   - Export `defaultRegenerateRiverNamesRuntime`:
     - `list` reads `pack.rivers` via `getPackCollection<RawRiver>("rivers")`.
     - `generate("culture", mouth)` uses
       `Names.getCulture(pack.cells.culture[mouth])`.
     - `generate("random", _)` uses
       `Names.getBase(Math.floor(Math.random() * nameBases.length))`.
     - `apply(i, name)` finds the river with `r.i === i` and writes
       `r.name`.
     - `redraw` calls `drawRivers` if present.
   - Export `createRegenerateRiverNamesTool` + `regenerateRiverNamesTool`.
   - Tool description cites the editor buttons + `Rivers.getName` ->
     `Names.getCulture(pack.cells.culture[mouth])`. Mentions no DOM
     labels to refresh.

3. **Write** `src/ai/tools/regenerate-river-names.test.ts` — 8 unit
   tests (mirrors the state tool) + 4 integration tests using
   `defaultRegenerateRiverNamesRuntime` via
   `regenerateRiverNamesTool.execute()`.

4. **Register** in `src/ai/index.ts`:
   - Import `regenerateRiverNamesTool`.
   - Export `{ createRegenerateRiverNamesTool, regenerateRiverNamesTool,
     resolveRiverNameMode, RIVER_NAME_MODES }`.
   - `registry.register(regenerateRiverNamesTool);` near the other
     `regenerateAll*` tools.

5. **Add README_AI.md row** near `rename_river` / `remove_river` and
   the other bulk-regenerate tools. Include API key setup via
   `setAiApiKey(...)` (already covered in the header — just mention the
   bulk behavior).

6. **Verify**:
   - `cd /workspace && npm run build` — must succeed.
   - `cd /workspace && npm test` — must pass 1664 + new tests.
   - `cd /workspace && npx biome check src/ 2>&1 | tail -5` — must
     match baseline (7 warnings / 1 info / 0 errors).

7. **Commit** with
   `feat(ai): add regenerate_river_names tool`
   plus a 1-2 line body. Stage only the specific files touched.
