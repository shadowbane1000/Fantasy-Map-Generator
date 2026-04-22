# Plan 29 — Use Case: List rivers

## Status

Iteration 29. 28 AI tools. Baseline 7 warnings / 1 info / 0 errors.
360 tests pass.

## Use Case

**"List the rivers on the current map."**

The user sees these in the Rivers Overview panel. River data lives in
`pack.rivers` (see `src/modules/river-generator.ts:10-25`):

- `i`, `name`, `type` (e.g. "River", "Stream", "Flux")
- `length` (internal units), `discharge` (m³/s),
- `width`, `sourceWidth` (km)
- `source`, `mouth` (cell ids)
- `parent`, `basin` (river ids — basin is the root of the drainage)

Unlike states/cultures/etc., `pack.rivers` has no index-0 placeholder
convention: rivers are iterated directly in `rivers-overview.js:40`.

Prompts:
- *"List the rivers."*
- *"Which rivers are in the biggest drainage basin?"*
- *"Show me all rivers longer than 100 km."* (model does the size
  filter client-side after reading, but a `min_length` helper makes
  that cheaper.)

### Success criteria

1. `list_rivers()` returns a paginated JSON of rivers. Each entry:
   `{i, name, type, length, discharge, width, sourceWidth, source,
   mouth, parent, basin, basinName}`.
2. `basinName` is resolved via the basin river's own `name` (null
   when not found).
3. Skips any river with `removed: true` (defensive).
4. Optional `basin` filter — numeric river id or case-insensitive
   river name (matches the basin river). All tributaries of the
   matched basin are included.
5. Optional `min_length` / `min_discharge` — non-negative numbers.
6. Paginated: limit 1–500 (default 100), offset ≥ 0.
7. Graceful error when `pack.rivers` is missing.

## Scope

In-scope:
- `list_rivers` tool via `createPaginatedListTool`.
- Pure `readRiversFromPack(pack)` helper.
- Registry + README + tests.

Out-of-scope:
- Editing rivers (rename, reroute, delete).
- Exporting river geometry.

## Design

New file: `src/ai/tools/list-rivers.ts`.

```ts
export interface RiverSummary {
  i: number;
  name: string;
  type: string | null;
  length: number;
  discharge: number;
  width: number;
  sourceWidth: number;
  source: number;
  mouth: number;
  parent: number;
  basin: number;
  basinName: string | null;
}
export interface RiversRuntime {
  readRivers(): RiverSummary[] | null;
}
```

Default runtime reads `window.pack.rivers`. The pure helper builds
an id→name lookup map first pass, then maps each river and fills in
`basinName`.

Filters in `parseFilters`:
- `basin?: number | string` — numeric id OR case-insensitive name
  match on ANY river (resolves to that river's id, which is then
  treated as the basin id for filtering).
- `min_length?: number` — non-negative.
- `min_discharge?: number` — non-negative.

## Files

Create: `plan_29.md`, `tasks_29.md`,
`src/ai/tools/list-rivers.ts`,
`src/ai/tools/list-rivers.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-rivers.test.ts`):

1. Full list default paging.
2. Paging honored.
3. Invalid paging rejected.
4. `basin: <id>` filters rivers with matching `basin`.
5. `basin: "<name>"` — resolves to the named river's id, filters by
   that.
6. Unknown basin ref → error.
7. `min_length: 50` filters shorter rivers out.
8. `min_discharge: 10` filters low-flow rivers out.
9. Runtime null → error.
10. Rejects bad filter types.

Pure helper tests:

11. `readRiversFromPack` resolves `basinName` from the basin river's
    own name; null when the basin id isn't present.
12. Skips `removed` rivers.
13. Returns null when pack/rivers missing.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Reuses `createPaginatedListTool`. Tool
file ~180 lines.

Lint / test / build gates in tasks_29.md.
