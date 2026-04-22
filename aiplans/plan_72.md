# Plan 72 — list_diplomacy AI tool

## Use case

The Diplomacy Editor shows a matrix of all state-to-state
relationships. Each `pack.states[i].diplomacy[j]` holds a
relation string (Ally, Enemy, Vassal, etc.) plus "x" for self /
Neutrals. Users browse this to understand alliances before
declaring war or forging alliances.

The chat has `set_diplomacy` (plan 71) but no way to read
diplomacy. Prompts like "who is Rookhold allied with?", "list
all ongoing wars", or "which states are vassals?" can't land.

## Scope

Add one tool: `list_diplomacy`.

Flatten the matrix into pair records. Each entry reports:

- `state_a` `{ i, name }`
- `state_b` `{ i, name }`
- `relation` (`state_a`'s view — same as the editor's matrix cell)

Pagination. Optional filters:
- `state` — id or case-insensitive name; restrict entries to pairs
  that include this state.
- `relation` — case-insensitive exact match (via
  `resolveRelation`). Only pairs where `state_a`'s view matches
  are returned.
- `exclude_neutral` (boolean, default `true`) — skip "Neutral",
  "Unknown", "x" entries so the list defaults to meaningful
  relationships only.

To avoid double-counting, iterate `(a, b)` with `a < b` (one entry
per pair). The relation reported is `states[a].diplomacy[b]`
(the same value that the matrix shows for that cell). Note: the
symmetric counterpart is implicit (Vassal on one side means
Suzerain on the other).

## Implementation

1. **New file `src/ai/tools/list-diplomacy.ts`**:
   - Imports: `createPaginatedListTool`, `getPack`, `isActive`,
     type `RawState`.
   - Reuse `BurgPackLike`, `resolveStateRefInPack` from
     `./list-burgs`; `resolveRelation` from `./set-diplomacy`.
   - `DiplomacyPair { state_a: {i, name}, state_b: {i, name},
     relation: string | null }`.
   - `readDiplomacyFromPack(pack)`:
     - Return null if `pack?.states` missing.
     - Walk pairs with `a < b`, skip removed states, skip id 0
       (Neutrals) — or include if `exclude_neutral` filter
       chooses; keep it simple: always skip Neutrals here; the
       exclude_neutral option applies to the *relation value*
       "Neutral"/"Unknown"/"x".
     - Extract `states[a].diplomacy?.[b] ?? null`.
     - Emit `DiplomacyPair`.
   - `DiplomacyRuntime { readDiplomacy(): DiplomacyPair[] | null;
     resolveStateRef(ref): number | null }`.
   - Paginated tool via `createPaginatedListTool`:
     - `inputSchema`: limit, offset, state, relation,
       exclude_neutral.
     - `applyFilters`:
       - If state supplied: resolve; error if unresolved; filter
         pairs whose state_a.i or state_b.i matches.
       - If relation supplied: resolve via resolveRelation;
         error if unknown; filter.
       - If exclude_neutral (default true): drop pairs whose
         relation is in `{"Neutral", "Unknown", "x", null}`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/list-diplomacy.test.ts`**:
   - `readDiplomacyFromPack`:
     - null when pack.states missing.
     - Walks pairs a<b, skips id 0, skips removed.
     - Reports relations correctly.
   - Tool:
     - Default (exclude_neutral true) skips Neutral/Unknown/x.
     - exclude_neutral:false keeps them.
     - state filter by id or name.
     - relation filter (with alias).
     - Unknown state filter → error.
     - Unknown relation → error.
     - Rejects invalid filter types.
     - Pagination.
   - Default-runtime integration: live pack with 3 states, one
     diplomacy matrix → verify shape.

4. **README_AI.md** — row under `set_diplomacy`.

## Verification

- `npm test -- --run src/ai/tools/list-diplomacy` green.
- `npm test -- --run` — 881 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- AI can query "which states are at war?" or "who is Ashholm
  allied with?" and get a concise list.
- Pair-level dedup (a < b) keeps the output half the size of
  the raw matrix.
- Default skips Neutral to keep signal high.
