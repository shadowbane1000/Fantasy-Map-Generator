# Plan 196 — add `list_features` AI tool

## Goal
Add a read-only AI tool that lists every entry in `pack.features` —
the oceans, continents, islands, and lakes the feature-marking pass
produces from the packed Voronoi graph. Parallels `list_biomes`,
`list_rivers`, `list_zones` (paginated lists) and complements the
just-merged `get_feature_info` (single-feature detail).

## Why
`get_feature_info` only works when the caller already knows the
feature id. Agents reasoning about "all islands", "where are the
lakes?", or "which oceans touch the map edge?" currently have no
direct way to enumerate features — they would have to sweep cells
via `get_cell_info` and de-duplicate. `list_features` gives them a
single, paginated view matching the same `feature`-ref shape
`get_cell_info` returns and `get_feature_info` reads in detail.

## Shape

Tool name: `list_features`

Input (all optional):
- `type` (string) — filter to a specific raw `feature.type`:
  `"island"`, `"lake"`, `"ocean"`, or `"continent"`. Case-insensitive.
  (Note: `"continent"` is a `feature.group`, not a raw `type`; we
  treat it as the synthetic filter "islands whose group is
  continent" so callers can say "list the continents" naturally.)
- `land` (boolean) — filter on `feature.land`.
- `limit` (integer 1-500, default 100).
- `offset` (integer >= 0, default 0).

Behavior:
- Read-only.
- Skip `pack.features[0]` (the generator writes `0` there — see
  `src/modules/features.ts` around line 353 and the existing
  comments in `get-feature-info.ts`).
- Skip any falsy / non-object slots.
- For each remaining feature return a summary with:
  - `i` — feature id (falls back to the slot index when
    `feature.i` is missing).
  - `type` — raw `feature.type` (`island` / `lake` / `ocean`) or
    `null`.
  - `group` — raw `feature.group` (e.g. `continent`, `isle`,
    `ocean`, `freshwater`, `salt`, `dry`) or `null` when unset.
  - `name` — `null` when missing / empty, else the string.
  - `land` — boolean.
  - `border` — boolean.
  - `cells` — count (the raw `feature.cells` is already a number,
    per `PackedGraphFeature`, not a list — mirrors
    `get_feature_info`).
  - `area` — number (0 when missing).
- Paginate through `createPaginatedListTool` with `collectionKey`
  `"features"`.
- Echo the active filters back under `filters`.

## Files

- `src/ai/tools/list-features.ts` — runtime-seam tool.
- `src/ai/tools/list-features.test.ts` — pure / seam tests plus
  `defaultFeaturesRuntime` integration block (sets `globalThis.pack`).
- `src/ai/index.ts` — import, register, re-export in `list_*` cluster.
- `README_AI.md` — add row near the other `list_*` rows.

## Architecture

Mirror `list-zones.ts` (paginated list with filters):

- `export interface FeatureSummary { i; type; group; name; land; border; cells; area }`
- `export interface FeaturePackLike { features?: ArrayLike<...> }` —
  same lean shape used in `get-feature-info.ts`.
- `export function readFeaturesFromPack(pack): FeatureSummary[] | null`
  - `null` when pack / pack.features missing.
  - Iterates from index 1, skipping 0-placeholder and falsy slots.
- `export interface FeaturesRuntime { readFeatures(): FeatureSummary[] | null }`
- `export const defaultFeaturesRuntime` — reads via `getPack()`.
- `FeatureFilters` (internal): `{ typeFilter: string | null; landFilter: boolean | null }`.
- `createListFeaturesTool(runtime)` → `createPaginatedListTool<FeatureSummary, FeatureFilters>`.
- `export const listFeaturesTool = createListFeaturesTool()`.

Type-filter mapping (case-insensitive):
- `"ocean"` → keep features whose raw `type === "ocean"`.
- `"lake"` → keep features whose raw `type === "lake"`.
- `"island"` → keep features whose raw `type === "island"` (includes
  continents, since the raw `type` of continents is also `island`).
- `"continent"` → keep features whose `group === "continent"`
  (convenience filter — continents share `type === "island"`).

## Validation / edge cases

- `type` non-string / empty → input error ("type must be a
  non-empty string.").
- `type` not one of `island` / `lake` / `ocean` / `continent`
  (case-insensitive) → input error listing allowed values.
- `land` non-boolean → input error.
- `limit` / `offset` invalid → handled by `validatePaging`.
- `pack.features` missing → not-ready error.
- Empty features array (only placeholder) → `{ ok: true, features: [], count: 0, total: 0 }`.

## Tests

Pure / seam (`createListFeaturesTool` + stub runtime):
- returns all non-placeholder features by default.
- skips `pack.features[0]` placeholder and undefined slots.
- filters by `type: "ocean"` / `"lake"` / `"island"` / `"continent"`
  (all case-insensitive, including mixed-case input).
- `continent` filter returns only features whose `group === "continent"`.
- filters by `land: true` / `land: false`.
- combined filters compose (type + land).
- honors `limit` and `offset`.
- empty array when filter matches nothing (still valid echo).
- rejects non-string type / unknown type / non-boolean land.
- not-ready when runtime returns `null`.
- `readFeaturesFromPack(undefined)` / `readFeaturesFromPack({})` → `null`.
- `readFeaturesFromPack` maps fields and coerces missing to null/0/false.
- Tool schema spot-check.

Integration (`defaultFeaturesRuntime`):
- seeds `globalThis.pack`; tool returns a populated list.
- `globalThis.pack = undefined` → structured `not ready` error.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite.

## Out of scope

- Exposing `firstCell` / `vertices_count` / `shoreline`: callers can
  pair `list_features` with `get_feature_info` for any feature
  they're interested in (same pattern as `list_rivers` →
  `get_river_info`, `list_biomes` → `get_biome_info`).
- Area-unit conversion: returned `area` is the raw packed number,
  same as `get_feature_info`.
- Filtering on `border` / `name` prefix — not a common use case,
  easy to add later without breaking the shape.
