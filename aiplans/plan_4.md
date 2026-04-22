# Plan 4 — Use Case: Read current map info

## Status

Iteration 4. Prior iterations: chat shell, `set_map_name`,
`set_layer_visibility`, `apply_layers_preset`. Baseline 7 warnings / 1
info / 0 errors. 95 tests.

## Use Case

**"Tell me about the current map."**

The user can read this info in two ways via the existing UI:
- Map status text built in `public/main.js:1237` (name, seed, canvas size,
  heightmap, template, cells, states/provinces/burgs/religions/cultures
  counts).
- The "Map name" and options panel, and the individual overview panels
  (States / Burgs / Religions / Cultures).

Without this capability the AI can only *change* things blindly. Giving
the AI a read tool is the prerequisite for sensible follow-up tools
(renaming a specific state, focusing on a burg, etc.).

Prompts the user might make:
- *"What's this map called and how big is it?"*
- *"How many states are there?"*
- *"Summarize the current world."*

### Success criteria

1. `get_map_info()` returns a JSON string containing at least:
   - `mapName` (string | null)
   - `seed` (string | null)
   - `mapId` (number | null)
   - `dimensions` `{width, height}` — from `graphWidth`/`graphHeight`
   - `counts` — `{states, provinces, burgs, religions, cultures, rivers,
     markers, zones, cells}` (all excluding the 0-index "neutral" entry
     for the political sets that use it).
   - `year`/`era` from `window.options` if present.
2. When the map state isn't ready yet (`window.pack` undefined), the tool
   returns a structured error rather than throwing.
3. Unit tests confirm the structure with a fake state runtime.

## Scope

In-scope:
- New `get_map_info` tool using a `MapStateRuntime` injection seam.
- Unit tests.
- Registry wiring + README entry.

Out-of-scope:
- Listing individual entities (states/burgs/cultures) — those deserve
  dedicated tools with pagination.
- Any write operations.

## Design

New file: `src/ai/tools/get-map-info.ts`.

```ts
export interface MapStateRuntime {
  readState(): MapInfo | null;
}
```

The default runtime reads directly from `window.pack`, `window.grid`,
`window.seed`, `window.mapId`, `window.graphWidth/Height`,
`window.options`, `document.getElementById("mapName").value`. If
`window.pack` is absent, it returns `null`.

The tool's executor:
1. Calls `runtime.readState()`.
2. If `null`, returns `{isError: true, ...}` with a helpful message.
3. Otherwise stringifies the object as the tool result.

The returned counts subtract 1 when the array's 0-index is a neutral
placeholder (per the data model: `pack.states[0]` is the "no-state"
neutral entry, same for cultures/religions/provinces). Rivers, markers,
and zones are counted as-is.

## Files

Create:
- `plan_4.md`, `tasks_4.md`.
- `src/ai/tools/get-map-info.ts`.
- `src/ai/tools/get-map-info.test.ts`.

Modify:
- `src/ai/index.ts` — register + export.
- `README_AI.md` — tool table row.

## Testing plan

Unit (`src/ai/tools/get-map-info.test.ts`):

1. With a populated fake runtime → returns the expected JSON shape.
2. Counts subtract 1 for states/provinces/religions/cultures but NOT for
   rivers/markers/zones/cells.
3. Missing `mapName` / `year` fields → returned as `null` (no throw).
4. Runtime reports null → `{isError: true, ...}`.
5. Numeric fields correctly passed through (`mapId`, dimensions).
6. The JSON result is valid — we `JSON.parse` it in the test.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 shape  | `readState()` + executor | Test 1, 2, 6 |
| #2 error  | null → isError | Test 4 |
| #3 tests  | new vitest file | all tests |

Lint / build / test gates in tasks_4.md.
