# Plan 218 — `find_regiments_by_state` AI tool

## Goal

Add a read-only AI tool `find_regiments_by_state` that lists every regiment
belonging to a given state. Parallel to `find_burgs_by_state` and
`find_provinces_by_state` — a lean bulk lookup that complements
`get_state_info` (which does not expose the regiment roster) and
`list_regiments` (which paginates 1-500 and spans every state with
per-regiment filters).

Regiments live nested under `pack.states[stateI].military[]` — state id is
already carried by their parent — so this tool resolves the state once and
then iterates that one array, returning a terse per-regiment shape.

## Motivation

`list_regiments` already supports a `state` filter, but paginates with
`limit` 1-500 and returns a richer per-row payload (unit composition map,
state names, army totals, min_total filter, etc.). Agents often just need
"give me every regiment in state X" for bulk operations:

- Bulk `rename_regiment` / `set_regiment_*` / `move_regiment` across a
  state.
- Feeding regiment ids into `get_regiment_info` after resolving a state by
  name.
- Rendering a regiment list with pin coords and naval flags.

A dedicated finder that mirrors `find_burgs_by_state` /
`find_provinces_by_state`'s shape (pure scanner + runtime seam + larger
limits) gives a predictable API and keeps the pattern uniform across the
three `find_*_by_state` tools.

## API

### Input

- `state` (required, integer | string): state ref. Numeric id (> 0) or
  case-insensitive name / fullName, resolved via the shared
  `findEntityByRef`. Skips `removed: true` states and the Neutrals slot
  at id 0.
- `limit` (optional, integer): maximum regiments to return. Default 10000.
  Valid range `[1, 100000]`. `count` always reports the full unlimited
  total.

### Output (happy path)

```json
{
  "ok": true,
  "state": { "i": 3, "name": "Valorin" },
  "regiments": [
    {
      "i": 0,
      "name": "1st Valorin Guard",
      "icon": "⚔",
      "x": 512.0,
      "y": 360.0,
      "cell": 1523,
      "n": 2400,
      "type": "melee",
      "naval": false
    },
    {
      "i": 1,
      "name": "Valorin Fleet",
      "icon": "⛵",
      "x": 640.0,
      "y": 410.0,
      "cell": 1700,
      "n": 800,
      "type": "fleet",
      "naval": true
    }
  ],
  "count": 2
}
```

- Regiment `i` is the per-state index (matches `regiment.i`) — not globally
  unique across states, same caveat as `get_regiment_info`.
- `icon` / `type` pass through as strings when present, otherwise `null`.
- `x`, `y`, `cell` default to 0 when the raw field is missing / non-finite
  (matches `list_regiments`' defensive fallback).
- `n` is total soldiers — raw `regiment.t` (same as `get_regiment_info.n`
  and `list_regiments.total`).
- `naval` is `regiment.n === 1`.

### Errors

- Un-generated map (`pack` or `pack.states` missing) → `not-ready`
  structured error.
- Missing / invalid `state` (not a positive integer or non-empty string) →
  validation error via `parseEntityRef`.
- `state === 0` numerically → explicit error about the Neutrals placeholder.
- Unresolvable state ref (no matching state / removed state) → not-found
  error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-regiments-by-state.ts`

Runtime-seam pattern (mirrors `find-provinces-by-state.ts`):

1. Pure scanner `findRegimentsByStateInPack(pack, stateI, limit)` — given
   a pre-resolved numeric `stateI`, look up `pack.states[stateI]`, skip if
   missing / removed, iterate its `military` array, collect
   `{ i, name, icon, x, y, cell, n, type, naval }` up to `limit`, track
   full `count`. Returns `{ regiments, count }` or `"not-ready"`.
2. `resolveStateRefInPack(pack, ref)` — resolves a ref via
   `findEntityByRef`. Returns `{ i, name } | "not-ready" | "not-found" |
   "neutral"`. Same shape as the helper in `find-burgs-by-state.ts` /
   `find-provinces-by-state.ts` but scoped to a `PackLike` with `states`.
3. `FindRegimentsByStateRuntime` with two seams: `resolveState(ref)` and
   `find(stateI, limit)`.
4. `defaultFindRegimentsByStateRuntime` — reads `pack` via `getPack`.
5. `createFindRegimentsByStateTool(runtime?)` — builds the `Tool` object:
   - Rich multi-sentence description (shape, errors, usage, parallels to
     `list_regiments` / `get_state_info` / `find_burgs_by_state` /
     `find_provinces_by_state`).
   - Input schema: `state` (integer | string, required) + optional `limit`.
   - `execute()` handles: parse-entity-ref, explicit `state === 0` check,
     limit parse, runtime dispatch.
6. Constants: `DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT = 10000`,
   `MAX_FIND_REGIMENTS_BY_STATE_LIMIT = 100000`.

### Test: `src/ai/tools/find-regiments-by-state.test.ts`

Three describe blocks (mirrors find-provinces-by-state):

1. **Pure scanner** — `findRegimentsByStateInPack`:
   - Collects every regiment under `pack.states[stateI].military`.
   - Returns empty list when state has no military / empty military.
   - Respects `limit`, preserves full `count`.
   - Returns `"not-ready"` when pack or pack.states missing.
   - Naval flag / icon / type / cell / x / y populated from the raw
     regiment fields with the documented fallbacks.
   - Returns `"not-ready"` when target state missing / no military array.

2. **Tool surface** — `createFindRegimentsByStateTool(runtime)`:
   - Happy path: numeric state, resolved regiments, echoes state
     `{i, name}`.
   - Happy path: string state name (case-insensitive).
   - Rejects missing / invalid `state` via `parseEntityRef`.
   - Rejects `state === 0` with Neutrals-specific message.
   - Surfaces `not-found` via runtime.
   - Surfaces `not-ready` via runtime.
   - Respects explicit `limit`.
   - Rejects invalid `limit`.
   - Applies default limit when omitted.
   - Verifies exported tool name + schema + required fields.
   - Exposes constants.

3. **defaultFindRegimentsByStateRuntime (integration)** — stubs
   `globalThis.pack`, asserts the runtime + tool read from the global via
   `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findRegimentsByStateTool` in `src/ai/index.ts`:
  - Import near `findProvincesByStateTool`.
  - Export block for the tool's public API.
  - `registry.register(findRegimentsByStateTool)` in `buildDefaultRegistry`
    next to `findProvincesByStateTool`.
- Add README_AI.md row near `find_provinces_by_state`:
  - Description includes `state` input (id or name), `limit`, error modes,
    output shape, typical usage (bulk regiment ops + detail parallel to
    `list_regiments` / `get_state_info`).
  - Ends with "Requires an Anthropic API key (see 'Getting an API key'
    below)."
  - Sample prompts: "List every regiment in Altaria", "Show me all the
    military units in state 3", "What regiments does the Kingdom of Valorin
    field?".

## Risks

- None — read-only, pure scan of `pack.states[stateI].military`, no side
  effects.
- Overlap: `list_regiments` already supports a `state` filter, but its
  max limit (500) and richer per-row payload (unit composition map,
  cross-state iteration, min_total filter) make it a heavier,
  pagination-oriented tool. `find_regiments_by_state` is the bulk-id-dump
  parallel, mirroring `find_burgs_by_state` / `find_provinces_by_state`'s
  shape.
- State resolution uses the shared `findEntityByRef` so behaviour
  (case-insensitive match on `name` / `fullName`, skipping Neutrals +
  removed) stays consistent with `get_state_info`, `rename_state`,
  `find_burgs_by_state`, `find_provinces_by_state`, etc.
- Unlike burgs / provinces, regiments do not carry a `removed` field on the
  shared `RawRegiment` type — the scanner only filters `null` / malformed
  entries (matches `list_regiments` / `get_regiment_info`).
