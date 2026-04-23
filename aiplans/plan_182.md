# Plan 182 — `get_state_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single state —
parallel to `get_map_info` (whole-map summary) and `get_cell_info` (single
cell detail), but for a single state. Enables the AI to drill into a
specific political entity before issuing any state-targeted action
(rename_state, set_state_capital, set_state_color, set_diplomacy, …).

## Use case
Given a state reference (numeric id or case-insensitive name / fullName),
return:
- `i` (state id)
- `name`, `fullName`
- `form`, `formName`, `type`
- `color`, `expansionism`
- `culture`: `{ id, name }` from `pack.cultures[state.culture]` (null when
  missing / out of range)
- `capital`: `{ id, name, x, y }` from `pack.burgs[state.capital]` — `null`
  when `state.capital` is absent or 0
- `center`: `{ cell, x, y }` — `state.center` cell index plus coords from
  `pack.cells.p[center]` — `null` when `state.center` is absent
- `cells_count` — `state.cells` (0-indexed count of cells in the state)
- `area` — `state.area`
- `population_total` — rounded `(state.rural + state.urban) * populationRate`
  (matches the number list_states returns)
- `urban_population` — rounded `state.urban * populationRate * urbanization`
  (matches what burg-level pops aggregate to)
- `rural_population` — rounded `state.rural * populationRate`
- `burgs_count` — live count of burgs where `burg.state === stateI` and
  `!burg.removed` and `burg.i > 0` (mirrors the Burgs Overview filter)
- `provinces`: list of `{ id, name }` where `province.state === stateI` and
  `!province.removed` (mirrors the Provinces Editor filter)
- `diplomacy`: the state's diplomacy row (`state.diplomacy ?? []`)
- `lock`: `state.lock ?? false`

## Shape
- **Tool name**: `get_state_info`
- **Inputs**:
  - `state` (integer or string, required) — numeric state id (> 0) or
    case-insensitive name / fullName. Uses the shared
    `findEntityByRef`, which skips the index-0 placeholder and any
    `removed: true` entries.
- **Output** (on success):
  ```
  {
    ok: true,
    i,
    name,
    fullName,
    form, formName, type,
    color, expansionism,
    culture:       { id, name } | null,
    capital:       { id, name, x, y } | null,
    center:        { cell, x, y } | null,
    cells_count,
    area,
    population_total,
    urban_population,
    rural_population,
    burgs_count,
    provinces:     [ { id, name }, … ],
    diplomacy:     string[],
    lock:          boolean
  }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - `state` missing / wrong type → `state must be a positive integer id or a non-empty name string.` (via `parseEntityRef`)
  - state 0 (Neutrals) → `Cannot read info for state 0 (the Neutrals placeholder).`
  - no match / removed → `No state found matching <ref>.`

## Runtime seam
```ts
export interface StateInfoRuntime {
  readState(ref: number | string): StateInfo | "not-ready" | "not-found" | "neutral";
}
export const defaultStateInfoRuntime: StateInfoRuntime = {
  readState(ref) { /* reads globalThis.pack + populationRate + urbanization */ }
};
```

Internally a pure helper `readStateInfoFromPack(pack, rates, ref)` does
the work without touching globals so tests can exercise it directly.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake state.
2. Resolves culture `{id,name}` from `pack.cultures[state.culture]`;
   returns `null` when culture id is out of range.
3. Resolves capital from `pack.burgs[state.capital]` with `{id,name,x,y}`;
   `null` when `state.capital` is 0 / missing.
4. `center` populated from `pack.cells.p[state.center]`; `null` when
   `state.center` is missing.
5. `population_total`, `urban_population`, `rural_population` apply the
   right rates (rural*rate; urban*rate*urbanization).
6. `burgs_count` counts only `burg.state === i && !removed && i > 0` —
   skips placeholder index-0 burg and removed.
7. `provinces` only includes `province.state === i && !removed` entries,
   returned as `{id, name}`.
8. `diplomacy` is passed through as `state.diplomacy ?? []`.
9. `lock` pass-through; defaults `false`.
10. String-ref lookup by `name` / `fullName` (case-insensitive) resolves.
11. Unknown / removed / state-0 refs return `not-found` / `neutral`.
12. Returns `not-ready` when `pack` is missing.

Schema sanity:
13. `state` is required; tool name is `get_state_info`.
14. Non-integer / missing state → parseEntityRef error.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
writes + `afterEach` restores, mirroring the `get_cell_info` test.
1. Reads a real packed state through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for unknown id.

## Registration
- Add `import { getStateInfoTool } from "./tools/get-state-info";` in
  `src/ai/index.ts`.
- Add `registry.register(getStateInfoTool);` next to
  `registry.register(getCellInfoTool);`.
- Add a re-export block:
  `export { createGetStateInfoTool, defaultStateInfoRuntime, getStateInfoTool, type StateInfo, type StateInfoRuntime, readStateInfoFromPack } from "./tools/get-state-info";`.

## README_AI.md
Add a row immediately after `get_cell_info` — same column shape
(description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2573 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT list every burg or every cell in the state — counts + a
  curated province list only. That parallels `list_states` staying
  summary-level. Use `get_entity_cells` for the full cell list or
  `list_burgs` with `state=…` for the full burg list.
- We do NOT compute population in any display currency (monetary units
  etc.), just rounded counts matched to `list_states` output.
- The `diplomacy` row is returned as-is (indexed by state id, with
  `state[i]` being the relation that state `state.i` has with state `i`).
  We don't decorate with the other state's name — the AI can cross-walk
  to `list_diplomacy` or `list_states` for names.
