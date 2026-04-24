# Plan 243 — `find_regiments_by_type` AI tool

## Goal

Add a read-only AI tool `find_regiments_by_type` that lists every regiment
of a given type across **all states**. Parallel to `find_cultures_by_type`
(any-string-accepted type filter) and to `find_regiments_by_state`
(same nested iteration shape), but keyed on `regiment.type` rather than
on the owning state.

Regiments live nested under `pack.states[stateI].military[]` — there is
no flat `pack.regiments` array. This tool therefore iterates every active
state and every regiment inside each one, filters on `regiment.type`
case-insensitively, and emits flat hits tagged with the owning state's
`{ i, name }`.

## Motivation

`list_regiments` already supports a `type` filter, but paginates (limit
1–500) and returns a richer per-row payload (unit composition map,
state names, army totals, min_total filter, etc.). Agents often just
need "give me every fleet on the map" or "every cavalry regiment" for
bulk operations:

- Isolate every `fleet` regiment for naval audits.
- Feed regiment ids into `get_regiment_info` by broad type — rename
  every `artillery` regiment, move every `cavalry`, etc.
- Post-filter by owning state without making N state-scoped calls.

Regiment types are arbitrary strings (they come from
`options.military[*].type` — "melee", "ranged", "mounted", "machinery",
"naval", "armored", "aviation", "magical", plus a "fleet" override in
the naval-split path, plus any custom unit types the user configured).
Mirror `find_cultures_by_type`'s "any-string-accepted, trimmed,
case-insensitive" parsing rather than `find_states_by_type`'s
canonical-only model.

## API

### Input

- `type` (required, string): case-insensitive match against
  `regiment.type`. Any non-empty trimmed string accepted.
- `limit` (optional, integer): maximum regiments to return. Default
  10000. Valid range `[1, 100000]`. `count` always reports the full
  unlimited total.

### Output (happy path)

```json
{
  "ok": true,
  "type": "fleet",
  "regiments": [
    {
      "state": { "i": 1, "name": "Altaria" },
      "i": 1,
      "name": "Altaria Fleet",
      "icon": "⛵",
      "x": 640.0,
      "y": 410.0,
      "cell": 1700,
      "n": 800,
      "naval": true
    }
  ],
  "count": 1
}
```

- Hit shape: `{ state: { i, name }, i, name, icon, x, y, cell, n, naval }`.
- Regiment `i` is per-state (matches `regiment.i`) — not globally
  unique across states, same caveat as `get_regiment_info`.
- `icon` passes through as a string when present, else `null`.
- `x`, `y`, `cell` default to 0 when missing / non-finite (matches
  `list_regiments` / `find_regiments_by_state` defensive fallback).
- `n` is total soldiers — raw `regiment.t`, same as
  `get_regiment_info.n` and `list_regiments.total`.
- `naval` is `regiment.n === 1`.

### Errors

- Un-generated map (`pack` or `pack.states` missing) → `not-ready`
  structured error.
- Missing / non-string / empty `type` → validation error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-regiments-by-type.ts`

Runtime-seam pattern (mirrors `find-cultures-by-type.ts` for the
type-parsing surface and `find-regiments-by-state.ts` for the nested
scan shape):

1. Pure scanner `findRegimentsByTypeInPack(pack, type, limit)` —
   iterate `pack.states`, skip index-0 Neutrals and `removed: true`
   entries, iterate each state's `military` array (skip null / no-i
   entries), filter on `regiment.type?.toLowerCase() === type`, collect
   `{ state: { i, name }, i, name, icon, x, y, cell, n, naval }` up to
   `limit`, track full `count`. Returns
   `{ type, regiments, count } | "not-ready"`.
2. `FindRegimentsByTypeRuntime` with a single seam:
   `find(type, limit)`.
3. `defaultFindRegimentsByTypeRuntime` — reads `pack` via `getPack`.
4. `createFindRegimentsByTypeTool(runtime?)` — builds the `Tool` object:
   - Rich multi-sentence description mentioning common regiment types
     (melee / ranged / cavalry / artillery / fleet / naval / mounted /
     machinery / magical / aviation / armored), the any-string-accepted
     parse (mirroring `find_cultures_by_type`), parallels to
     `list_regiments` / `find_regiments_by_state` /
     `get_regiment_info`, and the per-hit shape.
   - Input schema: `type` (string, required) + optional `limit`.
   - `execute()`: type required / non-empty trim, limit parse, runtime
     dispatch, map `"not-ready"` → errorResult.
5. Constants: `DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT = 10000`,
   `MAX_FIND_REGIMENTS_BY_TYPE_LIMIT = 100000`.

### Test: `src/ai/tools/find-regiments-by-type.test.ts`

Three describe blocks (mirrors `find-cultures-by-type.test.ts` and
`find-regiments-by-state.test.ts`):

1. **Pure scanner** — `findRegimentsByTypeInPack`:
   - Happy: matches regiments across multiple states (e.g. every
     `melee` across states 1 and 2).
   - Case-insensitivity on both the caller type and `regiment.type`.
   - Skips i=0 Neutrals state's phantom military.
   - Skips `removed: true` states' military.
   - Skips null / no-i regiments.
   - `naval` flag, icon, x / y / cell / n fallbacks.
   - Respects `limit`, preserves full `count`.
   - Returns empty list when no regiment matches.
   - Returns `"not-ready"` when pack or pack.states missing.

2. **Tool surface** — `createFindRegimentsByTypeTool(runtime)`:
   - Happy path: numeric limit, state-tagged hits.
   - Accepts type case-insensitively + with whitespace trim.
   - Rejects missing / non-string / empty / whitespace-only `type`.
   - Surfaces `not-ready` via runtime as a structured error.
   - Respects explicit `limit`, validates limit ranges.
   - Applies default limit when omitted.
   - Verifies exported tool name + schema + required fields.
   - Exposes constants.

3. **defaultFindRegimentsByTypeRuntime (integration)** — stubs
   `globalThis.pack`, asserts the runtime + tool read from the global
   via `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findRegimentsByTypeTool` in `src/ai/index.ts`:
  - Import adjacent to `findRegimentsByStateTool`.
  - Add export block for the tool's public API.
  - `registry.register(findRegimentsByTypeTool)` in
    `buildDefaultRegistry` next to `findRegimentsByStateTool`.
- Add README_AI.md row near the `find_regiments_by_state` row:
  - Description includes `type` input (any-string, case-insensitive),
    `limit`, error modes, output shape, typical usage (bulk regiment
    ops across all states keyed by type).
  - Ends with "Requires an Anthropic API key (see 'Getting an API
    key' below)."
  - Sample prompts: "List every fleet on the map", "Show me all
    cavalry regiments", "Which regiments are artillery?".

## Risks

- None — read-only, pure scan of nested `pack.states[*].military`, no
  side effects.
- Overlap with `list_regiments` (which already supports a `type`
  filter but paginates 1–500 and returns richer rows) is the same
  overlap `find_regiments_by_state` has, and we accept it for the same
  reasons: a predictable bulk-ID-dump shape that matches the other
  `find_*_by_type` tools.
- Regiment types are arbitrary strings in the data model, so we
  accept ANY non-empty trimmed string (matches
  `find_cultures_by_type`, not `find_states_by_type` /
  `find_burgs_by_type` / `find_religions_by_type` which gate on a
  canonical set).
