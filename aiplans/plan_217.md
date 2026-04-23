# Plan 217 — `find_provinces_by_state` AI tool

## Goal

Add a read-only AI tool `find_provinces_by_state` that lists every active
province belonging to a given state. Parallel to `find_burgs_by_state` but
scanning `pack.provinces` instead of `pack.burgs` — a lean bulk lookup that
complements `get_state_info` (which already returns a `provinces` list of
`{id, name}` but does not include fullName / formName / color / center
coordinates) and `list_provinces` (which paginates 1-500 and resolves parent
state / burg).

## Motivation

`get_state_info` returns the state's provinces as `{id, name}` but omits
fullName, formName, color and center coordinates. `list_provinces` supports a
`state` filter but paginates with `limit` 1-500 and returns richer resolved
fields per row, which is heavier than needed for "give me every province in
state X" workflows. A dedicated finder that mirrors `find_burgs_by_state`'s
shape (pure scanner + runtime seam + larger limits) gives agents a terse,
predictable API for:

- Bulk `rename_province` / `set_province_*` across a state.
- Feeding province ids into `get_province_info` after resolving a state by
  name.
- Rendering a province list with color swatches and geographic centers.

## API

### Input

- `state` (required, integer | string): state ref. Numeric id (> 0) or
  case-insensitive name / fullName, resolved via the shared
  `findEntityByRef`. Skips `removed: true` states and the Neutrals slot
  at id 0.
- `limit` (optional, integer): maximum provinces to return. Default 10000.
  Valid range `[1, 100000]`. `count` always reports the full unlimited
  total.

### Output (happy path)

```json
{
  "ok": true,
  "state": { "i": 3, "name": "Valorin" },
  "provinces": [
    {
      "i": 12,
      "name": "Stormshore",
      "fullName": "Duchy of Stormshore",
      "formName": "Duchy",
      "color": "#aa3322",
      "center": [512.0, 360.0]
    },
    {
      "i": 47,
      "name": "Ashgard",
      "fullName": null,
      "formName": null,
      "color": "#338822",
      "center": null
    }
  ],
  "count": 2
}
```

- `center` is `province.pole` when present as a two-number tuple
  (`[x, y]`), otherwise `null`. Mirrors `list_provinces`'s `pole` handling.
- `fullName`, `formName`, `color` are passed through as strings when present
  in the raw province, otherwise `null`.

### Errors

- Un-generated map (`pack` or `pack.provinces` missing) → `not-ready`
  structured error.
- Missing / invalid `state` (not a positive integer or non-empty string) →
  validation error via `parseEntityRef`.
- `state === 0` numerically → explicit error about the Neutrals placeholder.
- Unresolvable state ref (no matching state / removed state) → not-found
  error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-provinces-by-state.ts`

Runtime-seam pattern (matches `find-burgs-by-state.ts`):

1. Pure scanner `findProvincesByStateInPack(pack, stateI, limit)` — given a
   pre-resolved numeric `stateI`, iterate `pack.provinces`, skip the
   index-0 placeholder and removed provinces, filter by
   `province.state === stateI`, collect
   `{ i, name, fullName, formName, color, center }` up to `limit`, track
   full `count`. Returns `{ provinces, count }` or `"not-ready"`.
2. `resolveStateRefInPack(pack, ref)` — resolves a ref via
   `findEntityByRef`. Returns `{ i, name } | "not-ready" | "not-found" |
   "neutral"`. Same shape as the helper in `find-burgs-by-state.ts` but
   scoped to a `PackLike` with `provinces` + `states`.
3. `FindProvincesByStateRuntime` with two seams: `resolveState(ref)` and
   `find(stateI, limit)`.
4. `defaultFindProvincesByStateRuntime` — reads `pack` via `getPack`.
5. `createFindProvincesByStateTool(runtime?)` — builds the `Tool` object:
   - Rich multi-sentence description (shape, errors, usage, parallels to
     `list_provinces` / `get_state_info` / `find_burgs_by_state`).
   - Input schema: `state` (integer | string, required) + optional `limit`.
   - `execute()` handles: parse-entity-ref, explicit `state === 0` check
     (matches get_state_info's pattern), limit parse, runtime dispatch.
6. Constants: `DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT = 10000`,
   `MAX_FIND_PROVINCES_BY_STATE_LIMIT = 100000`.

### Test: `src/ai/tools/find-provinces-by-state.test.ts`

Three describe blocks (mirrors find-burgs-by-state):

1. **Pure scanner** — `findProvincesByStateInPack`:
   - Collects every active province where `province.state === stateI`.
   - Skips index-0 placeholder, removed provinces.
   - Respects `limit`, preserves full `count`.
   - Empty result when state has no provinces.
   - Returns `"not-ready"` when pack or pack.provinces missing.
   - `center` populated from `province.pole` or null.
   - fullName / formName / color fall back to null when missing.

2. **Tool surface** — `createFindProvincesByStateTool(runtime)`:
   - Happy path: numeric state, resolved provinces, echoes state `{i, name}`.
   - Happy path: string state name.
   - Rejects missing / invalid `state` via `parseEntityRef`.
   - Rejects `state === 0` with Neutrals-specific message.
   - Surfaces `not-found` via runtime.
   - Surfaces `not-ready` via runtime.
   - Respects explicit `limit`.
   - Rejects invalid `limit`.
   - Applies default limit when omitted.
   - Verifies exported tool name + schema + required fields.
   - Exposes constants.

3. **defaultFindProvincesByStateRuntime (integration)** — stubs
   `globalThis.pack`, asserts the runtime + tool read from the global via
   `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findProvincesByStateTool` in `src/ai/index.ts`:
  - Import near `findBurgsByStateTool`.
  - Export block for the tool's public API.
  - `registry.register(findProvincesByStateTool)` in `buildDefaultRegistry`
    next to `findBurgsByStateTool`.
- Add README_AI.md row near `find_burgs_by_state`:
  - Description includes `state` input (id or name), `limit`, error modes,
    output shape, typical usage (bulk province ops + detail parallel to
    `get_state_info` / `list_provinces`).
  - Ends with "Requires an Anthropic API key (see 'Getting an API key'
    below)."
  - Sample prompts: "List every province in Altaria", "What are all the
    provinces in state 3?", "Show me every province belonging to the
    Kingdom of Valorin".

## Risks

- None — read-only, pure scan of `pack.provinces` gated on `province.state`,
  no side effects.
- Overlap: `list_provinces` already supports a `state` filter, but its
  max limit (500) and richer per-row payload (resolved state / burg names)
  make it a heavier, pagination-oriented tool. `find_provinces_by_state`
  is the bulk-id-dump parallel, mirroring `find_burgs_by_state`'s shape.
- `get_state_info` already lists provinces for a state as `{id, name}` but
  does not include fullName / formName / color / center — this tool fills
  that gap without forcing callers through pagination.
- State resolution uses the shared `findEntityByRef` so behaviour
  (case-insensitive match on `name` / `fullName`, skipping Neutrals +
  removed) stays consistent with `get_state_info`, `rename_state`,
  `find_burgs_by_state`, etc.
