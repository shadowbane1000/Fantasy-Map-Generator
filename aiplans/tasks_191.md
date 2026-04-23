# Tasks for plan 191 — `get_zone_info`

1. [ ] Read shared helpers: `findZoneByRef` (in `set-zone-visibility.ts`),
       `RawZone`, `parseEntityRef`, `getPack`, `errorResult`, `okResult`.
2. [ ] Confirm baseline: `npm run lint` → 7 warnings / 1 info / 0 errors;
       `npm test` → 2205 passing.
3. [ ] Write `src/ai/tools/get-zone-info.ts`:
   - `ZoneInfo`, `ZoneInfoPackLike`, `ReadZoneResult` types.
   - `readZoneInfoFromPack(pack, ref, limit)` pure function.
   - `ZoneInfoRuntime` + `defaultZoneInfoRuntime`.
   - `createGetZoneInfoTool(runtime)` + exported `getZoneInfoTool`.
   - Own ref validator that allows id 0 (zones are non-contiguous and start
     at 0) while still rejecting non-integers / negative / empty strings.
   - `limit` validation: integer in `[0, 10000]` (default 10000).
4. [ ] Write `src/ai/tools/get-zone-info.test.ts`:
   - Pure / seam block — pack fixture with multiple zones (id 0 included,
     one hidden, one with many cells, one removed).
   - `defaultZoneInfoRuntime` integration block (`as unknown as` cast).
5. [ ] Register in `src/ai/index.ts`:
   - Import `getZoneInfoTool` alphabetically (after `getMapInfoTool`).
   - Re-export `{ createGetZoneInfoTool, getZoneInfoTool }` in the exports
     block.
   - `registry.register(getZoneInfoTool)` in `buildDefaultRegistry()` near
     the other `get_*` tools (after `getMapInfoTool`).
6. [ ] Add README_AI.md row next to `get_map_info`. Include
       `Requires an Anthropic API key (see "Getting an API key" below).`
       plus usage examples.
7. [ ] Verify:
   - `npm run build` succeeds.
   - `npm test` all pass; expect +N tests.
   - `npm run lint` stays at 7 warnings / 1 info / 0 errors.
8. [ ] Commit with `feat(ai): add get_zone_info tool`, staging only the
       touched files.
