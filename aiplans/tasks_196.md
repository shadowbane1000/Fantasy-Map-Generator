# Tasks — Plan 196 (`list_features`)

1. Baseline: `npm run lint` = 7 warnings / 1 info / 0 errors;
   `npm test` = 2877 passing.

2. Write `src/ai/tools/list-features.ts`:
   - `FeatureSummary` interface: `i`, `type`, `group`, `name`,
     `land`, `border`, `cells`, `area`.
   - `FeaturePackLike` with
     `features?: ArrayLike<{ i?; type?; group?; name?; land?; border?; cells?; area? } | 0 | null | undefined>`
     — same lean shape as `get-feature-info.ts`.
   - `readFeaturesFromPack(pack)`:
     - `null` when `!pack?.features`.
     - Loop starting at index 1; skip falsy / non-object slots.
     - Map to `FeatureSummary`, coercing empty / missing name to
       `null`, missing type/group to `null`, missing cells/area to 0,
       missing land/border to `false`.
   - `FeaturesRuntime { readFeatures(): FeatureSummary[] | null }`
     + `defaultFeaturesRuntime` using `getPack<FeaturePackLike>()`.
   - Internal `FeatureFilters`:
     `{ typeFilter: "island" | "lake" | "ocean" | "continent" | null; landFilter: boolean | null }`.
   - `createListFeaturesTool(runtime = default)` uses
     `createPaginatedListTool<FeatureSummary, FeatureFilters>`:
     - name `list_features`
     - description mentions paginated, filters, placeholder-skip.
     - input schema: `limit`, `offset`, `type`, `land`.
     - `collectionKey: "features"`.
     - `notReadyError`: "Map is not ready yet; cannot list
       features. Wait for the 'map:generated' event on window."
     - `read: () => runtime.readFeatures()`.
     - `parseFilters`:
       - `type`: string, case-insensitive, must be in the allowed
         set; otherwise descriptive error.
       - `land`: boolean.
     - `applyFilters`:
       - For `typeFilter === "continent"`, keep features whose
         `group === "continent"`.
       - For `typeFilter` in `island`/`lake`/`ocean`, keep features
         whose `type === typeFilter`.
       - For `landFilter !== null`, keep features whose
         `land === landFilter`.
       - Echo `{ filters: { type, land } }`.
   - `listFeaturesTool = createListFeaturesTool()` default export.

3. Write `src/ai/tools/list-features.test.ts`:
   - Imports from `./list-features`: `createListFeaturesTool`,
     `defaultFeaturesRuntime`, `listFeaturesTool`,
     `readFeaturesFromPack`, `FeatureSummary`, `FeaturePackLike`,
     `FeaturesRuntime`.
   - `fakeFeatures()` fixture returning an array covering
     continent + island + ocean (border) + freshwater lake.
   - `fakePackLike()` builder returning `{ features: [0, ...] }`
     typed via `as unknown as FeaturePackLike`.
   - `runtimeOf(list)` helper returning a `FeaturesRuntime` stub.
   - `describe("list_features tool")`:
     - default call returns every feature.
     - type filter "island" returns only `type === "island"` (incl.
       continents).
     - type filter "continent" returns only those with
       `group === "continent"`.
     - type filter "lake" returns only lakes.
     - type filter "ocean" returns only oceans.
     - case-insensitive type filter (`"OCEAN"` / `"Lake"`).
     - land:true returns only land features.
     - land:false returns only water features.
     - type + land compose (e.g. island + land:true).
     - unknown type returns structured error.
     - non-string type rejected.
     - empty-string type rejected.
     - non-boolean land rejected.
     - respects `limit` / `offset`.
     - `readFeaturesFromPack(undefined)` / `({} as FeaturePackLike)`
       returns null.
     - `readFeaturesFromPack` skips index-0 placeholder and
       undefined / null slots.
     - `readFeaturesFromPack` coerces missing fields (empty name →
       `null`, missing type/group → `null`, missing cells/area → 0,
       missing land/border → false).
     - `readFeaturesFromPack` falls back to slot index when `entry.i`
       is missing.
     - `listFeaturesTool` exported with expected schema.
     - runtime returning null → "not ready" structured error.
   - `describe("defaultFeaturesRuntime (integration)")`:
     - seed `globalThis.pack = fakePackLike(...)`; default runtime
       returns list.
     - `globalThis.pack = undefined` → tool returns "not ready"
       structured error.
     - restore original pack in `afterEach`.

4. Wire up in `src/ai/index.ts`:
   - import `listFeaturesTool` alpha-sorted with the other `list_*`
     imports (between `list-diplomacy` and `list-markers`).
   - re-export public surface (`createListFeaturesTool`,
     `listFeaturesTool`, `readFeaturesFromPack`) alpha-sorted in the
     `list_*` export cluster.
   - `registry.register(listFeaturesTool)` near the other `list_*`
     registrations.

5. Add README_AI.md row near the other `list_*` rows (after
   `list_zones` or near `list_biomes`, whichever reads most
   naturally). Include description, inputs / filters, and 2-3
   example prompts. Mention API key note.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests from the new suite).
   - `npx biome check src/` must stay at 7 warnings / 1 info /
     0 errors.

7. Commit specific files with
   `feat(ai): add list_features tool` + 1-2 line body.
