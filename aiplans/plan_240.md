# Plan 240 — `find_markers_by_state`

## Goal

Add a new read-only AI tool `find_markers_by_state` that lists every active
marker (point of interest) whose underlying cell belongs to a given state.
Markers don't carry a `state` field directly — the state of a marker is
derived from `pack.cells.state[marker.cell]`.

## Use case

Parallels:

- `find_burgs_by_state` — state resolution pattern (shared `findEntityByRef`,
  rejects Neutrals placeholder at id 0).
- `find_burgs_by_religion` — cell-indirection filter pattern
  (`pack.cells.<attr>[entity.cell]`).
- `find_markers_by_type` — marker enumeration / output shape
  (`{i, type, icon, x, y, cell}` per hit).

The tool is the state-filtered, unpaginated companion to `list_markers`.

## Behaviour

- Required `state`: numeric id (> 0) OR case-insensitive name / fullName,
  resolved via the shared `findEntityByRef`. `state === 0` (Neutrals
  placeholder) is rejected with a dedicated error, matching
  `find_burgs_by_state`.
- Optional `limit`: integer in `[1, 100000]`, default `10000`. Caps the
  returned `markers` array; `count` still reports the full unlimited total.
- Iterates `pack.markers` linearly. For each marker, skips:
  - `!m` / index-0 placeholder (`m.i === 0`) / `m.removed === true`
  - markers with non-integer / out-of-bounds `m.cell`
  - markers whose `pack.cells.state[marker.cell] !== stateI`
- Returns `{ ok, state: {i, name}, markers: [...], count }` where each marker
  is `{ i, type, icon, x, y, cell }` — same shape as `find_markers_by_type`.

## Errors

- Map not ready (pack / pack.markers / pack.cells.state missing) →
  `"Map is not ready yet. Wait for..."`
- `state === 0` → "Cannot list markers for state 0 (the Neutrals placeholder)."
- Missing / invalid `state` → shared parseEntityRef error.
- Unresolvable `state` → `No state found matching <ref>.`
- Out-of-range `limit` → `limit must be an integer in [1, 100000].`

## Structure

`src/ai/tools/find-markers-by-state.ts`:

1. Constants: `DEFAULT_FIND_MARKERS_BY_STATE_LIMIT = 10000`,
   `MAX_FIND_MARKERS_BY_STATE_LIMIT = 100000`.
2. `PackLike` interface: `markers?: RawMarker[]`, `states?: RawState[]`,
   `cells?: { state?: Array<number | undefined> | number[] }`.
3. Types: `FindMarkersByStateHit`, `FindMarkersByStatePayload`,
   `FindMarkersByStateResult`, `ResolvedState`, `ResolveStateResult`.
4. `resolveStateRefInPack(pack, ref)` — reuse `findEntityByRef`; 0 → "neutral".
5. `findMarkersByStateInPack(pack, stateI, limit)` — pure scanner.
6. `FindMarkersByStateRuntime` + `defaultFindMarkersByStateRuntime` using
   `getPack<PackLike>()`.
7. `parseLimit`, then `createFindMarkersByStateTool(runtime)` returning `Tool`.
8. Export `findMarkersByStateTool = createFindMarkersByStateTool()`.

`src/ai/tools/find-markers-by-state.test.ts`: fakepack with states + markers +
cells.state. Cover scanner, resolver, tool surface, defaultRuntime integration
(using `globalThis as unknown as { pack?: unknown }`).

## Registration

- Register in `src/ai/index.ts` right after `findMarkersByTypeTool`.
- Export all named symbols via the existing export block in `src/ai/index.ts`.

## README_AI.md

Insert a row just after the `find_markers_by_type` row. Include API key note.

## Non-goals

- Not paginated (matches find_markers_by_type unpaginated + count).
- Not mutating (read-only).
- No spatial filter.
