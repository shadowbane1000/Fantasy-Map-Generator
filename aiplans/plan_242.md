# Plan 242 — `find_rivers_by_state`

## Goal

Add a new read-only AI tool `find_rivers_by_state` that lists every active
river flowing through a given state on the current map. Rivers don't carry a
`state` field directly — state association is derived via the river's
source-cell or mouth-cell state (`pack.cells.state[river.source]`,
`pack.cells.state[river.mouth]`).

## Use case

Parallels:

- `find_burgs_by_state` — state resolution pattern (shared `findEntityByRef`,
  rejects Neutrals placeholder at id 0).
- `find_rivers_by_basin` — river filter output shape
  (`{ i, name, type, source, mouth, length, discharge }`) and pure-scanner
  pattern.
- `find_rivers_in_area` — river filter with cell lookups on source / mouth.

The tool is the state-filtered, unpaginated companion to `list_rivers` for the
AI that wants every river flowing through a kingdom in one call.

## Behaviour

- Required `state`: numeric id (> 0) OR case-insensitive name / fullName,
  resolved via the shared `findEntityByRef`. `state === 0` (Neutrals
  placeholder) is rejected with a dedicated error, matching
  `find_burgs_by_state` / `find_markers_by_state`.
- Optional `limit`: integer in `[1, 100000]`, default `10000`. Caps the
  returned `rivers` array; `count` still reports the full unlimited total.
- Iterates `pack.rivers` linearly. For each river, skips:
  - `!r` / index-0 placeholder (`r.i === 0`) / `r.removed === true`
- Matches if **either** `pack.cells.state[river.mouth] === stateI`
  OR `pack.cells.state[river.source] === stateI`. This is an approximation
  vs a full-path scan: a river that merely passes through a state between its
  source and mouth without touching either endpoint cell will be missed.
  Documented in the tool description and the per-function JSDoc.
- Returns `{ ok, state: {i, name}, rivers: [...], count }` where each river is
  `{ i, name, type, source, mouth, length, discharge }`.

## Errors

- Map not ready (pack / pack.rivers / pack.cells / pack.cells.state missing) →
  `"Map is not ready yet. Wait for..."`
- `state === 0` → "Cannot list rivers for state 0 (the Neutrals placeholder)."
- Missing / invalid `state` → shared `parseEntityRef` error.
- Unresolvable `state` → `No state found matching <ref>.`
- Out-of-range `limit` → `limit must be an integer in [1, 100000].`

## Structure

`src/ai/tools/find-rivers-by-state.ts`:

1. Constants: `DEFAULT_FIND_RIVERS_BY_STATE_LIMIT = 10000`,
   `MAX_FIND_RIVERS_BY_STATE_LIMIT = 100000`.
2. `PackLike` interface: `rivers?: RawRiver[]`, `states?: RawState[]`,
   `cells?: { state?: Array<number | undefined> | number[] }`.
3. Types: `FindRiversByStateHit`, `FindRiversByStatePayload`,
   `FindRiversByStateResult`, `ResolvedState`, `ResolveStateResult`.
4. `resolveStateRefInPack(pack, ref)` — reuse `findEntityByRef`; 0 → "neutral".
5. `findRiversByStateInPack(pack, stateI, limit)` — pure scanner.
6. `FindRiversByStateRuntime` + `defaultFindRiversByStateRuntime` using
   `getPack<PackLike>()`.
7. `parseLimit`, then `createFindRiversByStateTool(runtime)` returning `Tool`.
8. Export `findRiversByStateTool = createFindRiversByStateTool()`.

`src/ai/tools/find-rivers-by-state.test.ts`: fakepack with states + rivers +
`cells.state`. Cover scanner, resolver, tool surface, `defaultRuntime`
integration (using `globalThis as unknown as { pack?: unknown }`).

## Registration

- Register in `src/ai/index.ts` right after `findRiversInAreaTool` (adjacent
  to sibling river-filter tools).
- Export all named symbols via the existing export block in `src/ai/index.ts`.

## README_AI.md

Insert a row just after the `find_rivers_in_area` row. Include API key note
and usage examples.

## Non-goals

- Not paginated (matches `find_rivers_in_area` / `find_rivers_by_basin`).
- Not mutating (read-only).
- No full path scan (intentionally approximate — matches `find_nearest_river`
  in how it trades completeness for predictable cost).
