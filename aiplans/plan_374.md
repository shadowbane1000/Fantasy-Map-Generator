# Plan 374: `toggle_lock_all_states` tool

## Use case

Add an AI chat tool `toggle_lock_all_states` that toggles the `lock`
flag on every active state as a single bulk action. This is the
parallel of plan 343's `toggle_lock_all_burgs`, but for `pack.states`.

The legacy state editor
(`public/modules/dynamic/editors/states-editor.js`) only exposes
**per-row** lock buttons via `updateLockStatus(stateId, classList)`
(around line 1511):

```js
function updateLockStatus(stateId, classList) {
  const s = pack.states[stateId];
  s.lock = !s.lock;

  classList.toggle("icon-lock-open");
  classList.toggle("icon-lock");
}
```

There is no "lock all" UI button for states (unlike the burgs
overview, which has a top-of-table lock-all icon). The AI can already
flip a single state's lock via `set_entity_lock`; this plan adds a
bulk equivalent.

State locks matter because:

- `regenerate_domain` (states) skips locked states when reseeding
  political layout.
- `regenerate_all_state_names` skips locked states when re-rolling
  state names.

So bulk-locking is what the user wants when they're about to
regenerate and want to pin every state they have so far. Bulk-unlock
is the inverse (release everything for a clean re-roll).

We already have:

- `set_entity_lock` (per-entity lock — burg, state, culture, religion,
  province).
- `toggle_lock_all_burgs` (plan 343 — the canonical pattern this plan
  mirrors).

This plan adds the missing **bulk lock toggle** action for states.

NOTE: this is NOT an "invert" (where each state flips independently);
it's a **toggle to a single state** — the WHOLE collection becomes
locked or unlocked depending on whether they're CURRENTLY all locked.
If even one active state is unlocked, the action LOCKS them all.
Only when every active state is already locked does the action unlock
them all. This matches the burg-tool semantics exactly.

The implementation uses in-place `state.lock = false` when unlocking
(NOT `delete state.lock`) — same as the burg tool, same as the legacy
`updateLockStatus`.

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-374-toggle-lock-all-states`, master @ 9118fd3, working
tree clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 853 files in 702ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this.

## Behavior

- Get `pack.states` via the runtime. If missing or not an array →
  error.
- Compute `activeStates = pack.states.filter(s => s && s.i && !s.removed)`.
  Skip state 0 (the neutral / no-state placeholder, `i === 0`) and
  removed states.
- Compute `allLocked = activeStates.every(s => !!s.lock)`.
  - **Note**: `every` on an empty array returns `true` (vacuous truth).
    When there are no active states, `allLocked` is `true`, so the
    action would "unlock all" but there's nothing to unlock. No-op
    outcome. We mirror this — same as `toggle_lock_all_burgs`.
- For each `s` in `activeStates`: `s.lock = !allLocked` (in-place
  property assignment — NOT a reassignment of `pack.states`, NOT
  `delete s.lock` on unlock).
- Best-effort: call `statesEditorAddLines()` if defined as a global
  function. (The legacy `editStates` flow re-renders the editor body
  via its internal `addLines` closure — exposed on `globalThis` via
  the dynamic-editor wrapper if present. If absent, skip silently.
  Same best-effort pattern as the burg tool's `burgsOverviewAddLines`
  call.)
- Best-effort: update the lock-all icon className. Mirroring the burg
  tool: write `"icon-lock"` when pre-mutation `allLocked === true`
  (we just unlocked everything, so the icon now offers "lock all"),
  `"icon-lock-open"` when pre-mutation `allLocked === false` (we just
  locked everything, so the icon now offers "unlock all"). Element
  id: `#statesLockAll`. If the element is missing or `document` is
  undefined, skip silently. (Note: the current legacy editor doesn't
  ship a lock-all icon button, but we keep the same DI seam so a
  future UI can hook in without changing the tool. If the element
  doesn't exist at runtime, the best-effort guard makes this a
  no-op — not an error.)
- Mutation MUST be in-place — `pack.states` array identity AND each
  individual state object identity is preserved.
- Compute the summary:
  - `active_count` = number of active (non-zero, non-removed) states.
  - `previously_all_locked` = the `allLocked` we computed BEFORE
    mutating.
  - `now_locked` = `previously_all_locked ? 0 : active_count`.
  - `now_unlocked` = `active_count - now_locked`.
  - `skipped_removed` = count of states filtered out due to `removed`.
    (State 0 is filtered too but isn't counted in `skipped_removed`;
    it's the placeholder, not a "removed" state.)

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields, no parameters. Same shape as
`toggle_lock_all_burgs`.

### Validation

- `pack.states` must exist and be an array.

### Errors (verbatim)

- `"window.pack.states is not available; the map hasn't finished loading."`
  — pack missing or `states` not an array.
- Runtime errors thrown by the runtime are propagated via
  `errorResult(err.message)`.

### Success result

```jsonc
{
  "ok": true,
  "active_count": M,
  "previously_all_locked": bool,
  "now_locked": N,
  "now_unlocked": K,
  "skipped_removed": R
}
```

`now_locked + now_unlocked === active_count`. One of `now_locked` /
`now_unlocked` will exactly equal `active_count` (the other is `0`)
since this is a toggle-to-single-state action. Both are included for
verbosity / API symmetry with `toggle_lock_all_burgs`.

`skipped_removed` reports how many states in `pack.states` had
`removed === truthy`. This does NOT include state 0 (which is always
the neutral placeholder with `i === 0`).

## Files

### NEW `src/ai/tools/toggle-lock-all-states.ts`

Structured exactly like `toggle-lock-all-burgs.ts`. Exports:

- `interface ToggleLockAllStatesResult { active_count: number; previously_all_locked: boolean; now_locked: number; now_unlocked: number; skipped_removed: number; }`
- `interface ToggleLockAllStatesRuntime`:
  ```ts
  {
    getStates(): RawState[] | undefined;
    setLock(i: number, lock: boolean): void;
    addLines?: () => void;
    setLockAllIcon?: (className: string) => void;
  }
  ```
- `defaultToggleLockAllStatesRuntime`:
  - `getStates()`:
    ```ts
    const pack = getPack<{ states?: RawState[] }>();
    const s = pack?.states;
    return Array.isArray(s) ? s : undefined;
    ```
  - `setLock(i, lock)`:
    ```ts
    const pack = getPack<{ states?: RawState[] }>();
    const states = pack?.states;
    if (!Array.isArray(states)) {
      throw new Error("pack.states is not available.");
    }
    const state = states[i];
    if (!state) throw new Error(`State ${i} not found.`);
    state.lock = lock;
    ```
    (Direct index `states[i]` — state ids are dense and align with
    their array index, like the legacy `pack.states[stateId]`
    access in `updateLockStatus`.)
  - `addLines()`: forwards to `getGlobal<() => void>("statesEditorAddLines")`
    if the global is a function. Implemented as an optional method.
  - `setLockAllIcon(className)`:
    ```ts
    if (typeof document === "undefined") return;
    const el = document.getElementById("statesLockAll");
    if (!el) return;
    el.className = className;
    ```
- `createToggleLockAllStatesTool(runtime?)` returning a `Tool` named
  `toggle_lock_all_states`.
- `toggleLockAllStatesTool` — default-runtime instance.

**Tool execute flow:**

1. `let states: RawState[] | undefined;`
   `try { states = runtime.getStates(); } catch (err) { return errorResult(err.message); }`
2. `if (!Array.isArray(states)) return errorResult("window.pack.states is not available; the map hasn't finished loading.");`
3. Compute the active set + counts:
   ```ts
   let activeCount = 0;
   let skippedRemoved = 0;
   const activeIndices: number[] = [];
   let allLocked = true;
   for (const state of states) {
     if (!state) continue;
     if (!state.i) continue; // placeholder (i === 0)
     if (state.removed) {
       skippedRemoved++;
       continue;
     }
     activeIndices.push(state.i);
     activeCount++;
     if (!state.lock) allLocked = false;
   }
   // Note: when activeCount === 0, allLocked stays `true` (vacuous).
   ```
4. Mutate in place via the DI seam:
   ```ts
   const newLock = !allLocked;
   try {
     for (const i of activeIndices) {
       runtime.setLock(i, newLock);
     }
   } catch (err) {
     return errorResult(err instanceof Error ? err.message : String(err));
   }
   ```
5. Best-effort `addLines()`:
   ```ts
   if (typeof runtime.addLines === "function") {
     try { runtime.addLines(); } catch { /* swallow */ }
   }
   ```
6. Best-effort `setLockAllIcon`. Mirroring the legacy burg ternary
   (`allLocked ? "icon-lock" : "icon-lock-open"` — based on the
   PRE-mutation `allLocked`):
   ```ts
   const className = allLocked ? "icon-lock" : "icon-lock-open";
   if (typeof runtime.setLockAllIcon === "function") {
     try { runtime.setLockAllIcon(className); } catch { /* swallow */ }
   }
   ```
7. Return:
   ```ts
   const nowLocked = newLock ? activeCount : 0;
   const nowUnlocked = activeCount - nowLocked;
   return okResult({
     active_count: activeCount,
     previously_all_locked: allLocked,
     now_locked: nowLocked,
     now_unlocked: nowUnlocked,
     skipped_removed: skippedRemoved,
   });
   ```

### NEW `src/ai/tools/toggle-lock-all-states.test.ts`

Vitest spec — see Tests section below.

### MODIFY `src/ai/index.ts`

- Add `import { toggleLockAllStatesTool } from "./tools/toggle-lock-all-states";`
  immediately after the `toggleLockAllBurgsTool` import (line ~377).
- Add the re-export block immediately after the
  `toggle-lock-all-burgs` re-export (around line 2987):
  ```ts
  export {
    createToggleLockAllStatesTool,
    defaultToggleLockAllStatesRuntime,
    type ToggleLockAllStatesResult,
    type ToggleLockAllStatesRuntime,
    toggleLockAllStatesTool,
  } from "./tools/toggle-lock-all-states";
  ```
- Add `registry.register(toggleLockAllStatesTool);` immediately after
  `registry.register(toggleLockAllBurgsTool);` (the existing list is
  topical, not strictly alphabetic — the two toggle-lock tools sit
  next to each other).

## Tests (Vitest)

Mirror the layout of `toggle-lock-all-burgs.test.ts` exactly (unit +
integration describe blocks). Helper:

```ts
function makeRuntime(opts: {
  states?: RawState[] | undefined | unknown;
  addLines?: () => void;
  setLockAllIcon?: ((className: string) => void) | undefined;
  omitSetLockAllIcon?: boolean;
  getStatesThrows?: Error;
  setLockThrows?: Error;
} = {}) {
  const states = opts.states as RawState[] | undefined;
  const setLockAllIcon = opts.omitSetLockAllIcon
    ? undefined
    : vi.fn(opts.setLockAllIcon ?? (() => {}));
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getStates = vi.fn(() => {
    if (opts.getStatesThrows) throw opts.getStatesThrows;
    return states;
  });
  const setLock = vi.fn((i: number, lock: boolean) => {
    if (opts.setLockThrows) throw opts.setLockThrows;
    const arr = states as RawState[] | undefined;
    if (!Array.isArray(arr)) return;
    const state = arr[i];
    if (!state) return;
    state.lock = lock;
  });
  const runtime: ToggleLockAllStatesRuntime = {
    getStates,
    setLock,
    addLines,
    setLockAllIcon,
  };
  return { runtime, getStates, setLock, addLines, setLockAllIcon };
}
```

Fixtures use `pack.states` indexed by `i`, so e.g.
`states[0] = { i: 0 }` (neutral / placeholder), `states[1] = { i: 1 }`,
etc.

### `toggle_lock_all_states tool` (unit, runtime stubbed)

1. **Happy path A: 3 states all locked → after: all unlocked.** Body
   has `previously_all_locked: true`, `now_locked: 0`,
   `now_unlocked: 3`, `active_count: 3`, `skipped_removed: 0`. Each
   active state has `lock === false`. State 0 untouched.
   `setLockAllIcon` called once with `"icon-lock"`.

2. **Happy path B: partially locked → all locked.**
   `previously_all_locked: false`, `now_locked: 3`, `now_unlocked: 0`.
   Each active state `lock === true`. `setLockAllIcon` called once
   with `"icon-lock-open"`.

3. **Happy path C: all unlocked → all locked.**
   `previously_all_locked: false`, `now_locked: 3`. All states
   `lock === true`. `setLockAllIcon` called with `"icon-lock-open"`.

4. **Happy path D: mix of true/false/undefined → all locked.** A
   state with `lock` undefined (no key) counts as unlocked. All three
   become `lock === true`.

5. **Removed states untouched (LOAD-BEARING).** Fixture:
   ```ts
   [
     { i: 0 },
     { i: 1, lock: true, name: "A" },
     { i: 2, lock: true, removed: true, name: "Removed" },
     { i: 3, lock: true, name: "C" },
   ]
   ```
   Pre-mutation `allLocked === true` (active states 1+3 both locked;
   the removed state is filtered out). Toggle direction: "unlock all".
   - **MANDATORY**: `states[2].lock === true` after — load-bearing
     because the new lock state would be `false` if it were touched.
   - Active states `states[1].lock === false`, `states[3].lock === false`.
   - `setLock` called exactly twice with `(1, false)` and `(3, false)`.
   - `setLock` NOT called with state 2.
   - Body `skipped_removed: 1`.

6. **State 0 (neutral) untouched (LOAD-BEARING).** Fixture:
   ```ts
   [
     { i: 0, lock: true, name: "Neutrals" },
     { i: 1, lock: true, name: "A" },
     { i: 2, lock: true, name: "B" },
   ]
   ```
   Pre-mutation `allLocked === true`. Toggle direction: "unlock all".
   - **MANDATORY**: `states[0].lock === true` after — load-bearing
     because the new lock state would be `false` if state 0 were
     touched.
   - `states[1].lock === false`, `states[2].lock === false`.
   - `setLock` NOT called with state 0.

7. **Empty active set → vacuous true (LOAD-BEARING).** Fixture:
   only the neutral placeholder + removed states. Body
   `previously_all_locked: true`, `now_locked: 0`, `now_unlocked: 0`,
   `active_count: 0`, `skipped_removed: 2`. Removed states untouched.
   `setLock` NOT called. `setLockAllIcon` called with `"icon-lock"`.

8. **In-place mutation: array + per-state identity preserved
   (LOAD-BEARING).** Capture array reference and per-state references
   before; assert `===` after.

9. **Missing pack.states → exact error.** `getStates()` returns
   `undefined`. Body error is exactly
   `"window.pack.states is not available; the map hasn't finished loading."`.
   `setLock` and `setLockAllIcon` NOT called.

10. **Non-array pack.states → same error.** Pass `"oops"` cast
    through unknown. Same exact error wording.

11. **`getStates()` throws → error propagated.** Throws
    `new Error("boom")`. Body error matches `/boom/`. `setLock` NOT
    called.

12. **`setLock` throws → error propagated.** One active state,
    `setLockThrows: new Error("dom!")`. Body error matches `/dom!/`.

13. **`addLines` best-effort: not provided → no error.**

14. **`addLines` throws → swallowed; result still ok; mutation
    applied.**

15. **`setLockAllIcon` best-effort: not provided → no error.**

16. **`setLockAllIcon` throws → swallowed; result still ok;
    mutation applied.**

17. **`setLockAllIcon` className matches PRE-mutation `allLocked`.**
    Parameterized via `it.each` over four cases:
    - all locked → `"icon-lock"`
    - partial → `"icon-lock-open"`
    - all unlocked → `"icon-lock-open"`
    - empty active (vacuous true) → `"icon-lock"`

18. **Tool name + schema + registry round-trip.** Asserts
    `toggleLockAllStatesTool.name === "toggle_lock_all_states"`,
    schema `{ type: "object", properties: {} }`, and registry round-trip.

19. **Ignores extraneous input properties.** Pass
    `{ bogus: "x", count: 7 }`. Result still ok.

20. **Tolerates null/undefined input.** `tool.execute(null)` and
    `tool.execute(undefined)` both ok.

21. **`now_locked + now_unlocked === active_count` invariant.**
    Parameterized over the four happy-path scenarios plus the empty
    case.

### `defaultToggleLockAllStatesRuntime (integration)`

Save/restore `globalThis.pack`, `globalThis.document`,
`globalThis.statesEditorAddLines` per test.

22. **End-to-end with populated globals.** `pack.states` with one
    unlocked, one locked, one removed-locked. `document.getElementById`
    returns a fake `#statesLockAll` element.
    `globalThis.statesEditorAddLines = vi.fn()`. Body has
    `active_count: 2, previously_all_locked: false, now_locked: 2,
    now_unlocked: 0, skipped_removed: 1`. Removed state `lock`
    untouched. State 0 untouched. Icon className set to
    `"icon-lock-open"`. `addLines` called once. Array identity
    preserved.

23. **Integration: all locked → all unlocked.** Body has
    `previously_all_locked: true`, `now_locked: 0`, `now_unlocked: 2`.
    Both active states `lock === false`. Icon className =
    `"icon-lock"`.

24. **Integration: missing pack → error, icon untouched, addLines
    not called.** Error matches `/window\.pack\.states is not available/`.

25. **Integration: pack.states not an array → same error.**
    `globalThis.pack = { states: "nope" }`.

26. **Integration: missing `#statesLockAll` element → no error,
    mutation still happens.** `document.getElementById` returns null.

27. **Integration: `statesEditorAddLines` global missing → no error.**
    Body still ok.

28. **Integration: `document` undefined (SSR-safe) → no error,
    mutation applied.**

29. **Integration: empty active set → vacuous true, no setLock
    calls.** `pack.states = [{ i: 0 }]`. Body has `active_count: 0,
    previously_all_locked: true, now_locked: 0, now_unlocked: 0,
    skipped_removed: 0`. Icon className = `"icon-lock"`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **Use case fidelity.** Mirrors `toggle_lock_all_burgs` exactly (the
  canonical pattern from plan 343):
  - Filter active = `s.i && !s.removed`. State 0 is the neutral
    placeholder (`pack.states[0]`), filtered by `!s.i`.
  - Compute `allLocked` with `every` (vacuous true on empty active
    set).
  - Set `s.lock = !allLocked` for each active.
  - Best-effort `addLines()` and `setLockAllIcon()` callbacks.
  - In-place mutation (no array/object identity change).
- **Toggle-to-single-state semantics, NOT invert.** Tests §1 (all
  locked → all unlocked), §2 (partial → all locked), §3 (all
  unlocked → all locked), §4 (mixed truthy/undefined → all locked).
  All four cover the "single state" outcome.
- **In-place mutation test §8.** Captures array reference AND each
  individual state object reference, then asserts identity equality
  after mutation. The default `setLock` does direct property
  assignment, not reassignment.
- **Removed states untouched test §5 is strict.** Pre-mutation
  `allLocked === true`, toggle direction is "unlock all", removed
  state starts `lock=true`. The only way it stays `true` is if it was
  correctly skipped. Plus the explicit `setLock` spy assertions
  (`toHaveBeenCalledTimes(2)`, `not.toHaveBeenCalledWith(2, …)`).
- **State 0 untouched test §6 is strict.** Same construction:
  pre-mutation `allLocked === true`, toggle direction "unlock all",
  state 0 starts `lock=true`. The only way it stays `true` is if it
  was correctly filtered out. Plus the explicit
  `setLock not.toHaveBeenCalledWith(0, …)`.
- **Empty-active-set vacuous-true test §7.** Asserts
  `previously_all_locked: true` (vacuous) and `setLock` not called.
  Confirms behavior matches the legacy `every` semantics.
- **Best-effort callbacks (tests §13–§16).** Cover missing /
  throwing `addLines` and `setLockAllIcon`. None block the result.
- **Error wording is exact.** Tests §9, §10 assert the exact string
  `"window.pack.states is not available; the map hasn't finished loading."`.
  Integration tests §24, §25 use a regex.
- **Tool schema.** `properties: {}` and no `required` field. Test
  §18 asserts the exact shape and registry round-trip.
- **Registry slot.** Sits immediately after `toggleLockAllBurgsTool`
  in the registration list, matching the topical "bulk lock toggle"
  grouping.
- **State 0 == neutrals.** The neutral placeholder is `pack.states[0]`
  (form `"Neutrals"`, `i === 0`). Same filter pattern as burgs:
  `if (!state.i) continue;` skips it.
- **Field type.** `RawState.lock?: boolean` — confirmed in
  `src/ai/tools/_shared/pack-types.ts` line 42, and matches the
  legacy `s.lock = !s.lock` assignment in `updateLockStatus`. The
  prompt mentioned `number | boolean` but the actual codebase uses
  `boolean` in the type and at runtime — we match the existing type
  exactly.
- **Side-effect helper names.** Burg tool uses
  `burgsOverviewAddLines` and `#burgsLockAll`. State analogs are
  `statesEditorAddLines` and `#statesLockAll`. The legacy state
  editor doesn't currently expose either, but the best-effort
  guards make this a no-op rather than an error — and the DI seam
  allows the tool to be wired up if the UI grows a lock-all button
  later. Rationale documented inline.
