# Tasks — Plan 193 (`get_feature_info`)

1. Baseline: capture `npm run lint` result (7 warnings / 1 info / 0 errors)
   and `npm test` count (2789 passing).

2. Write `src/ai/tools/get-feature-info.ts`:
   - `FeatureInfo` interface with `i`, `type`, `group`, `name`,
     `land`, `border`, `cells`, `area`, `firstCell`,
     `vertices_count`.
   - `ReadFeatureInfoResult = FeatureInfo | "not-ready" | "not-found"`.
   - `FeatureInfoPackLike` describing the fields we touch.
   - `readFeatureInfoFromPack(pack, id)`:
     - `not-ready` when pack / pack.features missing.
     - `not-found` when id is `<= 0`, out of range, or entry is falsy.
     - else populate FeatureInfo with defensive type checks.
   - `FeatureInfoRuntime` + `defaultFeatureInfoRuntime` using
     `getPack<FeatureInfoPackLike>()` from `_shared/globals`.
   - `createGetFeatureInfoTool(runtime)` → Tool with:
     - name `get_feature_info`
     - schema `{ feature: integer minimum 0 }`, required `["feature"]`
     - integer guard (NaN/float/string rejected)
     - `not-ready` → "Map is not ready…"
     - `not-found` → `No feature found matching <id>.`
     - ok path → `okResult({ ...info })`
   - `getFeatureInfoTool = createGetFeatureInfoTool()` default export.

3. Write `src/ai/tools/get-feature-info.test.ts`:
   - imports from `./get-feature-info` including types + default runtime.
   - `makePack()` fixture:
     - index 0 placeholder (0 / undefined — generator writes `0` cast
       as feature).
     - index 1: full continent (land, border=false, named, vertices,
       firstCell, cells, area, group).
     - index 2: ocean (land=false, no name / empty name).
     - index 3: lake (land=false, type=lake, small).
   - suite "pure / seam":
     - full continent returns all fields.
     - ocean without a name → `name: null`.
     - `feature: 3` lake resolves type/group.
     - out-of-range (`-1`, `0`, `>= length`) → error with "No feature"
       or "integer" message.
     - non-integer / missing / 1.5 / "1" / null → error "integer".
     - runtime returning `"not-ready"` → "not ready".
     - `getFeatureInfoTool` basic schema assertions.
   - suite "defaultFeatureInfoRuntime (integration)":
     - set `globalThis.pack` to fake pack, assert read of id 1.
     - clear pack → `not-ready`; call tool → structured error.
     - unknown id via tool → `not-found` error.

4. Wire up in `src/ai/index.ts`:
   - import `getFeatureInfoTool` near `getCellInfoTool`.
   - re-export the public surface
     (`createGetFeatureInfoTool`, `defaultFeatureInfoRuntime`,
     `getFeatureInfoTool`, `readFeatureInfoFromPack`, `FeatureInfo`,
     `FeatureInfoRuntime`) in the same alpha-sorted block as other
     `get_*` tools.
   - `registry.register(getFeatureInfoTool)` in
     `buildDefaultRegistry` near other `get_*` registrations.

5. Add README_AI.md row in the `get_*` cluster (after `get_river_info`
   / before `get_biome_info`) describing input, outputs, use cases,
   and the "Requires an Anthropic API key" line. Include usage
   examples column.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests)
   - `npm run lint` (must still be 7 warnings / 1 info / 0 errors)

7. Commit selected files with
   `feat(ai): add get_feature_info tool`.
