# Plan 187 — `get_river_info` tool

## Goal

Add a read-only AI tool that returns detailed info for a single river — the
per-river parallel of `get_burg_info` / `get_state_info` / `get_religion_info`
/ `get_culture_info`.

## Motivation

Rivers are first-class entities in `pack.rivers`. The existing river tools
(`list_rivers`, `rename_river`, `remove_river`, `set_river_type`,
`set_river_width`, `regenerate_river_names`) let the AI list / mutate rivers,
but there is no single-river inspect tool. `list_rivers` emits a compact
summary per row; a chat workflow that wants to describe "the Ashwater River"
in depth currently has to scan the list or piece things together from
`get_cell_info` calls against the mouth / source cells. A dedicated
`get_river_info` closes that gap and matches the pattern used for every other
entity type.

## Source of truth

- `pack.rivers: RawRiver[]` — each river carries `i`, `name`, `type`,
  `length`, `discharge`, `width`, `sourceWidth`, `widthFactor`, `source` (cell
  id), `mouth` (cell id), `parent` (river id), `basin` (river id),
  `cells: number[]` (optional — when present, the list of packed-grid cells
  the river flows through).
- `pack.cells.p: [x, y][]` — coordinates of the source / mouth cells.
- `pack.cells.r: number[]` — cell-to-river assignment; counting
  `cells.r[k] === river.i` gives a fallback cell count when `river.cells` is
  absent.
- River ids are **non-contiguous**: the generator skips removed rivers, so
  `pack.rivers[5]` may not have `i === 5`. This rules out
  `findEntityByRef` (which does `entries[ref]`); we re-use
  `findRiverByRef` from `rename-river.ts` (already handles numeric-id and
  case-insensitive name lookup, skipping `removed: true`).

## Output shape

```ts
interface RiverInfo {
  i: number;
  name: string;
  type: string | null;
  parent: { id: number; name: string | null } | null; // null if unset or self-reference
  basin: { id: number; name: string | null } | null;  // null if unset
  source: { cell: number; x: number | null; y: number | null } | null;
  mouth: { cell: number; x: number | null; y: number | null } | null;
  length: number;
  discharge: number; // m³/s
  widthFactor: number;
  cells: number; // count along the river
}
```

`parent` is omitted when `river.parent` is not set OR `river.parent === river.i`
(self-reference — rivers without a parent set `parent === i` in the generator).
Coordinates come from `pack.cells.p[cell]`; they are `null` when `cells.p` is
absent or out of range.

`cells` counts:
1. `river.cells.length` when `river.cells` is a non-empty array.
2. Otherwise, iterate `pack.cells.r` and count `=== river.i`.
3. Otherwise `0`.

## Errors / edge cases

- Missing / invalid `river` → `parseEntityRef` error.
- No pack or no `pack.rivers` → "Map is not ready yet…".
- River not found (unknown id, removed, or unmatched name) → structured
  "No river found matching …".
- River with `i <= 0` → treated as not-found.

## Runtime-seam pattern

Following the other `get_*_info` tools, we expose:

- `readRiverInfoFromPack(pack, ref): RiverInfo | "not-ready" | "not-found"` —
  pure, takes the pack shape directly.
- `RiverInfoRuntime` with `readRiverInfo(ref)` — isolates global access so the
  seam can be swapped in tests.
- `defaultRiverInfoRuntime` — uses `getPack<…>()` to hit live globals.
- `createGetRiverInfoTool(runtime?)` — returns a `Tool` object wired to the
  runtime.
- `getRiverInfoTool = createGetRiverInfoTool()` — default export the registry
  picks up.

## Registration

Insert `getRiverInfoTool` import / export in `src/ai/index.ts` near the other
`get_*_info` tools, and register it next to the other info tools in
`buildDefaultRegistry()`.

## Docs

Add a row to `README_AI.md`'s tool table adjacent to `get_burg_info`, noting
the schema, `findRiverByRef` lookup semantics (non-contiguous ids, name
match), output fields, error behavior, and Anthropic API key requirement.

## Testing

`get-river-info.test.ts` must cover:

- Pure `readRiverInfoFromPack` for a fully populated river (all fields).
- `parent === i` self-reference → `parent: null`.
- Unset `parent` / `basin` → `null`.
- Missing source / mouth / `cells.p` → `{cell, x: null, y: null}` or null.
- `cells` count: via `river.cells.length`, via `pack.cells.r` scan, or `0`.
- Non-contiguous id lookup (numeric) + case-insensitive name lookup.
- Removed river returns `"not-found"`.
- `i <= 0` returns `"not-found"`.
- Missing pack / missing `pack.rivers` returns `"not-ready"`.
- Tool rejects non-integer / empty / missing `river` refs with
  `parseEntityRef`'s message.
- Not-ready / not-found surface as structured `isError: true`.
- Default tool export has the expected schema.
- `defaultRiverInfoRuntime` integration: prime `globalThis.pack`, read a river,
  unset pack → not-ready, unknown id → not-found.
