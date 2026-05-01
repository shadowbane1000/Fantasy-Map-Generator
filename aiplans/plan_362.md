# Plan 362 — `set_cell_state` AI chat tool

## Use case

Add an AI chat tool `set_cell_state` that overrides the political
state assignment of a single cell — the missing per-cell state setter.
Mirrors the per-cell write inside the legacy
`applyStatesManualAssignent` function in
`public/modules/dynamic/editors/states-editor.js` (lines 975–989):

```js
function applyStatesManualAssignent() {
  const {cells} = pack;
  // ...
  statesBody.select("#temp").selectAll("polygon").each(function () {
    const i = +this.dataset.cell;
    const c = +this.dataset.state;
    affectedStates.push(cells.state[i], c);
    affectedProvinces.push(cells.province[i]);
    cells.state[i] = c;
    if (cells.burg[i]) pack.burgs[cells.burg[i]].state = c;
  });
  // ...downstream redraw orchestration
}
```

Note the side-effect: when a cell with a burg is reassigned to a new
state, that burg's `burg.state` is also updated to match. Without it,
the cell would belong to one state but the burg sitting in the cell
would still belong to the previous state — that mismatch causes
legend/diplomacy/state-summary bugs (the burg counts in the wrong
state, etc.).

The user can already trigger this via the States Editor's "Manual"
mode (paints state ownership over cells). The AI cannot per-cell.
We have peers `set_cell_height`, `set_cell_biome` (plan 359),
`set_cell_culture` (plan 360), and `set_cell_religion` (plan 361). This
plan adds the missing **per-cell state** setter, completing the cell-
edit primitive set (the legacy editor's manual modes for biome /
culture / religion / state are now all covered).

We already ship the state family: `add_state`, `remove_state`,
`rename_state`, `set_state_color`, `set_state_type`, `set_state_form`,
`set_state_capital`, `set_state_culture`, `set_state_expansion`,
`merge_states`, `find_states_*`, `get_state_info`, `list_states`,
`recalculate_states` (plan 336 — bulk recalc). This plan completes the
set with a per-cell setter.

Note: legacy `applyStatesManualAssignent` does a lot of downstream
work after the per-cell writes: `States.getPoles()`, `drawStates()`,
`drawStateLabels()`, `adjustProvinces()`, `drawBorders()`,
`drawProvinces()`. Per the brief we keep this tool atomic — best-
effort `drawStates()` only; we do not refresh the editor, we do not
recompute poles, we do not adjust provinces, and we do not trigger
`recalculate_states`. The caller can explicitly invoke
`recalculate_states` if propagation is needed. Documented in
Behavior §11.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 829 files in 671ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate `cell` is a non-negative integer.
2. Validate `state` is a non-negative integer.
3. Read `pack.cells.state` (typed array). If missing →
   `"window.pack.cells.state is not available; the map hasn't finished loading."`.
4. Read `pack.states` (array). If missing →
   `"window.pack.states is not available; the map hasn't finished loading."`.
5. Read `pack.cells.burg` (typed array — needed to check whether the
   target cell holds a burg). If missing →
   `"window.pack.cells.burg is not available; the map hasn't finished loading."`.
6. Read `pack.burgs` (array — needed for the burg side-effect). If
   missing →
   `"window.pack.burgs is not available; the map hasn't finished loading."`.
7. Validate `cell` is in `[0, pack.cells.state.length - 1]`.
8. Validate `state` is in `[0, pack.states.length - 1]`. State `0` is
   the "Neutrals" placeholder — VALID for cells (cells can be neutral,
   meaning unowned land). Do NOT reject 0.
9. If `pack.states[state]` is missing or has `removed === true` →
   reject with `"State ${id} has been removed."`. (State 0 is a static
   placeholder that is never marked removed in normal operation.)
10. Capture `previous = pack.cells.state[cell]` BEFORE mutation, plus
    `previous_state_name` from `pack.states[previous]?.name ?? ""`.
11. Perform `pack.cells.state[cell] = state` via the runtime (in-place
    typed-array write — preserves identity).
12. If `pack.cells.burg[cell] > 0` (the cell holds a burg):
    - Look up `burg = pack.burgs[burgId]`.
    - Capture `burg_previous_state = burg.state` BEFORE mutation.
    - Set `burg.state = state` to keep the burg consistent with the
      cell it sits in.
    - If the burg slot is missing/null (defensive), still record
      `burg = burgId` and `burg_name = ""`, leave `burg_previous_state
      = null`, and skip the assignment (no throw — the cell write
      already succeeded).
    - The burg-side write happens after the cell-state write so a
      runtime that throws on the cell write does not leave the burg
      partially updated.
13. Best-effort: if `globalThis.drawStates` is a function, call it.
    Swallow exceptions — the data mutation already happened.
14. Skip downstream propagation: `States.getPoles()`,
    `drawStateLabels`, `adjustProvinces`, `drawBorders`,
    `drawProvinces`. Caller can invoke `recalculate_states` for full
    propagation. Documented here and in the tool description.
15. Return success result.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "cell":  { "type": "integer", "minimum": 0, "description": "Cell index in pack.cells (0-based)." },
    "state": { "type": "integer", "minimum": 0, "description": "State id (0 = Neutrals)." }
  },
  "required": ["cell", "state"]
}
```

Inputs are passed via `tool_use` from the model. We additionally
validate at runtime since the schema is advisory (Anthropic does not
enforce it server-side at the strict integer level, and historically
some inputs arrive as strings or floats).

## Validation

| Field | Validation |
|-------|------------|
| `cell` | typeof `number`, finite, integer (`Number.isInteger`), `>= 0`, `< pack.cells.state.length`. |
| `state` | typeof `number`, finite, integer, `>= 0`, `< pack.states.length`, and `pack.states[state]` is present and not `removed`. |
| `pack.cells.state` | must exist (typed array). |
| `pack.states` | must exist (array). |
| `pack.cells.burg` | must exist (typed array — used for the burg side-effect lookup). |
| `pack.burgs` | must exist (used for the burg side-effect). |

## Errors (verbatim)

- `"cell must be a non-negative integer."`
- `"state must be a non-negative integer."`
- `"cell ${i} is out of range (max ${len-1})."`
- `"state ${id} is not a valid state id (max ${maxId})."`
- `"State ${id} has been removed."`
- `"window.pack.cells.state is not available; the map hasn't finished loading."`
- `"window.pack.states is not available; the map hasn't finished loading."`
- `"window.pack.cells.burg is not available; the map hasn't finished loading."`
- `"window.pack.burgs is not available; the map hasn't finished loading."`
- Runtime errors thrown by `setCellState` / `setBurgState` propagate as
  `{ ok: false, error: <message> }` via `errorResult(...)`.

These match the verbiage of the peer cell setters (`set_cell_biome`,
`set_cell_culture`, `set_cell_religion`).

## Success result

```jsonc
{
  "ok": true,
  "cell": 1234,
  "previous_state": 5,
  "previous_state_name": "Valoria",
  "state": 3,
  "state_name": "Aragorn",
  "burg": 17,                  // burg id in this cell, or null if none
  "burg_name": "Bree",
  "burg_previous_state": 5
}
```

When the cell has no burg (`pack.cells.burg[cell] === 0`), the result
is:

```jsonc
{
  "ok": true,
  "cell": 1234,
  "previous_state": 5,
  "previous_state_name": "Valoria",
  "state": 3,
  "state_name": "Aragorn",
  "burg": null,
  "burg_name": null,
  "burg_previous_state": null
}
```

Defensive: if the burg id is non-zero but `pack.burgs[burgId]` is
missing/null/removed, the result still reports `burg: <id>` with
`burg_name: ""` and `burg_previous_state: null`, and no burg-side
mutation is attempted.

## Files

NEW:
- `src/ai/tools/set-cell-state.ts` — implementation.
- `src/ai/tools/set-cell-state.test.ts` — Vitest specs.

MODIFY:
- `src/ai/index.ts` — add import + registry registration + barrel
  export, slotted alphabetically near
  `set-cell-biome` / `set-cell-culture` / `set-cell-height` /
  `set-cell-religion`.

## Tests (Vitest)

Stub-runtime tests:

1. **Happy path, no burg in cell** — cell with state=2 (no burg) → set
   to state=5; runtime called with `(cell, 5)`; result has
   `previous_state=2`, `state=5`, `burg=null`,
   `burg_previous_state=null`; `pack.cells.state[cell]===5`.
2. **Happy path, burg in cell** — cell with state=2 holds burg 7
   (`burg.state=2`) → set cell to state=5; both `pack.cells.state[cell]
   === 5` AND `pack.burgs[7].state === 5`. Result has `burg=7`,
   `burg_name="..."`, `burg_previous_state=2`.
3. **state=0 (Neutrals) accepted** — set a non-neutral cell back to
   neutral; result has `state=0`, `state_name="Neutrals"`.
4. **Same-state no-op** — set cell to its current state value; no
   error; previous and new are equal; setCellState still called once.
5. **Captures `previous_state` BEFORE mutation** — stub
   `setCellState` to read the array at call time and confirm the
   previous value is read before the write.
6. **Captures `burg_previous_state` BEFORE burg mutation** — burg
   in cell with state=2; tool sets cell state=5; observed
   `burg_previous_state` is the burg's pre-tool state, even if the
   stub mutates synchronously.
7. **Looks up `state_name` and `previous_state_name` from
   `pack.states`** — custom names verified.
8. **Defensive: previous value out of range** — `cellStates[0] = 99`
   but `states.length === 3` → `previous_state=99`,
   `previous_state_name=""`, no throw.
9. **Calls `drawStates` after a successful write.**
10. **Survives `drawStates` being absent** (no error).
11. **Survives `drawStates` throwing** (best-effort, write already
    done).
12. **Rejects missing `cell`** — `cell: undefined` and `cell: null`
    both rejected; `setCellState` not called.
13. **Rejects missing `state`** — same, but for `state`.
14. **Rejects non-numeric `cell`** — `"1"`, `true`, `{}`, `NaN`,
    `±Infinity`.
15. **Rejects non-integer `cell`** — 1.5, 2.1, 3.9999.
16. **Rejects negative `cell`** — -1, -100.
17. **Rejects non-numeric `state`** — same set.
18. **Rejects non-integer `state`** — 1.5.
19. **Rejects negative `state`** — -1.
20. **Rejects `cell` out of range** — exactly at length and far
    beyond; verbatim error message.
21. **Rejects `state` out of range** — exactly at length and far
    beyond; verbatim error message.
22. **Rejects removed state** — `pack.states[2].removed = true`.
23. **Rejects empty/null state slot (defensive)** — `pack.states[2] =
    null`.
24. **Errors when `pack.cells.state` missing** —
    `getCellStates: () => null` → verbatim error.
25. **Errors when `pack.states` missing** — verbatim error.
26. **Errors when `pack.cells.burg` missing** — verbatim error
    (since we may need it for the side-effect even on cells that
    happen to have no burg, the precondition is checked up front).
27. **Errors when `pack.burgs` missing** — verbatim error.
28. **Mutates the typed array in place (no reassignment)** —
    `pack.cells.state` identity preserved; `pack.cells.burg` identity
    untouched.
29. **Burg-id 0 is treated as "no burg"** — cell where
    `cells.burg[i] === 0`; tool does NOT call `setBurgState`; result
    has `burg=null`.
30. **Defensive: burg slot missing** — `cells.burg[i] = 7` but
    `pack.burgs[7] = undefined` → no throw, no burg-state mutation,
    result has `burg=7`, `burg_name=""`, `burg_previous_state=null`.
31. **Propagates runtime errors** — `setCellState` throws → result
    `isError`.
32. **Registry round-trip** — register tool with `ToolRegistry`,
    call by name.
33. **Exported as `setCellStateTool`** with the expected `name` and
    `input_schema.required`.

Default-runtime integration tests (using `globalThis.pack`):

34. **Mutates `globalThis.pack.cells.state` in place via the default
    runtime.**
35. **Captures `previous_state` BEFORE mutation (default runtime).**
36. **Updates `pack.burgs[burgId].state` when the cell holds a burg
    (default runtime).**
37. **Does NOT touch any burg when `pack.cells.burg[cell] === 0`
    (default runtime).**
38. **Same-state no-op via the default runtime.**
39. **Accepts state=0 (Neutrals) via the default runtime.**
40. **Errors when `pack.cells.state` missing (default runtime)** —
    `drawStates` not called.
41. **Errors when `pack.states` missing (default runtime).**
42. **Errors when `pack.cells.burg` missing (default runtime).**
43. **Errors when `pack.burgs` missing (default runtime).**
44. **Rejects removed state (default runtime)** — array unchanged.
45. **Calls `drawStates` when present (default runtime).**
46. **Succeeds when `drawStates` is missing (default runtime).**
47. **Survives `drawStates` throwing (default runtime, best-effort).**

## Verification

- `npm test` — all Vitest specs pass (this includes the new ones).
- `npx tsc --noEmit` — no type errors.
- `npm run lint` — Biome clean.

## Self-review

Re-read after writing — corrections applied:

- ✅ Burg side-effect tested explicitly (test 2, 6, 36).
- ✅ No-burg case tested (test 1, 29, 30, 37) — verifies no
  `setBurgState` call.
- ✅ `state=0` (Neutrals) accepted (test 3, 39).
- ✅ Removed state rejected (test 22, 23, 44).
- ✅ All previous values captured BEFORE mutation (tests 5, 6, 35).
- ✅ Burg-id 0 (no burg) does not mutate any burg (test 29).
- ✅ Defensive guard if `pack.burgs[id]` is missing — no throw, no
  mutation (test 30).
- ✅ `pack.cells.burg` and `pack.burgs` checked up front (so we never
  encounter a "halfway" world where the cell write succeeded but the
  burg side-effect would have been silently skipped due to a missing
  collection — that would mask data corruption).
- ✅ In-place mutation verified (test 28, 34).
- ✅ Default-runtime integration verified.
- ✅ Atomic — no `recalculate_states`, no `adjustProvinces`, no
  `drawBorders`, no `drawProvinces`, no `States.getPoles()`. Best-
  effort `drawStates()` only.
