# Plan 50 — list_regiments AI tool

## Use case

Each state in `pack.states[*].military` carries an array of
`MilitaryRegiment` records (name, total troops, x/y/cell, unit
composition, naval flag, type, icon). The Military Overview
(`public/modules/ui/military-overview.js`) iterates these to show
troop counts per state and per regiment.

The AI chat currently has no way to enumerate regiments. Narrative
questions like "which states have the most troops?", "are there any
fleets off the western coast?", or "what's the composition of
Rookholm's largest army?" need to hit `state.military` — but since
it's a per-state nested array (not a flat pack collection), none of
the existing list tools surface it.

## Scope

Add one tool: `list_regiments`. Flattens every state's `military[]`
into one list keyed by `regiment.i`, annotated with `state` /
`stateId`. Paginated (limit/offset). Optional filters:
- `state` — id or case-insensitive state name/fullName (reuses
  `resolveStateRefInPack`).
- `type` — regiment type filter (case-insensitive exact match, e.g.
  "army", "fleet", "guard").
- `naval_only` — boolean; if true keep only `n === 1` regiments
  (fleets).
- `min_total` — numeric threshold on `regiment.t`.

Each summary reports: `i`, `name`, `stateId`, `state` (name), `type`,
`total` (= `t`), `army`, `cell`, `x`, `y`, `naval`, `units` (the raw
`u` map of unit-name → count).

## Implementation

1. **Extend `src/ai/tools/_shared/pack-types.ts`**:
   - Add `RawRegiment { i: number; name?: string; t?: number; a?: number;
     u?: Record<string, number>; n?: number; type?: string; cell?:
     number; x?: number; y?: number; state?: number; icon?: string }`.
   - Extend `RawState` with `military?: RawRegiment[]`.
   - Re-export `RawRegiment` from the `_shared` barrel.

2. **New file `src/ai/tools/list-regiments.ts`**:
   - Imports: `createPaginatedListTool`, `getPack`, `RawRegiment`,
     `RawState` from `_shared`; `resolveStateRefInPack` from
     `./list-burgs` (already exported).
   - `RegimentSummary` type (see Scope above).
   - `RegimentPackLike { states?: RawState[]; burgs?: unknown /* for
     resolveStateRefInPack */ }` — reuse `BurgPackLike`'s shape
     subset. Actually, `resolveStateRefInPack` only looks at states;
     keep our pack-like minimal.
   - `readRegimentsFromPack(pack)`: flatten; skip removed states and
     `military` arrays that are null/empty; each regiment →
     `RegimentSummary` with `state: states[stateId]?.name ?? null`.
   - `RegimentsRuntime { readRegiments(): RegimentSummary[] | null;
     resolveStateRef(ref: number | string): number | null }`.
   - `defaultRegimentsRuntime` wired to globals.
   - Tool factory via `createPaginatedListTool` — mirrors list-burgs
     filter plumbing for `state` + structured filter object.

3. **Register** in `src/ai/index.ts`: import, barrel export, register
   between `listRiversTool` and `listRoutesTool` (or any other list
   placement; order doesn't affect functionality).

4. **Tests `src/ai/tools/list-regiments.test.ts`**:
   - Returns a flat list across multiple states.
   - Annotates `state` with the state name.
   - Skips states with no `military` or an empty military.
   - Skips removed states.
   - `state` filter by id.
   - `state` filter by case-insensitive name (runtime
     `resolveStateRef` called with the raw string).
   - Unknown state filter returns an error body.
   - `type` filter case-insensitive.
   - `naval_only` filter.
   - `min_total` filter.
   - Pagination (limit, offset).
   - Rejects invalid input types.
   - `not ready` error when `pack.states` missing.

5. **Default-runtime smoke test** — mount `globalThis.pack` with two
   states (one with regiments, one without) and verify the flatten.

6. **README_AI.md** — new row under `list_routes`.

## Verification

- `npm test -- --run src/ai/tools/list-regiments` green.
- `npm test -- --run` — full suite green (611 before).
- `npm run lint` — 7 / 1 baseline unchanged. (Double-check the new
  file for optional-chain / literal-keys lint patterns.)
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can ask "list fleets", "show Rookholm's military", "any armies
  bigger than 5k troops?" and get a structured response drawn from
  the same `state.military` data the Military Overview reads.
- Per-state filter works by id OR case-insensitive name.
- Regiments without explicit `i` (shouldn't happen in practice but
  defensive) don't blow up the flatten.
