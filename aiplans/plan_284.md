# Plan 284 — `get_cells_density` Tool

## Goal
Add a read-only AI tool `get_cells_density` that is the inverse of `set_cells_density`. It reports the current map-resolution / cells-density value (the Options dialog's "Points number" / cells density slider). Read-only; takes no parameters.

## Source of truth resolution
The setter (`set-cells-density.ts`) writes to three places (in priority order, mirrored by the getter):
1. **DOM**: `document.getElementById("pointsInput")` — `.value` is the integer level (1-13), `.dataset.cells` is the absolute cell count (1000-100000). The setter also calls `window.changeCellsDensity(level)` which writes both.
2. **`localStorage.getItem("points")`** — stores the level (1-13).

There is **no `window.options` field** for cells density — the setter never writes to `options`, so the getter does not read from it either. (This matches `get_geography`, which also has no `options` surface.)

The getter resolves the cells count in this order:
1. `pointsInput.dataset.cells` parsed as a finite integer that lies in the 13 supported counts. Returned directly.
2. `pointsInput.value` parsed as an integer 1-13 → mapped through `CELLS_DENSITY_MAP`.
3. `localStorage.getItem("points")` parsed as an integer 1-13 → mapped through `CELLS_DENSITY_MAP`.
4. Otherwise `null`.

Reusing `CELLS_DENSITY_MAP` from `set-cells-density.ts` keeps the two tools in sync.

## Design decisions
- Reuse the constants and types from `./set-cells-density` (`CELLS_DENSITY_MAP`, `CELLS_DENSITY_OPTIONS`, `resolveCellsLevel`). Do NOT duplicate the map.
- A `CellsDensityReadRuntime` with `read(): number | null` lets tests inject a stub runtime (mirroring `defaultCellsDensityRuntime` and the `GeneratorRatesReadRuntime` pattern).
- The default runtime has the three-tier DOM-dataset → DOM-value → localStorage fallback above.
- Returns the absolute cells count (1000, 2000, ..., 100000), not the level (1-13). Callers asking "what cells density am I using" expect a count. The setter takes an absolute count too.
- No parameters required; unexpected input keys are ignored.

## Tool response shape
```json
{ "ok": true, "value": 10000 }
```
or, when no source resolves:
```json
{ "ok": true, "value": null }
```

## Files
- New: `src/ai/tools/get-cells-density.ts`
- New: `src/ai/tools/get-cells-density.test.ts`
- Edit: `src/ai/index.ts` — import, register, re-export.
- Edit: `README_AI.md` — new row next to `set_cells_density`.
- New: `aiplans/plan_284.md`, `aiplans/tasks_284.md`.

## Test strategy
- **Runtime-seam unit tests** via `createGetCellsDensityTool({ read: () => N })`:
  - Returns `{ ok, value }` with the runtime's value when present.
  - Returns `{ ok, value: null }` when runtime returns `null`.
  - Ignores unexpected input arguments.
  - Tool metadata: `name === "get_cells_density"`, empty `input_schema.properties`, no required fields.
- **`defaultCellsDensityReadRuntime` integration tests** using `globalThis` swaps:
  - Reads from `pointsInput.dataset.cells` when present and a known count.
  - Falls back to `pointsInput.value` (level) when dataset is missing/invalid.
  - Falls back to `localStorage.getItem("points")` when DOM is missing.
  - Returns `null` when no source has a usable value.
  - Prefers DOM-dataset over DOM-value over localStorage.
  - Ignores out-of-range / non-finite values and falls through.

## Non-goals
- Does not report the level (1-13) — only the absolute cells count.
- Does not mutate state.
- Does not validate that the observed value is one of the 13 canonical counts when it comes from `dataset.cells` — but it does fall through if the value isn't a finite positive integer.
