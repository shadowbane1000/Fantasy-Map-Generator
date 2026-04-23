# Plan 215 — `find_burgs_by_state` AI tool

## Goal

Add a read-only AI tool `find_burgs_by_state` that lists every active burg
belonging to a given state. Parallel to `list_burgs` but filtered by state and
without per-burg population scaling / resolved state / culture names — a lean
bulk lookup that complements `get_state_info` (which only reports
`burgs_count`, not the actual list).

## Motivation

`get_state_info` returns the state's `burgs_count` but not the list. `list_burgs`
supports a `state` filter but paginates with `limit` 1-500 and returns fully
resolved state / culture names per row, which is heavier than needed for
"give me every burg id in state X" workflows. A dedicated finder that mirrors
`find_burgs_in_area`'s shape (pure scanner + runtime seam + larger limits)
gives agents a terse, predictable API for:

- Bulk `rename_burg` / `set_burg_*` across a state.
- Feeding burg ids into `get_burg_info` after resolving a state by name.
- Auditing capitals / ports within a state (callers can post-filter).

## API

### Input

- `state` (required, integer | string): state ref. Numeric id (> 0) or
  case-insensitive name / fullName, resolved via the shared
  `findEntityByRef`. Skips `removed: true` states and the Neutrals slot
  at id 0.
- `limit` (optional, integer): maximum burgs to return. Default 10000.
  Valid range `[1, 100000]`. `count` always reports the full unlimited
  total.

### Output (happy path)

```json
{
  "ok": true,
  "state": { "i": 3, "name": "Valorin" },
  "burgs": [
    { "i": 12, "name": "Stormport", "x": 512.0, "y": 360.0, "population": 14.2, "capital": true },
    { "i": 47, "name": "Ashgard", "x": 600.5, "y": 402.1, "population": 3.7, "capital": false }
  ],
  "count": 2
}
```

- `population` is the raw engine value (`burg.population`), matching
  `find_burgs_in_area`'s non-scaling treatment — callers that want display
  scaling can multiply by `populationRate × urbanization`.
- `capital` is `burg.capital === 1`.

### Errors

- Un-generated map (`pack` or `pack.burgs` missing) → `not-ready` structured
  error.
- Missing / invalid `state` (not a positive integer or non-empty string) →
  validation error via `parseEntityRef`.
- `state === 0` numerically → explicit error about the Neutrals placeholder.
- Unresolvable state ref (no matching state / removed state) → not-found
  error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-burgs-by-state.ts`

Runtime-seam pattern (a blend of `find-burgs-in-area.ts` + `get-state-info.ts`):

1. Pure scanner `findBurgsByStateInPack(pack, stateI, limit)` — given a
   pre-resolved numeric `stateI`, iterate `pack.burgs`, skip the index-0
   placeholder and removed burgs, filter by `burg.state === stateI`,
   collect `{ i, name, x, y, population, capital }` up to `limit`, track
   full `count`. Returns `{ burgs, count }` or `"not-ready"`.
2. `resolveStateRefInPack(pack, ref)` — resolves a ref via `findEntityByRef`.
   Returns `{ i, name } | "not-ready" | "not-found" | "neutral"`.
3. `FindBurgsByStateRuntime` with two seams: `resolveState(ref)` and
   `find(stateI, limit)`.
4. `defaultFindBurgsByStateRuntime` — reads `pack` via `getPack`.
5. `createFindBurgsByStateTool(runtime?)` — builds the `Tool` object:
   - Rich multi-sentence description (shape, errors, usage, parallels to
     `list_burgs` / `get_state_info` / `find_burgs_in_area`).
   - Input schema: `state` (integer | string, required) + optional `limit`.
   - `execute()` handles: parse-entity-ref, explicit `state === 0` check
     (matches get_state_info's pattern), limit parse, runtime dispatch.
6. Constants: `DEFAULT_FIND_BURGS_BY_STATE_LIMIT = 10000`,
   `MAX_FIND_BURGS_BY_STATE_LIMIT = 100000`.

### Test: `src/ai/tools/find-burgs-by-state.test.ts`

Three describe blocks (mirrors find-burgs-in-area):

1. **Pure scanner** — `findBurgsByStateInPack`:
   - Collects every active burg where `burg.state === stateI`.
   - Skips index-0 placeholder, removed burgs.
   - Respects `limit`, preserves full `count`.
   - Empty result when state has no burgs.
   - Returns `"not-ready"` when pack or pack.burgs missing.
   - `capital` populated from `burg.capital === 1`.

2. **Tool surface** — `createFindBurgsByStateTool(runtime)`:
   - Happy path: numeric state, resolved burgs, echoes state `{i, name}`.
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

3. **defaultFindBurgsByStateRuntime (integration)** — stubs `globalThis.pack`,
   asserts the runtime + tool read from the global via
   `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findBurgsByStateTool` in `src/ai/index.ts`:
  - Import near `findBurgsInAreaTool`.
  - Export block for the tool's public API.
  - `registry.register(findBurgsByStateTool)` in `buildDefaultRegistry`
    next to `findBurgsInAreaTool`.
- Add README_AI.md row near `find_burgs_in_area`:
  - Description includes `state` input (id or name), `limit`, error modes,
    output shape, typical usage (bulk burg ops + audit parallel to
    `get_state_info`).
  - Ends with "Requires an Anthropic API key (see 'Getting an API key'
    below)."
  - Sample prompts: "List every burg in Altaria", "What are all the cities
    in state 3?", "Show me every burg belonging to the Kingdom of Valorin".

## Risks

- None — read-only, pure scan of `pack.burgs` gated on `burg.state`, no
  side effects.
- Collision: verified `list_burgs` already supports a `state` filter, but
  its max limit (500) and richer per-row payload (resolved state / culture
  names, capital / port flags plus type) make it a heavier tool with a
  different focus. `find_burgs_by_state` is the bulk-id-dump parallel,
  mirroring `find_burgs_in_area`'s shape.
- State resolution uses the shared `findEntityByRef` so behaviour
  (case-insensitive match on `name` / `fullName`, skipping Neutrals +
  removed) stays consistent with `get_state_info`, `rename_state`, etc.
