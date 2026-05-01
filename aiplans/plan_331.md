# Plan 331: `reset_state_diplomacy` tool

## Use case

Add an AI chat tool `reset_state_diplomacy` that resets a single specific
state's diplomatic relations with every other state to `"Neutral"`,
mirroring the change on the counterpart side. This mirrors the legacy
`resetRelations` function in `public/modules/ui/diplomacy-editor.js`:

```js
function resetRelations() {
  const selectedId = +body.querySelector("div.Self")?.dataset?.id;
  if (!selectedId) return;
  const states = pack.states;

  states[selectedId].diplomacy.forEach((relations, index) => {
    if (relations !== "x") {
      states[selectedId].diplomacy[index] = "Neutral";
      states[index].diplomacy[selectedId] = "Neutral";
    }
  });

  refreshDiplomacyEditor();
}
```

The user can already trigger this via the **Reset** button in the
Diplomacy editor (visible when one state is the "Self"); the AI chat had
no equivalent until now.

We already have:

- `regenerate_diplomacy` (plan 328 — re-randomizes ALL relations between
  EVERY state pair)
- `set_diplomacy` (sets a single relation between two specific states)
- `list_diplomacy`
- `get_diplomacy_between`

This plan adds the missing **clear-one-state's-relations** action.

## Lint baseline

`npm run lint 2>&1 | tail -50` on the worktree base (master @ 182fd5c,
branch `plan-331-reset-state-diplomacy`, working tree clean) reports:

```
Checked 765 files in 611ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- Resolve the `state` ref (id or name/fullName) to a single non-removed
  active state with `i > 0`. Use the existing `resolveStateRefInPack`
  helper from `list-burgs.ts` (same one `set-diplomacy.ts` uses).
- For each index `j` in `state.diplomacy`:
  - Skip if `state.diplomacy[j] === "x"` (the diagonal sentinel and the
    sentinel for any pair involving the neutral / a removed state — see
    states-generator.ts:413).
  - Skip if `j === state.i` (defensive — also guarded by the `"x"`
    check).
  - Skip if `pack.states[j]` does not exist, is `removed`, or has
    `j <= 0` (the neutral state 0 placeholder).
  - Skip if `pack.states[j].diplomacy` is not an array (can't mirror
    the write).
  - If `state.diplomacy[j] !== "Neutral"`, set both
    `state.diplomacy[j] = "Neutral"` and
    `pack.states[j].diplomacy[state.i] = "Neutral"`. Track the previous
    value plus `{ i, name }` of the other state in `changes`.
  - If `state.diplomacy[j] === "Neutral"` already, do not write and do
    not record a change (idempotent — matches "Reset" semantics).
- Do NOT touch the `"x"` diagonal.
- Do NOT touch state 0 (the Neutrals placeholder).
- Do NOT touch entries for removed states.
- No SVG redraw is required. Diplomacy data is not on-canvas — only the
  editor matrix shows it, and that only exists while the editor is
  open. (The legacy `refreshDiplomacyEditor()` is a popup-only DOM
  refresh — not exposed globally; if the popup is open the user can
  refresh it manually. Mirrors the precedent set by `regenerate_diplomacy`
  and `set_diplomacy`.)

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "state": {
      "type": ["integer", "string"],
      "description": "Numeric state id (> 0) or the state's current name."
    }
  },
  "required": ["state"]
}
```

### Validation

- `state` ref must be a positive-integer id or a non-empty string.
- `state` ref must resolve to an active state (`i > 0`, not `removed`).
- The neutral / state 0 is rejected explicitly with its own message.
- A removed state ref is rejected explicitly with its own message.
- `pack.states` must exist (otherwise the ref cannot resolve and the
  generic not-found error fires).
- `state.diplomacy` must be an array. If it is missing or not an array
  we treat it as **`okResult` with empty `changes`**, on the principle
  that "no relations to reset" is a successful no-op rather than an
  error. This matches the spirit of the legacy `resetRelations` (which
  silently does nothing when the array is empty) and avoids surfacing
  spurious failures on partially-loaded maps. The result still includes
  the resolved `state: { i, name }` so the caller can confirm the
  identity it acted upon.

### Errors (verbatim)

Consistent with `set_diplomacy` wording where applicable:

- `"state must be a positive integer id or a non-empty name string."`
  — invalid input shape (pre-resolution).
- `"State ${ref} not found."` — ref doesn't resolve to any state.
- `"Cannot reset diplomacy for state 0 (the Neutrals placeholder)."`
  — caller passed `0` explicitly (only reachable if the validator
  accepted it, which it currently does NOT — but we still handle the
  case if `resolveStateRefInPack` ever returns `0`).
- `"Cannot reset diplomacy for removed state ${i}."` — ref resolved
  but state is `removed` (defensive — `resolveStateRefInPack` already
  filters removed entries).

### Success result

```ts
okResult({
  state: { i, name },
  changes: [
    { other_state: { i, name }, previous: "Friendly", new: "Neutral" },
    ...
  ]
})
```

`changes` only contains pairs that actually changed. If everything was
already Neutral, `changes` is empty (still `ok: true`). If
`state.diplomacy` is missing or not an array, `changes` is empty (still
`ok: true`).

Example for state `1` ("Rookhold") whose diplomacy started as
`["x", "x", "Friendly", "Neutral", "Enemy", "Vassal"]`:

```json
{
  "ok": true,
  "state": { "i": 1, "name": "Rookhold" },
  "changes": [
    { "other_state": { "i": 2, "name": "Ashholm" }, "previous": "Friendly", "new": "Neutral" },
    { "other_state": { "i": 4, "name": "Greycliff" }, "previous": "Enemy", "new": "Neutral" },
    { "other_state": { "i": 5, "name": "Marrowmere" }, "previous": "Vassal", "new": "Neutral" }
  ]
}
```

State 3 was already Neutral so no entry. The mirror writes also
happened: `pack.states[2].diplomacy[1] === "Neutral"`,
`pack.states[4].diplomacy[1] === "Neutral"`,
`pack.states[5].diplomacy[1] === "Neutral"` (the Suzerain side of
the Vassal pair gets overwritten too — consistent with the legacy
`resetRelations`, which writes "Neutral" on both sides regardless of
the prior asymmetric pairing).

## Files

- **NEW** `src/ai/tools/reset-state-diplomacy.ts` — the tool, patterned
  on `set-diplomacy.ts` for the runtime split. Exports:
  - `interface ResetStateDiplomacyChange { other_state: { i: number; name: string }; previous: string; new: "Neutral"; }`
  - `interface ResetStateDiplomacyResult { state: { i: number; name: string }; changes: ResetStateDiplomacyChange[]; }`
  - `interface ResetStateDiplomacyRuntime { reset(ref: number | string): ResetStateDiplomacyResult | { error: string }; }`
  - `defaultResetStateDiplomacyRuntime` — `reset()` resolves via
    `resolveStateRefInPack`, performs the mutation, and returns the
    result.
  - `createResetStateDiplomacyTool(runtime?)` returning `Tool` named
    `reset_state_diplomacy`.
  - `resetStateDiplomacyTool` — default-runtime instance.
- **NEW** `src/ai/tools/reset-state-diplomacy.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { resetStateDiplomacyTool } from "./tools/reset-state-diplomacy";`
    between line 217 (`removeZoneTool`) and line 218 (`renameBiomeTool`)
    — alphabetically `reset-` sits between `remove-zone` and `rename-`.
  - Add a re-export block (createTool + types + default tool) between
    the `remove-zone` re-export (line 2025-2028) and the `rename-biome`
    re-export (line 2029-2033).
  - Add `registry.register(resetStateDiplomacyTool);` in
    `defaultToolRegistry()` adjacent to `regenerateDiplomacyTool`
    (line 2939) — keep the diplomacy-action tools clustered.

## Tests (Vitest)

Mirror the layout of `set-diplomacy.test.ts` for the runtime split, and
borrow the integration setup pattern from
`regenerate-diplomacy.test.ts`.

### `reset_state_diplomacy tool`

1. **Happy path: mixed relations**: stub runtime returns `{ state: {
   i: 1, name: "Rookhold" }, changes: [...] }` with three changes
   (Friendly → Neutral, Enemy → Neutral, Vassal → Neutral) and one
   skip (already-Neutral). Tool returns `{ ok: true, state: {...},
   changes: [...] }`. `reset` was called once with the input ref.
2. **Happy path: all already Neutral**: stub returns `{ state, changes:
   [] }`. Tool returns `{ ok: true, state, changes: [] }`. No error.
3. **State ref by name (case-insensitive)**: stub matches on the
   string "rookhold" → success. Asserts the runtime received the
   string ref unchanged.
4. **State ref by id**: stub matches on `5` → success.
5. **Invalid input shape**: parametric `null`, `undefined`, `0`, `-1`,
   `1.5`, `""`, `"   "`, `[]`, `{}` for `state` → all `isError`.
   `reset` is not called.
6. **Runtime returns error object**: stub returns `{ error: "State 99
   not found." }` → tool returns `errorResult` with that message.
7. **Tool name + schema + registry round-trip**: assert
   `tool.name === "reset_state_diplomacy"`,
   `input_schema.type === "object"`, `input_schema.required === ["state"]`,
   `properties.state.type === ["integer", "string"]`. Then construct
   a fresh `ToolRegistry`, register the default tool, assert the name
   appears in `registry.list()`.

### `defaultResetStateDiplomacyRuntime (integration)`

Setup: per test, save and restore `globalThis.pack`. Initial pack has 5
states: Neutrals (0), Rookhold (1), Ashholm (2), Greycliff (3, removed),
Marrowmere (4), Tideford (5). Diplomacy arrays of length 6 each, with
`"x"` on the diagonal and `"x"` for any slot involving state 0 or the
removed state 3.

8. **Happy path mutates both sides and tracks previous values**:
   Starting state: `pack.states[1].diplomacy = ["x", "x", "Friendly",
   "x", "Enemy", "Vassal"]`. After
   `resetStateDiplomacyTool.execute({ state: 1 })`:
   - `pack.states[1].diplomacy` becomes `["x", "x", "Neutral", "x",
     "Neutral", "Neutral"]` — but **the `"x"` slots remain `"x"`**
     (load-bearing).
   - `pack.states[2].diplomacy[1]` is `"Neutral"` (mirror write).
   - `pack.states[4].diplomacy[1]` is `"Neutral"` (mirror write).
   - `pack.states[5].diplomacy[1]` is `"Neutral"` (mirror write —
     overwrites the Suzerain side of the prior Vassal pair).
   - `pack.states[3].diplomacy[1]` is **untouched** (state 3 is
     removed; corresponding slot in state 1 was `"x"` so we never
     looked at it).
   - `pack.states[0].diplomacy[1]` is **untouched** (state 0 is the
     neutral placeholder; corresponding slot in state 1 was `"x"`).
   - `result.changes` contains exactly 3 entries with the correct
     `previous` values (`"Friendly"`, `"Enemy"`, `"Vassal"`) and
     `new: "Neutral"` everywhere. The `other_state` ids are 2, 4, 5
     respectively.
9. **Already-Neutral pairs are skipped (no-op + no change entry)**:
   Set `pack.states[1].diplomacy = ["x", "x", "Neutral", "x",
   "Neutral", "Neutral"]`. Run reset. Result is `ok` with `changes:
   []`. Verify mirror sides are unchanged (we never wrote anything).
   To prove no write: pre-set `pack.states[2].diplomacy[1] =
   "Suspicion"` (an inconsistency the legacy code would NOT correct
   either, since the Self side is already Neutral and the loop only
   writes when iterating Self's array). After reset,
   `pack.states[2].diplomacy[1]` is still `"Suspicion"`. This pins
   the "no spurious writes" semantic.
10. **State ref by name (case-insensitive)**: call with
    `{ state: "rOoKhOlD" }` — resolves to id 1, mutation occurs
    correctly.
11. **Sparse states list — undefined / null slots are skipped**:
    Replace `pack.states[3]` with `undefined`. Set
    `pack.states[1].diplomacy = ["x", "x", "Friendly", "Enemy",
    "Neutral", "x"]` (note: slot 3 is `"Enemy"` even though state 3
    is now undefined — this can happen if a state was removed
    after-the-fact and the diplomacy array wasn't compacted). Run
    reset. Verify slot 3 of `pack.states[1].diplomacy` is **left
    alone** (still `"Enemy"`) because the corresponding state entry
    is undefined and we cannot mirror-write — we skip rather than
    half-write. Verify the change for slot 2 ("Friendly" → "Neutral")
    is in `changes` and its mirror happened.
12. **State 0 rejected**: call with `{ state: 0 }` → `isError: true`,
    error matches the input-shape error (since 0 fails the
    positive-integer check before resolution).
13. **Removed state rejected**: call with `{ state: 3 }` (the removed
    state) → `isError: true`, error matches `/not found/`
    (`resolveStateRefInPack` returns null for removed states).
14. **State not found**: call with `{ state: 999 }` → error matching
    `/not found/`. Call with `{ state: "Atlantis" }` → same.
15. **State with no diplomacy array — graceful no-op**: set
    `pack.states[1].diplomacy = undefined`. Run reset. Result is
    `ok: true` with `state: { i: 1, name: "Rookhold" }` and `changes:
    []`. No throw.
16. **State with diplomacy that is not an array** (e.g. a string from
    a corrupted save): set `pack.states[1].diplomacy =
    ("nope" as unknown as string[])`. Run reset. Result is `ok: true`
    with `changes: []`. No throw.
17. **pack missing entirely**: set `globalThis.pack = undefined`.
    Result is `isError: true` with `/not found/` message (the resolver
    returns null).

### Setup/teardown

`beforeEach` sets a known pack with states 0..5 (3 removed). `afterEach`
restores `globalThis.pack`. Each test that mutates state values does so
fresh after the `beforeEach`.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed plan + tasks against the use case:

- **Use case fidelity.** The legacy `resetRelations` does:
  (1) read selected id from DOM,
  (2) loop the Self's diplomacy array, skipping `"x"`,
  (3) write `"Neutral"` to both Self side and counterpart side.
  The tool replaces (1) with an explicit ref input. (2) and (3) are
  reproduced exactly. **One material divergence**: legacy code would
  blindly write `pack.states[index].diplomacy[selectedId] = "Neutral"`
  even if `pack.states[index]` were undefined (would throw at
  runtime). We defensively skip undefined slots — see test §11. This
  is strictly safer; documented in plan Behavior + tested.
- **Mirror writes are the load-bearing assertion.** Tests §8, §10,
  and §11 all check both sides. §8 explicitly asserts `pack.states[j]
  .diplomacy[state.i]` is set, not just `pack.states[state.i]
  .diplomacy[j]`. This pins the symmetric-write semantic that
  distinguishes this tool from a naive one-sided update.
- **`"x"` preservation.** Test §8 verifies the `"x"` diagonal and
  the `"x"` slots for state 0 / removed states are NOT overwritten.
  The implementation guards on `state.diplomacy[j] !== "x"` (matches
  legacy) AND additionally guards on `pack.states[j]` being valid
  (defensive against sparse arrays).
- **Already-Neutral idempotence.** Test §9 verifies no spurious
  mirror writes happen when the Self side is already Neutral. The
  legacy code DOES write `"Neutral"` on both sides every iteration
  even when it's a no-op assignment — we skip the write entirely
  when the value would not change (saves a redundant assignment and
  avoids accidentally "fixing" a desync as documented in §9). This
  is a deliberate semantic — documented under Behavior.
- **Vassal/Suzerain handling.** When Self has `"Vassal"` toward
  another, the Suzerain side is on the counterpart. Legacy code
  writes `"Neutral"` to both sides regardless — same here. Test §8
  pins this with the slot 5 case.
- **Diplomacy-array missing.** Plan documents `okResult` with empty
  `changes` rather than an error. Rationale: "no relations to reset"
  is genuinely a no-op success, not a validation failure. The
  `set_diplomacy` tool errors in this case because it WANTS to
  write — but reset-with-nothing-to-reset is fine. Tests §15 / §16
  pin both undefined and non-array cases.
- **State 0 / removed state rejection.** Test §12 / §13 cover both.
  The neutral-placeholder error message exists in the plan but is
  not directly reachable from valid input (since `resolveStateRefInPack`
  rejects `0` and removed states up-front). It remains as defense in
  depth in case the resolver semantics change.
- **Tool name.** `reset_state_diplomacy` is the symmetric pair to
  `set_diplomacy` and complements `regenerate_diplomacy`. It is
  scoped to a single state's worth of relations (not the full
  matrix), which the `state_` infix makes explicit.
- **Schema shape.** `state` is `["integer", "string"]` — matches
  `set_diplomacy`'s `state_a` / `state_b` shape exactly. `required:
  ["state"]` follows the standard pattern.
- **Alphabetical insertion.** `reset-state-diplomacy` slots between
  `remove-zone` and `rename-biome` in imports + re-exports. In the
  registry block we group it with `regenerateDiplomacyTool` (line
  2939) instead of strict alphabetical, matching the file's
  established practice of clustering related tools (e.g. all the
  remove-* tools are in one block, all the regenerate-* in
  another).
- **Test isolation.** Integration tests save/restore `globalThis.pack`
  in beforeEach / afterEach; matches the pattern used by
  `set-diplomacy.test.ts` and `regenerate-diplomacy.test.ts`. Tests
  that swap `globalThis.pack = undefined` (test §17) restore it via
  the same afterEach.
- **Result payload field naming.** `state` (singular) is the operand;
  `changes` is the array of effects. Each entry uses `other_state`
  (snake_case, matches `state_a` / `state_b` in `set_diplomacy`),
  `previous` (string), `new: "Neutral"` (literal). The `new` field
  is technically constant given the tool's purpose — kept for
  symmetry with future "reset to X" extensions and so that a caller
  parsing the payload generically doesn't have to special-case
  this tool.
- **Re-export block.** Includes
  `createResetStateDiplomacyTool`, `defaultResetStateDiplomacyRuntime`,
  `type ResetStateDiplomacyChange`, `type ResetStateDiplomacyResult`,
  `type ResetStateDiplomacyRuntime`, `resetStateDiplomacyTool` —
  matches the export shape of comparable tools.
- **Registry round-trip.** Test §7 imports `ToolRegistry` and
  registers the default tool, mirroring the pattern in
  `regenerate-diplomacy.test.ts` and `add-burg-group.test.ts`.
