# Plan 177 — `get_cell_info` AI tool

## Goal
Add a read-only AI tool that reports every meaningful property of a single
packed-grid cell — the per-cell parallel of `get_map_info`. Useful before any
cell-targeted decision (add_burg, add_culture_center, add_marker, etc.).

## Use case
Given a cell index, return:
- `height` from `pack.cells.h[i]`
- `biome` id + resolved name via `biomesData.name[biomeId]`
- `temperature` (°C, from `grid.cells.temp[pack.cells.g[i]]`)
- `precipitation` (raw prec value, from `grid.cells.prec[pack.cells.g[i]]`)
- `population` from `pack.cells.pop[i]`
- `state` id + resolved state name (`pack.states[id].name`)
- `province` id + resolved province name (`pack.provinces[id].name`)
- `culture` id + resolved culture name (`pack.cultures[id].name`)
- `religion` id + resolved religion name (`pack.religions[id].name`)
- `burg` id + resolved burg name (`pack.burgs[id].name`) — `null` when 0
- `river` id + resolved river name (`pack.rivers[?].name`) — `null` when 0 /
  no match (rivers are a non-contiguous `River[]` keyed by `i`)
- `feature` id + resolved info (`{i, type, group, land, border, name?}`)
- `x`, `y` from `pack.cells.p[i]`
- `neighbors` (number[]) from `pack.cells.c[i]`

Temp / prec live on `grid.cells` (not `pack.cells`) — access via `pack.cells.g[i]`
which maps a packed cell back to its base-grid cell (see
`public/modules/ui/general.js:273` for the canonical pattern:
`grid.cells.temp[g]` with `g = cells.g[i]`).

## Shape
- **Tool name**: `get_cell_info`
- **Inputs**:
  - `cell` (integer, required) — packed cell index. Must be within bounds of
    `pack.cells.i` (i.e. `>= 0` and `< cells.i.length`).
- **Output** (on success):
  ```
  {
    ok: true,
    cell: <int>,
    x, y,
    height,
    biome:       { id, name },
    temperature, precipitation,
    population,
    state:       { id, name } | { id: 0, name: null },
    province:    { id, name } | { id: 0, name: null },
    culture:     { id, name } | { id: 0, name: null },
    religion:    { id, name } | { id: 0, name: null },
    burg:        { id, name } | null,
    river:       { id, name } | null,
    feature:     { id, type, group, land, border, name } | null,
    neighbors:   number[]
  }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - `cell` missing / not a number → `cell is required and must be an integer.`
  - out-of-bounds (`< 0` or `>= cells.i.length`) → `cell <n> is out of bounds (0..<max>).`

## Runtime seam
```ts
export interface CellInfoRuntime {
  readCell(cell: number): CellInfo | "not-ready" | "out-of-bounds";
}
export const defaultCellInfoRuntime: CellInfoRuntime = {
  readCell(cell) { /* reads globalThis.pack + globalThis.grid + globalThis.biomesData */ }
};
```

Internally a helper `readCellFromState(pack, grid, biomesData, cell)` does the
pure work so the test can invoke it without touching globals.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields with a populated fake pack (populated states, burgs,
   cultures, religions, biomes, provinces, river, feature).
2. Resolves temperature/precipitation via `pack.cells.g[i]` indirection.
3. Neutral / empty slots (`state=0`, `province=0`, `culture=0`, `religion=0`,
   `burg=0`, `r=0`) come back with `id: 0` / `null` name (burg/river as
   `null`, state/province/culture/religion as `{id:0, name:null}` so caller
   can still see the id).
4. Feature resolution — returns the raw shape for the matching
   `pack.features[f]` (preserving `land`, `border`, `type`, `group`, `name`,
   `i`). `f=0` → `null`.
5. River id that exists in `pack.rivers` resolves by its `.i`. Unknown river
   id returns `{ id, name: null }`.
6. Neighbors copied from `pack.cells.c[i]` as a plain array.
7. Returns the `cell` id echoed back as `cell`.
8. Out-of-bounds `cell` — negative or `>= cells.i.length` → error.
9. Non-integer / missing `cell` → error.
10. `not-ready` (runtime returns sentinel) → structured error.
11. Schema sanity: `cell` is required integer, tool name is `get_cell_info`.
12. Biome name falls back to `null` when `biomesData.name[biome]` is missing.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: … })` / grid / biomesData writes +
`afterEach` restores, mirroring `add-pit.test.ts`:
1. Reads a real packed cell through the default runtime (populates globals
   with a minimal pack/grid/biomesData).
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"out-of-bounds"` when cell is past `cells.i.length`.

## Registration
- Add `import { getCellInfoTool } from "./tools/get-cell-info";` in
  `src/ai/index.ts`.
- Add `registry.register(getCellInfoTool);` next to `registry.register(getMapInfoTool);`.
- Add a re-export block:
  `export { createGetCellInfoTool, defaultCellInfoRuntime, getCellInfoTool, type CellInfo, type CellInfoRuntime } from "./tools/get-cell-info";`.

## README_AI.md
Add a row immediately after `get_map_info` — same column shape (description
with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2437 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT convert temperature to the current display unit. The UI does
  that via `convertTemperature(grid.cells.temp[g])`; tools return the raw
  °C integer and let the model handle units itself.
- We do NOT compute `elevation` (the user-friendly height in m/ft) — the raw
  `h` 0–100 value is what every other tool uses.
- We do NOT list every cell route / connection / haven etc. — only the fields
  listed above. This parallels `get_map_info` staying a "summary" tool.
