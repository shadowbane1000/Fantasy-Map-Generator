# Plan 71 — set_diplomacy AI tool

## Use case

The Diplomacy Editor (`public/modules/ui/diplomacy-editor.js:296`)
writes `pack.states[a].diplomacy[b] = newRelation` and mirrors the
reverse side (Vassal ↔ Suzerain, else mirrored). The relation
catalogue is: Ally, Friendly, Neutral, Suspicion, Enemy, Unknown,
Rival, Vassal, Suzerain.

The chat has no diplomacy surface — no way to read it (future
tool: `list_diplomacy`) and no way to set relations. Writing is
the more impactful first step: "make Rookhold an ally of
Ashholm", "declare war" etc. are natural prompts.

## Scope

Add one tool: `set_diplomacy(state_a, state_b, relation)`.

- `state_a`, `state_b` — id or case-insensitive name/fullName via
  `resolveStateRefInPack`. Must resolve to two distinct active
  states with id > 0 (Neutrals is skipped).
- `relation` — one of the 9 canonical values (case-insensitive,
  with a few common aliases: "at war" → Enemy, "allied" → Ally,
  "friend" → Friendly, "unknown" stays Unknown).
- Writes symmetric pair:
  - `states[a].diplomacy[b] = relation`.
  - `states[b].diplomacy[a] = reverseRelation` (Vassal → Suzerain;
    Suzerain → Vassal; else the same).
- No history-chronicle updates (the UI emits long prose entries
  about war declarations — that's the editor's own flavour, not
  strictly required for the data model).

## Implementation

1. **New file `src/ai/tools/set-diplomacy.ts`**:
   - Imports: `createAliasResolver`, `errorResult`, `getPack`,
     `okResult`, type `RawState`.
   - Reuse `BurgPackLike`, `resolveStateRefInPack` from
     `./list-burgs`.
   - `DIPLOMACY_RELATIONS = ["Ally", "Friendly", "Neutral",
     "Suspicion", "Enemy", "Unknown", "Rival", "Vassal",
     "Suzerain"] as const`.
   - `resolveRelation` via `createAliasResolver` with aliases:
     "at war" → Enemy, "allied" → Ally, "friend" → Friendly.
   - `reverseRelation(rel)`: Vassal → Suzerain, Suzerain →
     Vassal, else same.
   - `DiplomacyRef { aId, aName, bId, bName, previousRelation }`.
   - `DiplomacyRuntime { find, apply }`.
   - `defaultDiplomacyRuntime.find(aRef, bRef)`:
     - Resolve each via resolveStateRefInPack; null if either
       fails OR either is 0 (Neutrals).
     - Look up live states; skip if removed.
     - Return IDs/names and the current a→b relation (`states[a]
       .diplomacy?.[b] ?? null`).
   - `defaultDiplomacyRuntime.apply(aId, bId, relation)`:
     - Walk `pack.states`; ensure states[a] and states[b] have
       `.diplomacy` arrays (initialize if missing? — safer: throw
       if missing to avoid corrupting shape).
     - Write both sides.
   - Tool schema: `state_a`, `state_b` (int|string required),
     `relation` (string required).
   - Execute: validate refs + relation; refuse a===b; find → 404;
     try apply; return `{ state_a: {i, name}, state_b: {...},
     previousRelation, relation, reverseRelation }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests**:
   - Runtime-injected:
     - Sets symmetric relation (Ally → Ally).
     - Vassal → Suzerain mirror.
     - Suzerain → Vassal mirror.
     - Alias resolution ("at war", "allied").
     - Rejects invalid refs / same a===b.
     - Rejects unknown relation.
     - Rejects Neutrals-as-either-party.
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.pack.states` with 3 states (Neutrals + 2
       active) with `diplomacy` arrays.
     - Apply Ally between 1 & 2 → both slots updated.
     - Vassal between 1 & 2 → states[1].dip[2] = Vassal,
       states[2].dip[1] = Suzerain.
     - Error when diplomacy arrays are missing.

4. **README_AI.md** — row near `set_entity_lock`.

## Verification

- `npm test -- --run src/ai/tools/set-diplomacy` green.
- `npm test -- --run` — 865 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can update diplomatic relations symmetrically in one call.
- Aliases for natural prompts are accepted.
- Neutrals state (id 0) protected from appearing as a
  diplomacy target.
