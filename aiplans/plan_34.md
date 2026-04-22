# Plan 34 — Use Case: Change a state's capital

## Status

Iteration 34. 33 AI tools. Baseline 7 warnings / 1 info / 0 errors.
424 tests pass.

## Use Case

**"Promote a different burg to be a state's capital."**

The UI does this via `toggleCapital(burgId)` in the Burg Editor
(`public/modules/ui/burg-editor.js:201-221`). When the user ticks
the "Capital" checkbox on a non-capital burg, the app:

1. Sets `pack.states[stateId].capital = burgId`
2. Sets `pack.states[stateId].center = pack.burgs[burgId].cell`
3. Flips `pack.burgs[burgId].capital = 1` (promote)
4. Flips `pack.burgs[oldCapitalId].capital = 0` (demote)
5. Calls `Burgs.changeGroup(newCapital)` and
   `Burgs.changeGroup(oldCapital)` so the SVG burg icons switch
   between the "capital" and "town" groups (icon + size change).

The tool also needs to reject the same constraints the UI enforces:
- Burg must belong to a state (`burg.state > 0`).
- Burg must be in the same state it's becoming capital of.
- Target burg can't already be the capital (no-op refused by the
  UI — we'll accept that gracefully as a no-op for ergonomics).

Prompts:
- *"Make Tidegarde the capital of Altaria."*
- *"Promote burg 12 to state capital."*
- *"Set the capital of state 2 to Seaborough."*

### Success criteria

1. `set_state_capital({state: 2, burg: 12})` — when burg 12 is in
   state 2 and isn't already the capital — calls the runtime with
   `{stateId: 2, oldCapitalId: <prev>, newCapitalId: 12, newCenter:
   <burg.cell>}`.
2. String refs resolved case-insensitively: `{state: "altaria",
   burg: "tidegarde"}`.
3. Rejects when burg doesn't belong to the chosen state.
4. Accepts when `burg.state === stateId` but `state.capital` is
   already the burg — returns `{ok: true, noop: true}` (idempotent).
5. Rejects state 0 (Neutrals can't have capitals).
6. Rejects unknown state / unknown burg.
7. Runtime throws → structured error.
8. Invalid ref types rejected.
9. Response reports
   `{state: {i, name}, previousCapital: {id, name} | null, capital:
   {id, name}, noop}`.

## Scope

In-scope:
- `set_state_capital` tool with `StateCapitalRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Toggling capital to 0 (removing a capital without assigning a new
  one) — the UI also doesn't support this cleanly.
- Moving a burg to a different state — separate concern.

## Design

New file: `src/ai/tools/set-state-capital.ts`.

```ts
export interface StateCapitalState {
  i: number;
  name: string;
  previousCapitalId: number;
  previousCapitalName: string | null;
}
export interface StateCapitalBurg {
  i: number;
  name: string;
  state: number;
  cell: number;
  alreadyCapital: boolean;
}
export interface StateCapitalRuntime {
  findState(ref: number | string): StateCapitalState | null;
  findBurg(ref: number | string): StateCapitalBurg | null;
  promote(input: {
    stateId: number;
    oldCapitalId: number;
    newCapitalId: number;
    newCenterCell: number;
  }): void;
}
```

Default runtime:
- `findState`: `findEntityByRef(pack.states, ref)` → shape.
- `findBurg`: `findEntityByRef(pack.burgs, ref)` → shape; includes
  `alreadyCapital: !!burg.capital`.
- `promote(input)`:
  - Update `pack.states[stateId].capital = newCapitalId`
  - Update `pack.states[stateId].center = newCenterCell`
  - Update `pack.burgs[newCapitalId].capital = 1`
  - Update `pack.burgs[oldCapitalId].capital = 0`
  - Call `window.Burgs?.changeGroup?.(newCapital)` and
    `.changeGroup?.(oldCapital)` if available (best-effort — the SVG
    group swap is visual polish; the data mutation is the point).

Executor:
1. Validate both refs.
2. Find state; reject 0.
3. Find burg; reject state mismatch.
4. If `burg.alreadyCapital === true` AND state's capital === burg.i,
   return `{ok: true, noop: true, state, capital}`.
5. `runtime.promote(...)` → catch throws.
6. Return ok result.

## Files

Create: `plan_34.md`, `tasks_34.md`,
`src/ai/tools/set-state-capital.ts`,
`src/ai/tools/set-state-capital.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-state-capital.test.ts`):

1. Numeric ids + valid promotion → `promote` called with all four
   fields.
2. String refs for both state and burg.
3. State mismatch (burg belongs to a different state) → error.
4. Already-capital (idempotent no-op) → `{ok: true, noop: true}`;
   `promote` not called.
5. Reject state 0.
6. Reject unknown state / unknown burg.
7. Invalid ref types rejected.
8. Runtime throws → error.
9. Response echoes previous + new capital ids/names.

## Plan ↔ tasks ↔ tests verification

Every criterion has a matching test. Noop case gets explicit
coverage.

Lint / test / build gates in tasks_34.md.
