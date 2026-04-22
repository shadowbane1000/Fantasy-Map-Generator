# Tasks 71 — set_diplomacy AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-diplomacy.ts`:
  - Imports: `createAliasResolver`, `errorResult`, `getPack`,
    `isActive`, `okResult`.
  - Reuse: `BurgPackLike`, `resolveStateRefInPack` from
    `./list-burgs`.
  - Constants:
    - `DIPLOMACY_RELATIONS = ["Ally","Friendly","Neutral",
      "Suspicion","Enemy","Unknown","Rival","Vassal","Suzerain"]
      as const`.
  - `resolveRelation` via createAliasResolver with:
    - "at war" / "war" → "Enemy"
    - "allied" → "Ally"
    - "friend" → "Friendly"
    - (canonical values are handled by the resolver automatically)
  - `reverseRelation(rel)`: `rel === "Vassal" ? "Suzerain" :
    rel === "Suzerain" ? "Vassal" : rel`.
  - Types:
    - `DiplomacyRef { aId, aName, bId, bName, previousRelation }`.
    - `DiplomacyRuntime { find, apply }`.
  - `defaultDiplomacyRuntime.find(aRef, bRef)`:
    - Resolve each via resolveStateRefInPack; null if either null
      or === 0.
    - Live-state lookup via pack.states[x]; null if missing /
      !isActive.
    - Return IDs, names, and `pack.states[aId].diplomacy?.[bId]`.
  - `defaultDiplomacyRuntime.apply(aId, bId, relation)`:
    - Get both states; throw if missing/inactive.
    - Require `state.diplomacy` is an array on both; else throw
      "State X has no diplomacy array; ensure the map is fully
      generated."
    - Write `states[a].diplomacy[b] = relation`,
      `states[b].diplomacy[a] = reverseRelation(relation)`.
  - Tool schema: `state_a` (int|string), `state_b` (int|string),
    `relation` (string).
  - Execute:
    - Validate refs (integer ≥ 1 OR non-empty string; ≥ 1 because
      Neutrals at 0 is excluded).
    - Validate `relation` is non-empty string, resolves via
      `resolveRelation` (otherwise error with supported list).
    - find → 404.
    - Reject if aId === bId.
    - Try apply; return `{ state_a: {i, name}, state_b: {...},
      previousRelation, relation, reverseRelation }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register in `src/ai/index.ts`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-diplomacy.test.ts`:
  - Runtime-injected:
    - Symmetric Ally.
    - Vassal → Suzerain mirror.
    - Suzerain → Vassal mirror.
    - Alias "at war" → "Enemy"; "allied" → "Ally"; "friend" →
      "Friendly".
    - Rejects invalid refs (null, 0, -1, 1.5, "").
    - Rejects same-state pair (a === b).
    - Rejects unknown relation.
    - Error when state resolution fails.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.states` with neutrals + 2 states each
      with diplomacy arrays of length 3.
    - Apply Ally 1↔2 → both slots updated.
    - Vassal 1 on 2 → states[1].dip[2]="Vassal",
      states[2].dip[1]="Suzerain".
    - State refusing to resolve (Neutrals) → error.
    - State with no diplomacy array → error.

## Task 4 — README

- [ ] Row under `set_entity_lock`:
  ```
  | `set_diplomacy`         | Set the diplomatic relation between two states (same as the Diplomacy Editor). Writes `pack.states[a].diplomacy[b]` and its symmetric counterpart (Vassal ↔ Suzerain, otherwise mirrored). Relations: Ally / Friendly / Neutral / Suspicion / Enemy / Unknown / Rival / Vassal / Suzerain. Aliases: "at war" → Enemy, "allied" → Ally, "friend" → Friendly. Neutrals (state 0) is protected. | "Rookhold and Ashholm are now allies", "Declare war on state 3", "Make state 1 a vassal of state 2" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-diplomacy` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_diplomacy tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Diplomacy Editor writes; AI can't.
- Plan writes both symmetric slots the UI writes
  (`states[a].diplomacy[b]` and its mirror). The
  Vassal↔Suzerain asymmetry is preserved. History-chronicle
  updates (prose entries in states[0].diplomacy) are an
  editor-flavoured UX nicety — omitted from the tool so the
  response stays simple; Diplomacy Editor will display the new
  relation on next open.

## Verification that tests prove the use case

- Runtime-injected tests exercise validation + dispatch + the
  Vassal ↔ Suzerain reverse mapping.
- Integration test proves both live `state.diplomacy[]` arrays
  are updated.
- Guard tests: same-state pair + Neutrals refusal keep footguns
  out.
