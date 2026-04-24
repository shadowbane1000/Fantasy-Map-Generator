# Plan 273 — `find_orphan_entities` AI tool

## Goal

Add a new read-only AI tool `find_orphan_entities` that scans `pack` for entities with broken parent references. This is a consistency-check tool — useful after bulk edits (remove_state, remove_culture, merge_states, etc.) to surface dangling references that could otherwise corrupt downstream renderers or editors.

## Use case

Answer questions like:

- "Are there any states whose capital burg doesn't exist?"
- "Find provinces whose state was removed."
- "Do any burgs point to an unknown culture?"
- "List religions whose linked culture was deleted."
- "Run a consistency check on the map."

## Contract

- Accepts no required parameters (empty object).
- Iterates every active entity (index > 0, not `removed: true`) across `pack.states`, `pack.provinces`, `pack.burgs`, `pack.religions` and flags:
  - `state.capital` — when set to a positive number, the burg must exist in `pack.burgs`, not be `removed: true`, and not be `i === 0` (the placeholder).
  - `province.state` — must be a positive number; `pack.states[province.state]` must exist, not be `removed: true`, not be `i === 0`. `0` is treated as an orphan (province assigned to Neutrals — unusable).
  - `province.burg` — when set to a positive number, the burg must exist and not be `removed: true`. `0` / unset is NOT orphan (provinces often have no capital).
  - `burg.state` — must be either `0` (Neutrals, which is a valid "unassigned" state marker for burgs) OR reference an existing, non-removed state with `i > 0`.
  - `burg.culture` — must reference an existing entry in `pack.cultures`. Unlike other fields, culture `0` (Wildlands) is a valid real culture, so `0` is allowed. Only flag when the index is out of range or the slot is `undefined`.
  - `religion.culture` — when set (typeof number), `pack.cultures[religion.culture]` must exist. `undefined` / missing is NOT orphan.
- Each issue is recorded as `{ entity_type: "state" | "province" | "burg" | "religion", i: number, name: string | null, issue: string }` where `issue` is a short human-readable diagnostic.
- Returns `{ ok: true, orphans: [...], count: <orphans.length> }`.
- When `pack` / the required collections (`states`, `provinces`, `burgs`, `religions`) are missing, returns `not-ready` (mapped to a structured error at the tool surface).
- A clean map returns `{ ok, orphans: [], count: 0 }` — still `ok: true`.

## Design

Mirrors the existing runtime-seam pattern from `find-orphan-cells.ts` / `find-adjacent-entities.ts`:

1. Pure collector `findOrphanEntitiesInPack(pack)` — deterministic function from a pack-like shape to `OrphanEntitiesResult | "not-ready"`.
2. `FindOrphanEntitiesRuntime` seam + `defaultFindOrphanEntitiesRuntime` reading the live `window.pack` via `getPack<FindOrphanEntitiesPackLike>()`.
3. `createFindOrphanEntitiesTool(runtime)` factory producing the `Tool` and the default module-level `findOrphanEntitiesTool` constant.

Reuses `RawState` / `RawBurg` / `RawCulture` / `RawProvince` / `RawReligion` from `_shared/pack-types`. No new shared constants are introduced (no duplicate exports).

Output is sorted for deterministic test output: first by `entity_type` (alphabetical: `burg`, `province`, `religion`, `state`), then by `i` ascending.

## Files

- New `src/ai/tools/find-orphan-entities.ts` — runtime, collector, tool factory, default instance.
- New `src/ai/tools/find-orphan-entities.test.ts` — pure-collector suite, tool-surface suite, and a `defaultFindOrphanEntitiesRuntime (integration)` block that stubs `globalThis.pack` (with `as unknown as { pack?: unknown }` cast) to exercise the default seam.
- Edit `src/ai/index.ts`:
  - Import `findOrphanEntitiesTool` alongside other `find-*` imports.
  - Re-export all new public members (type-only + values).
  - `registry.register(findOrphanEntitiesTool)` near `findOrphanCellsTool`.
- Edit `README_AI.md`: add one tool row near `find_adjacent_entities`, including the "Requires an Anthropic API key" pointer.

## Tests

Pure collector:

- clean pack returns empty orphans
- state.capital pointing at out-of-range burg id → orphan
- state.capital pointing at removed burg → orphan
- state.capital === 0 is NOT orphan (explicit "no capital")
- province.state === 0 is orphan
- province.state pointing at removed state → orphan
- province.state pointing at out-of-range id → orphan
- province.burg pointing at removed burg → orphan
- province.burg === 0 / missing is NOT orphan
- burg.state === 0 is NOT orphan (Neutrals valid for burgs)
- burg.state pointing at removed / missing state → orphan
- burg.culture pointing at out-of-range id → orphan
- burg.culture === 0 is NOT orphan (Wildlands valid)
- religion.culture === undefined is NOT orphan
- religion.culture pointing at out-of-range id → orphan
- removed entities themselves are skipped (not scanned)
- index-0 placeholders themselves are skipped
- sort order: deterministic alphabetical entity_type, then by i
- returns `"not-ready"` when pack / required collections missing

Tool surface:

- ok payload with count and orphans[]
- extra input tolerance (unknown keys ignored)
- structured not-ready error
- schema matches no-required form

Integration (`defaultFindOrphanEntitiesRuntime`):

- stubs `globalThis.pack` and verifies the runtime path finds a seeded orphan.
- restores pack in `afterEach`.
