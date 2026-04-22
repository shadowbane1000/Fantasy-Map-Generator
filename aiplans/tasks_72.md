# Tasks 72 — list_diplomacy AI tool

## Task 1 — Pair-reading helper

- [ ] `readDiplomacyFromPack(pack)` in
  `src/ai/tools/list-diplomacy.ts`:
  - null when `pack?.states` missing.
  - Walk active states skipping id 0 (Neutrals).
  - For each pair `(a, b)` with `a.i < b.i`, emit
    `{ state_a: {i, name}, state_b: {i, name}, relation:
    states[a].diplomacy?.[b.i] ?? null }`.

## Task 2 — Tool

- [ ] `DiplomacyPair` type exported.
- [ ] `DiplomacyListRuntime { readDiplomacy(): DiplomacyPair[] |
  null; resolveStateRef(ref): number | null }`.
- [ ] `defaultDiplomacyListRuntime` wiring globals.
- [ ] `createPaginatedListTool<DiplomacyPair, DiplomacyFilters>`:
  - schema: limit, offset, state (int|string), relation (string),
    exclude_neutral (bool, default true).
  - parseFilters validates each.
  - applyFilters:
    - `stateId = null`; if stateRef provided → resolveStateRef; if
      null → error.
    - resolveRelation when relation provided.
    - default exclude_neutral=true → drop pairs whose relation is
      "Neutral" / "Unknown" / "x" / null.
    - state filter → keep when either side matches.
    - relation filter → exact match on the canonical resolved
      value (case-sensitive by this point).
  - echo `{ filters: { state: stateId, relation: canonical,
    exclude_neutral } }`.

## Task 3 — Register

- [ ] Import + barrel re-export + register in `src/ai/index.ts`.

## Task 4 — Tests

- [ ] Pair-helper:
  - null pack.
  - Walks only a < b pairs.
  - Skips id 0.
  - Skips removed states.
- [ ] Tool:
  - Default exclude_neutral true: skips Neutral/Unknown/x.
  - exclude_neutral:false: includes them.
  - State filter by id / by name.
  - Relation filter canonical + alias.
  - Unknown state/relation → error.
  - Invalid filter types → error.
  - Pagination.
- [ ] Default-runtime integration with 3 states + diplomacy
  matrix. Assert shape via live tool call.

## Task 5 — README

- [ ] Row under `set_diplomacy`:
  ```
  | `list_diplomacy`        | List diplomatic relationships between states — the same matrix the Diplomacy Editor displays. Each entry is a unique pair `(state_a, state_b)` with the relation from `state_a`'s view. Paginated. Optional filters: `state` (id or name — keeps only pairs touching that state), `relation` (Ally / Enemy / Vassal / … or aliases), `exclude_neutral` (default true — drops Neutral/Unknown/x pairs so only meaningful relations show). | "Who is Rookhold allied with?", "List all ongoing wars", "Which states are vassals?" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/list-diplomacy` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add list_diplomacy tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Tasks 1, 2.
- Plan step 2 → Task 3.
- Plan step 3 → Task 4.
- Plan step 4 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Diplomacy Editor matrix, AI-unreadable.
- Plan flattens the matrix into unique pairs (a<b) — the user
  sees one cell per pair too (the matrix is symmetric save for
  the Vassal/Suzerain asymmetry). The emitted relation is
  `state_a`'s view.
- Default `exclude_neutral=true` keeps the output focused on
  interesting relationships, matching how a user scans the
  editor visually (Neutral cells fade into the background).

## Verification that tests prove the use case

- Pair-helper tests validate the a<b walk and Neutrals skip.
- Tool tests validate every filter branch + pagination.
- Integration test proves live-globalThis wiring.
