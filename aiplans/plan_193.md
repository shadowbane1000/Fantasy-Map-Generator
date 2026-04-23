# Plan 193 — add `get_feature_info` AI tool

## Goal
Add a read-only AI tool that returns detailed info for a single map
feature (island/continent/ocean/lake) from `pack.features[i]`.

## Why
We already have `get_cell_info`, `get_river_info`, `get_burg_info`,
`get_state_info`, etc. Features are first-class map entities (oceans,
lakes, islands, continents) but have no dedicated detail tool; the
only existing path is `get_cell_info` which returns a thin feature ref
for the cell it was called on. Agents that want to reason about a
whole landmass or ocean currently have no direct way to look it up by
feature id.

## Shape

Tool name: `get_feature_info`

Input:
- `feature` (integer, required) — id / index into `pack.features`.

Behavior:
- Read-only.
- Validate input is an integer.
- Validate that `pack` / `pack.features` is loaded (`not-ready`).
- Validate that `feature` is a valid slot — `pack.features[0]` is
  always a placeholder sentinel (`0` — see `features.ts:353`), and
  higher ids may be `undefined`. Reject both with a `not-found`-style
  error.
- Return a structured payload with:
  - `i` (number)
  - `type` (`"island"` / `"continent"` / `"ocean"` / `"lake"` — or
    whatever string the generator assigned)
  - `group` (string — e.g. `"isle"`, `"freshwater"`, `"ocean"`)
  - `name` (string | null — some features (oceans) may lack a name)
  - `land` (boolean)
  - `border` (boolean)
  - `cells` (number — `feature.cells`; count only, not a list)
  - `area` (number)
  - `firstCell` (number | null)
  - `vertices_count` (number — length of `feature.vertices`, 0 when
    absent)

## Files

- `src/ai/tools/get-feature-info.ts` — runtime-seam tool.
- `src/ai/tools/get-feature-info.test.ts` — pure / seam tests plus
  `defaultFeatureInfoRuntime` integration block (sets `globalThis.pack`).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add row in the `get_*` cluster after `get_river_info`.

## Architecture

Mirror `get-river-info.ts`:

- `export interface FeatureInfo { … }`
- `export type ReadFeatureInfoResult = FeatureInfo | "not-ready" | "not-found"`
- `export function readFeatureInfoFromPack(pack, featureId): …`
- `export interface FeatureInfoRuntime { readFeatureInfo(id): … }`
- `export const defaultFeatureInfoRuntime` — reads from
  `getPack()` via `_shared/globals.ts`.
- `export function createGetFeatureInfoTool(runtime = default): Tool`
- `export const getFeatureInfoTool = createGetFeatureInfoTool()`

Input schema: `{ feature: integer, min 0 }`. Required: `["feature"]`.

## Validation / edge cases

- `pack` missing → `not-ready` → structured error.
- `pack.features` missing → `not-ready`.
- `feature` not an integer → schema-style error.
- `feature < 0` → `not-found`.
- `feature === 0` → `not-found` ("placeholder slot").
- `feature >= pack.features.length` → `not-found`.
- `pack.features[feature]` is `undefined` / falsy → `not-found`.
- Real feature → fill `FeatureInfo`; coerce missing `name` to null,
  missing `land`/`border` to false-like defaults, missing `firstCell`
  to null, missing `vertices` to `vertices_count: 0`.

## Tests

Pure / seam:
- full feature (continent) returns all fields including firstCell + vertices_count.
- ocean feature (no name) → name is null.
- rejects non-integer / missing `feature`.
- rejects `feature: -1`, `feature: 0` (placeholder), out-of-range id.
- rejects slot that is `undefined`.
- surfaces `"not-ready"` as a structured error when runtime says so.
- `getFeatureInfoTool` schema spot-check (name, required, properties).

Integration (`defaultFeatureInfoRuntime`):
- with `globalThis.pack` seeded, reads a real feature.
- returns `"not-ready"` when pack is missing.
- returns `"not-found"` through the tool for unknown / zero id.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Listing features (`list_features` is a separate future tool).
- Per-feature cell lists (`get_entity_cells` already covers this for
  some entities — if a future `feature` entity type is added there it
  can be wired separately).
- Mutations (rename / remove / etc. — this tool is read-only).
