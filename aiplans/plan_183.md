# Plan 183 — `get_burg_info` AI Tool

## Use case

Expose a read-only AI tool that, given a burg reference (numeric id or
case-insensitive name), returns the full per-burg dossier the AI needs before
mutating it: identity, population, coordinates / cell, named refs for
`culture` / `religion` / `state` / `province`, `type`, `group` (pin style),
boolean `feature_flags` (citadel / walls / plaza / temple / shanty), `port`,
`capital`, `coa` (custom/present), and `lock`. This is the per-burg parallel
of `get_cell_info` / `get_state_info` and complements `list_burgs`.

## Shape

- Name: `get_burg_info`
- Inputs:
  - `burg` (required, integer|string) — numeric id (>0) or case-insensitive
    name / fullName. Resolved via the shared `findEntityByRef`, which skips
    the index-0 placeholder and `removed: true` entries.
- Behavior:
  - Loads `pack.burgs`, resolves the ref, validates `i > 0` and not removed.
  - Assembles named refs from `pack.cultures[burg.culture]` and
    `pack.states[burg.state]`.
  - `religion` comes from `pack.cells.religion[burg.cell]` →
    `pack.religions[id]` (burgs don't carry `religion` directly; it's a
    per-cell value — see `public/modules/ui/burgs-overview.js:460`).
  - `province` likewise comes from `pack.cells.province[burg.cell]` →
    `pack.provinces[id]` (see `public/modules/ui/burgs-overview.js:79`).
  - `feature_flags` maps each of `citadel | walls | plaza | temple | shanty`
    on the raw burg to a boolean (the raw values are `0`/`1`).
  - `coa`: `{ present: !!b.coa, custom: !!b.coa?.custom }`.
  - `capital`: `b.capital === 1` as a boolean.
  - `port`: `b.port` (non-zero feature-id integer or `0`) — surfaced as
    `boolean` for consistency with `list_burgs`, plus the raw `port_feature`
    integer for callers that care about the linked water-feature id.
- Returns `{ ok, i, name, cell, x, y, population, culture, religion, state,
  province, type, group, feature_flags, port, port_feature, capital, coa,
  lock }`.
- Errors:
  - Missing / invalid `burg` input (delegated to `parseEntityRef`).
  - Burg not found / removed / index-0 placeholder.
  - `pack` not ready (no `pack.burgs` array).

## Files

- New: `src/ai/tools/get-burg-info.ts` — runtime-seam pattern (`PackLike`,
  pure `readBurgInfoFromPack(pack, ref)` → `BurgInfo | "not-ready" |
  "not-found"`, `BurgInfoRuntime`, `defaultBurgInfoRuntime`,
  `createGetBurgInfoTool`, module-level `getBurgInfoTool`).
- New: `src/ai/tools/get-burg-info.test.ts` — pure/seam describe block
  (happy path, name resolution case-insensitive, placeholder/removed
  rejection, neutral religion/province fallback, feature flags mapping,
  coa present/custom flags, unknown ref, not-ready) plus a
  `defaultBurgInfoRuntime` integration describe block using
  `globalThis.pack` with `as unknown as { ... }` casts.
- Modified: `src/ai/index.ts` — import + re-export block + `registry
  .register(getBurgInfoTool)` near `getCellInfoTool` registration.
- Modified: `README_AI.md` — new table row immediately after `get_cell_info`,
  following the per-tool API-key + example-phrases conventions.

## Testing

- Vitest pure/seam: happy path with all fields populated; numeric id
  resolution; case-insensitive name resolution; fallback to `null` on
  unknown culture/religion/state/province ids; `feature_flags` correctly
  booleanizes `0` / `1` / `undefined`; `coa` reflects presence and custom
  flag; `capital` only true when `b.capital === 1`; port boolean +
  `port_feature`; rejects placeholder (i=0), removed burgs, missing /
  non-int-non-string ref, and unknown refs; `"not-ready"` surface when
  `pack.burgs` is missing.
- Integration: sets `globalThis.pack` in `beforeEach`, restores in
  `afterEach`; drives `defaultBurgInfoRuntime.readBurgInfo` through both
  happy and not-ready paths; verifies tool wire-up.

## Risk / Scope

Pure read of `pack`; no mutation, no renderer calls. Adds one warning-
neutral source file and one test file. Lint scope stays `src/**/*.ts`
only.

## Build / Lint / Test gates

- `npm run build` must succeed.
- `npm test` must stay green; the new test file adds ~12+ cases.
- `npm run lint` must match baseline (7 warnings / 1 info / 0 errors).
