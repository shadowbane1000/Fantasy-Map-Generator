# Plan 343: `toggle_lock_all_burgs` tool

## Use case

Add an AI chat tool `toggle_lock_all_burgs` that toggles the `lock`
flag on every active burg as a single bulk action. This mirrors the
legacy `toggleLockAll` function in
`public/modules/ui/burgs-overview.js` (around line 570), wired to the
"Lock all" icon button at the top of the Burgs Overview:

```js
function toggleLockAll() {
  const activeBurgs = pack.burgs.filter(b => b.i && !b.removed);
  const allLocked = activeBurgs.every(burg => burg.lock);

  activeBurgs.forEach(burg => {
    burg.lock = !allLocked;
  });

  burgsOverviewAddLines();
  byId("burgsLockAll").className = allLocked ? "icon-lock" : "icon-lock-open";
}
```

The user can already trigger this via the lock-all icon button in the
burgs overview. The AI cannot.

We already have:

- `set_entity_lock` (per-entity lock — burg, state, culture, religion,
  province).
- `regenerate_all_burg_names` (the bulk burg pattern with active
  filter that respects the lock).
- `invert_marker_pins` (plan 341 — the bulk marker pin invert pattern;
  closest analogue we have, BUT semantics differ: `invert_marker_pins`
  flips each marker independently. This plan toggles the WHOLE
  collection to a single state.)

This plan adds the missing **bulk lock toggle** action for burgs.

NOTE: this is NOT an "invert" (where each burg flips independently);
it's a **toggle to a single state** — the WHOLE collection becomes
locked or unlocked depending on whether they're CURRENTLY all locked.
If even one active burg is unlocked, the action LOCKS them all.
Only when every active burg is already locked does the action unlock
them all.

The legacy code uses `burg.lock = !allLocked` (in-place property
assignment to the boolean, NOT delete-on-unlock semantics like
`invert_marker_pins`). We mirror that: `burg.lock = false` when
unlocking, not `delete burg.lock`.

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-343-toggle-lock-all-burgs`, master @ 4f3bad3, working
tree clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 789 files in 622ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this.

## Behavior

- Get `pack.burgs` via the runtime. If missing or not an array →
  error.
- Compute `activeBurgs = pack.burgs.filter(b => b && b.i && !b.removed)`.
  Skip burg 0 (placeholder, `i === 0`) and removed burgs.
- Compute `allLocked = activeBurgs.every(b => !!b.lock)`.
  - **Note**: `every` on an empty array returns `true` (vacuous truth).
    The legacy code preserves this — when there are no active burgs,
    `allLocked` is `true`, so the action would "unlock all" but
    there's nothing to unlock. No-op outcome. We mirror this.
- For each `b` in `activeBurgs`: `b.lock = !allLocked` (in-place
  property assignment — NOT a reassignment of `pack.burgs`, NOT
  `delete b.lock` on unlock).
- Best-effort: call `burgsOverviewAddLines()` if defined as a global
  function. Swallow errors.
- Best-effort: update the lock-all icon className. The legacy snippet
  is `byId("burgsLockAll").className = allLocked ? "icon-lock" : "icon-lock-open"`.
  - `allLocked === true` (we just unlocked everything) → set the
    icon to `"icon-lock"` (because the icon shows "lock all" when
    things are unlocked).
  - `allLocked === false` (we just locked everything) → set the
    icon to `"icon-lock-open"` (the icon now shows "unlock all").
  - This matches the legacy code exactly. Best-effort: if `byId`
    or `document.getElementById` is missing, or the element is
    missing, skip silently.
- Mutation MUST be in-place — `pack.burgs` array identity AND each
  individual burg object identity is preserved.
- Compute the summary:
  - `active_count` = number of active (non-zero, non-removed) burgs.
  - `previously_all_locked` = the `allLocked` we computed BEFORE
    mutating.
  - `now_locked` = `previously_all_locked ? 0 : active_count`.
  - `now_unlocked` = `active_count - now_locked`.
  - `skipped_removed` = count of burgs filtered out due to `removed`.
    (Burg 0 is filtered too but isn't counted in `skipped_removed`;
    it's the placeholder, not a "removed" burg.)

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields, no parameters.

### Validation

- `pack.burgs` must exist and be an array.

### Errors (verbatim)

- `"window.pack.burgs is not available; the map hasn't finished loading."`
  — pack missing or `burgs` not an array.
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
verbosity / API symmetry.

`skipped_removed` reports how many burgs in `pack.burgs` had
`removed === truthy`. This does NOT include burg 0 (which is always
the placeholder with `i === 0`).

## Files

- **NEW** `src/ai/tools/toggle-lock-all-burgs.ts` — the tool.
  Exports:
  - `interface ToggleLockAllBurgsResult { active_count: number; previously_all_locked: boolean; now_locked: number; now_unlocked: number; skipped_removed: number; }`
  - `interface ToggleLockAllBurgsRuntime`:
    ```ts
    {
      getBurgs(): RawBurg[] | undefined;
      setLock(i: number, lock: boolean): void;
      addLines?: () => void;
      setLockAllIcon?: (className: string) => void;
    }
    ```
  - `defaultToggleLockAllBurgsRuntime`:
    - `getBurgs()`:
      ```ts
      const pack = getPack<{ burgs?: RawBurg[] }>();
      const b = pack?.burgs;
      return Array.isArray(b) ? b : undefined;
      ```
    - `setLock(i, lock)`:
      ```ts
      const pack = getPack<{ burgs?: RawBurg[] }>();
      const burgs = pack?.burgs;
      if (!Array.isArray(burgs)) {
        throw new Error("pack.burgs is not available.");
      }
      const burg = burgs[i];
      if (!burg) throw new Error(`Burg ${i} not found.`);
      burg.lock = lock;
      ```
      (We use direct index `burgs[i]` — burg ids are dense and align
      with their array index, like the legacy code does.)
    - `addLines()`: forwards to `getGlobal<() => void>("burgsOverviewAddLines")`
      if the global is a function. Implemented as an optional method
      that the tool only calls if defined.
    - `setLockAllIcon(className)`:
      ```ts
      if (typeof document === "undefined") return;
      const el = document.getElementById("burgsLockAll");
      if (!el) return;
      el.className = className;
      ```
  - `createToggleLockAllBurgsTool(runtime?)` returning a `Tool` named
    `toggle_lock_all_burgs`.
  - `toggleLockAllBurgsTool` — default-runtime instance.

  **Tool execute flow:**
  1. `let burgs: RawBurg[] | undefined;`
     `try { burgs = runtime.getBurgs(); } catch (err) { return errorResult(err.message); }`
  2. `if (!Array.isArray(burgs)) return errorResult("window.pack.burgs is not available; the map hasn't finished loading.");`
  3. Compute the active set + counts:
     ```ts
     let activeCount = 0;
     let skippedRemoved = 0;
     const activeIndices: number[] = [];
     let allLocked = true;
     for (const burg of burgs) {
       if (!burg) continue;
       if (!burg.i) continue; // placeholder (i === 0)
       if (burg.removed) {
         skippedRemoved++;
         continue;
       }
       activeIndices.push(burg.i);
       activeCount++;
       if (!burg.lock) allLocked = false;
     }
     // Note: when activeCount === 0, allLocked stays `true` (vacuous).
     ```
  4. Mutate in place (via runtime.setLock so the DI seam is exercised):
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
  6. Best-effort `setLockAllIcon`. Mirroring the legacy ternary
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

- **NEW** `src/ai/tools/toggle-lock-all-burgs.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { toggleLockAllBurgsTool } from "./tools/toggle-lock-all-burgs";`
    in the import block, alphabetically placed under `t`. Currently
    the import block jumps from `splitRegimentTool` (line 347) to a
    blank line at 348. Insert the new import as the next line:
    ```ts
    import { splitRegimentTool } from "./tools/split-regiment";
    import { toggleLockAllBurgsTool } from "./tools/toggle-lock-all-burgs";
    ```
  - Add the re-export block immediately after the `split-regiment`
    re-export (line 2746):
    ```ts
    export {
      createToggleLockAllBurgsTool,
      defaultToggleLockAllBurgsRuntime,
      type ToggleLockAllBurgsResult,
      type ToggleLockAllBurgsRuntime,
      toggleLockAllBurgsTool,
    } from "./tools/toggle-lock-all-burgs";
    ```
  - Add `registry.register(toggleLockAllBurgsTool);` near the other
    bulk burg registrations. The existing list isn't strictly
    alphabetic; topical grouping is the norm. Place it at the end of
    the registration block (after the last `registry.register(...)`
    call) so it sits with the most-recently-added tools. This matches
    the convention used by recent plan tools.

## Tests (Vitest)

Mirror the layout of `invert-marker-pins.test.ts` (unit + integration
describe blocks).

### `toggle_lock_all_burgs tool` (unit, runtime stubbed)

Helper builds a runtime with:
```ts
function makeRuntime(opts: {
  burgs?: RawBurg[] | undefined | unknown;
  addLines?: () => void;
  setLockAllIcon?: (className: string) => void;
  getBurgsThrows?: Error;
  setLockThrows?: Error;
} = {}) {
  const setLockAllIcon = opts.setLockAllIcon
    ? vi.fn(opts.setLockAllIcon)
    : vi.fn();
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const burgs = opts.burgs as RawBurg[] | undefined;
  const getBurgs = vi.fn(() => {
    if (opts.getBurgsThrows) throw opts.getBurgsThrows;
    return burgs;
  });
  const setLock = vi.fn((i: number, lock: boolean) => {
    if (opts.setLockThrows) throw opts.setLockThrows;
    const arr = burgs as RawBurg[] | undefined;
    if (!arr) return;
    const burg = arr[i];
    if (!burg) return;
    burg.lock = lock;
  });
  const runtime: ToggleLockAllBurgsRuntime = {
    getBurgs,
    setLock,
    addLines,
    setLockAllIcon,
  };
  return { runtime, getBurgs, setLock, addLines, setLockAllIcon };
}
```

The fixtures use `pack.burgs` indexed by `i`, so e.g.
`burgs[0] = { i: 0 }` (placeholder), `burgs[1] = { i: 1 }`, etc.

1. **Happy path A: 3 burgs all locked → after: all unlocked.**
   - Burgs:
     ```ts
     [
       { i: 0 }, // placeholder
       { i: 1, lock: true, name: "A" },
       { i: 2, lock: true, name: "B" },
       { i: 3, lock: true, name: "C" },
     ]
     ```
   - Execute `{}`.
   - Body:
     ```jsonc
     {
       ok: true,
       active_count: 3,
       previously_all_locked: true,
       now_locked: 0,
       now_unlocked: 3,
       skipped_removed: 0,
     }
     ```
   - Each active burg has `lock === false`.
   - Burg 0's `lock` is unchanged (untouched).
   - `setLockAllIcon` called once with `"icon-lock"` (PRE-mutation
     `allLocked === true` → ternary returns `"icon-lock"`).

2. **Happy path B: partially locked → all locked.**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: true, name: "A" },
       { i: 2, lock: false, name: "B" },
       { i: 3, lock: true, name: "C" },
     ]
     ```
   - Body:
     ```jsonc
     {
       ok: true,
       active_count: 3,
       previously_all_locked: false,
       now_locked: 3,
       now_unlocked: 0,
       skipped_removed: 0,
     }
     ```
   - Each active burg has `lock === true`.
   - `setLockAllIcon` called once with `"icon-lock-open"`.

3. **Happy path C: all unlocked → all locked.**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: false, name: "A" },
       { i: 2, lock: false, name: "B" },
       { i: 3, lock: false, name: "C" },
     ]
     ```
   - Body:
     ```jsonc
     {
       ok: true,
       active_count: 3,
       previously_all_locked: false,
       now_locked: 3,
       now_unlocked: 0,
       skipped_removed: 0,
     }
     ```
   - Each active burg has `lock === true`.
   - `setLockAllIcon` called once with `"icon-lock-open"`.

4. **Happy path D: mix of true/false/undefined → all locked.**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: true, name: "A" },
       { i: 2, lock: false, name: "B" },
       { i: 3, name: "C" }, // lock undefined
     ]
     ```
   - Body: `previously_all_locked: false`, `now_locked: 3`,
     `now_unlocked: 0`, `active_count: 3`, `skipped_removed: 0`.
   - All three burgs become `lock === true`.

5. **Removed burgs untouched (LOAD-BEARING).**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: false, name: "A" },
       { i: 2, lock: true, removed: true, name: "Removed" },
       { i: 3, lock: false, name: "C" },
     ]
     ```
   - Execute `{}`.
   - Body:
     ```jsonc
     {
       ok: true,
       active_count: 2,
       previously_all_locked: false,
       now_locked: 2,
       now_unlocked: 0,
       skipped_removed: 1,
     }
     ```
   - **MANDATORY**: `burgs[2].lock === true` (unchanged — the toggle
     would have locked active burgs, but the removed burg was
     skipped). Even though the toggle direction was "lock all", the
     removed burg's pre-existing `lock=true` state is verified
     untouched (i.e. the toggle did not touch it AT ALL).
   - Active burgs (`burgs[1]`, `burgs[3]`) are now `lock === true`.

6. **Burg 0 untouched (LOAD-BEARING).**
   - Burgs:
     ```ts
     [
       { i: 0, lock: true }, // placeholder with weird lock=true
       { i: 1, lock: false, name: "A" },
       { i: 2, lock: false, name: "B" },
     ]
     ```
   - **MANDATORY**: `burgs[0].lock === true` after the call. The
     placeholder is filtered out by `i === 0` and never touched,
     even though the toggle direction was "lock all".

7. **Empty active set → vacuous true (LOAD-BEARING).**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: true, removed: true },
       { i: 2, lock: false, removed: true },
     ]
     ```
   - Body:
     ```jsonc
     {
       ok: true,
       active_count: 0,
       previously_all_locked: true,
       now_locked: 0,
       now_unlocked: 0,
       skipped_removed: 2,
     }
     ```
   - `every` on an empty array returns `true` — vacuous truth. So
     the toggle direction is "unlock all", but nothing to unlock.
   - **MANDATORY**: `burgs[1].lock === true` (removed, unchanged),
     `burgs[2].lock === false` (removed, unchanged).
   - `setLock` NOT called.
   - `setLockAllIcon` called with `"icon-lock"` (vacuous-true →
     ternary returns `"icon-lock"`).

8. **In-place mutation: array + per-burg identity preserved (LOAD-BEARING).**
   - Burgs:
     ```ts
     [
       { i: 0 },
       { i: 1, lock: false, name: "A" },
       { i: 2, lock: true, name: "B" },
     ]
     ```
   - Capture references:
     ```ts
     const arrayBefore = burgs;
     const burg1Before = burgs[1];
     const burg2Before = burgs[2];
     ```
   - Execute `{}`.
   - Assertions:
     - `burgs === arrayBefore` (array identity preserved).
     - `burgs[1] === burg1Before` (object identity preserved).
     - `burgs[2] === burg2Before` (object identity preserved).
   - **MANDATORY** per the prompt.

9. **Missing pack.burgs → exact error.**
   - Runtime `getBurgs()` returns `undefined`.
   - Execute `{}`.
   - `result.isError === true`; body `error` is exactly
     `"window.pack.burgs is not available; the map hasn't finished loading."`.
   - `setLock` NOT called.
   - `setLockAllIcon` NOT called.

10. **Non-array pack.burgs → same error.**
    - `getBurgs()` returns `"oops"` (cast through unknown).
    - Same exact error wording.

11. **`getBurgs()` throws → error propagated.**
    - `getBurgs()` throws `new Error("boom")`.
    - `result.isError === true`; body `error` matches `/boom/`.
    - `setLock` NOT called.

12. **`setLock` throws → error propagated.**
    - One active burg, `setLockThrows: new Error("dom!")`.
    - `result.isError === true`; body `error` matches `/dom!/`.

13. **`addLines` best-effort: not provided → no error.**
    - Active burgs present. No `addLines` on runtime.
    - Body still ok.

14. **`addLines` throws → swallowed; result still ok.**
    - `addLines: () => { throw new Error("svg!"); }`.
    - Body still ok; mutation still applied.

15. **`setLockAllIcon` best-effort: not provided → no error.**
    - Active burgs present. Construct runtime with
      `setLockAllIcon: undefined` (override the helper's default).
    - Body still ok.

16. **`setLockAllIcon` throws → swallowed; result still ok.**
    - `setLockAllIcon: () => { throw new Error("dom!"); }`.
    - Body still ok; mutation still applied.

17. **`setLockAllIcon` className matches the PRE-mutation allLocked.**
    - Two parameterized cases via `it.each`:
      - Pre-mutation `allLocked === true` → expect `"icon-lock"`.
      - Pre-mutation `allLocked === false` → expect `"icon-lock-open"`.
    - **MANDATORY** — distinguishes the two ternary branches.

18. **Tool name + schema + registry round-trip.**
    - `expect(toggleLockAllBurgsTool.name).toBe("toggle_lock_all_burgs");`
    - `expect(toggleLockAllBurgsTool.input_schema).toEqual({ type: "object", properties: {} });`
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("toggle_lock_all_burgs")`.

19. **Ignores extraneous input properties.**
    - Execute `{ bogus: "x", count: 7 }`. Result still ok.

20. **Tolerates null/undefined input.**
    - `tool.execute(null)` and `tool.execute(undefined)` both ok.

21. **`now_locked + now_unlocked === active_count` invariant.**
    - Parameterized via `it.each` over the four happy-path scenarios
      (A, B, C, D) plus the empty-active case. Always exact.

### `defaultToggleLockAllBurgsRuntime (integration)`

Mirror the integration block in `invert-marker-pins.test.ts`. Save
and restore `globalThis.pack`, `globalThis.document`, and
`globalThis.burgsOverviewAddLines` per test.

22. **End-to-end with populated globals.**
    - `pack.burgs`:
      ```ts
      [
        { i: 0 },
        { i: 1, lock: false, name: "A" },
        { i: 2, lock: true, name: "B" },
        { i: 3, lock: true, removed: true, name: "Removed" },
      ]
      ```
    - `document.getElementById("burgsLockAll")` returns a fake
      element with a `className` setter spy.
    - `globalThis.burgsOverviewAddLines = vi.fn();`
    - Execute `toggleLockAllBurgsTool.execute({})`.
    - Assertions:
      - Body:
        ```jsonc
        {
          ok: true,
          active_count: 2,
          previously_all_locked: false,
          now_locked: 2,
          now_unlocked: 0,
          skipped_removed: 1,
        }
        ```
      - `pack.burgs[1].lock === true`.
      - `pack.burgs[2].lock === true`.
      - `pack.burgs[3].lock === true` (removed, untouched).
      - `pack.burgs[0]` untouched.
      - The icon element's `className` was set to `"icon-lock-open"`.
      - `burgsOverviewAddLines` called once.
      - `pack.burgs === <captured ref>` (array identity preserved).

23. **Integration: all locked → all unlocked.**
    - `pack.burgs`:
      ```ts
      [
        { i: 0 },
        { i: 1, lock: true, name: "A" },
        { i: 2, lock: true, name: "B" },
      ]
      ```
    - Body: `previously_all_locked: true`, `now_locked: 0`,
      `now_unlocked: 2`, `active_count: 2`, `skipped_removed: 0`.
    - Both burgs `lock === false`.
    - Icon className = `"icon-lock"`.

24. **Integration: missing pack → error.**
    - `globalThis.pack = undefined`.
    - `result.isError === true`; error matches
      `/window\.pack\.burgs is not available/`.
    - Icon NOT touched. addLines NOT called.

25. **Integration: pack.burgs not an array → same error.**
    - `globalThis.pack = { burgs: "nope" }`.

26. **Integration: missing #burgsLockAll element → no error, mutation still happens.**
    - `pack.burgs` = small set with one active burg.
    - `document.getElementById("burgsLockAll")` returns null.
    - Body still ok; mutation applied.

27. **Integration: burgsOverviewAddLines global missing → no error.**
    - `globalThis.burgsOverviewAddLines = undefined`.
    - Body still ok.

28. **Integration: document undefined (SSR-safe) → no error, mutation applied.**
    - `globalThis.document = undefined`.
    - Body still ok; mutation applied (via `setLock` going through
      `getPack().burgs[i]` directly).

29. **Integration: empty active set → vacuous true, no setLock calls.**
    - `pack.burgs = [{ i: 0 }]` (only placeholder).
    - Body: `active_count: 0`, `previously_all_locked: true`,
      `now_locked: 0`, `now_unlocked: 0`, `skipped_removed: 0`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0 info**.
  Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **Use case fidelity.** Mirrors `toggleLockAll` exactly: filter
  active = `b.i && !b.removed`, compute `allLocked` with `every`,
  set `b.lock = !allLocked` for each active. The icon className uses
  the same `allLocked ? "icon-lock" : "icon-lock-open"` ternary
  (PRE-mutation `allLocked`).
- **Toggle-to-single-state semantics, NOT invert.** Tests §1 (all
  locked → all unlocked), §2 (partial → all locked), §3 (all
  unlocked → all locked), §4 (mixed truthy/undefined → all locked).
  All four cover the "single state" outcome — there's no test where
  some burgs end up locked and others unlocked, because that's not
  what this tool does.
- **In-place mutation test is present.** Test §8 captures the array
  reference AND each individual burg object reference, then asserts
  identity equality after mutation. Test §22 also captures the array
  reference in the integration block. The setLock implementation
  uses direct property assignment (`burg.lock = lock`), not
  reassignment, which preserves object identity.
- **Removed burgs untouched test is present.** Test §5 explicitly
  asserts `burgs[2].lock === true` after the toggle, where
  `burgs[2].lock` was `true` AND `burgs[2].removed === true` BEFORE
  the call. Since the toggle direction was "lock all" (everyone
  becomes `true`), the assertion would still pass if removed burgs
  were touched — BUT we also assert `skipped_removed: 1` which
  forces the implementation to filter. Stronger version: the test
  could use a scenario where the toggle direction is "unlock all"
  AND the removed burg has `lock=true`, so the assertion that the
  removed burg's lock stays `true` becomes load-bearing. Adding
  a clarifying note to the test description, but the §5 fixture
  achieves this — note that pre-mutation `allLocked` is `false`
  (because `burgs[1]` and `burgs[3]` are unlocked), so the toggle
  direction is "lock all". The removed burg's `lock=true` stays
  `true`, but that's the same value as the new lock state, so the
  test isn't strict enough. **CORRECTED**: see Corrections below.
- **Burg 0 untouched test is present.** Test §6 sets
  `burgs[0].lock = true`, then runs a toggle where the direction is
  "lock all" (all active are unlocked). Then asserts
  `burgs[0].lock === true`. The placeholder's existing lock=true
  matches the toggle direction, so this isn't strict enough either.
  **CORRECTED**: see Corrections below.
- **Empty-active-set vacuous-true case is present.** Test §7. The
  body asserts `previously_all_locked: true` (vacuous truth) and
  `setLock` is NOT called. Confirms behavior matches the legacy
  `every` semantics.
- **Best-effort callbacks.** Tests §13–§16 cover missing /
  throwing `addLines` and `setLockAllIcon`. None block the result.
- **Error wording is exact.** The error string
  `"window.pack.burgs is not available; the map hasn't finished loading."`
  is asserted as an exact match in tests §9, §10. Integration tests
  §24, §25 use a regex.
- **Tool schema.** `properties: {}` and no `required` field.
  Test §18 asserts the exact shape.
- **Registry slot.** The list isn't strictly alphabetic; topical
  grouping is the norm. Plan places the registration at the end of
  the list with the other recently-added bulk tools.

## Corrections (added during step 5 review)

Re-read both files. Found and addressed two weak load-bearing tests:

- **Test §5 ("removed burgs untouched") was not strict.** The
  original fixture had the removed burg at `lock=true` AND the toggle
  direction was "lock all" (so the new state was also `true`). This
  means an implementation that touched the removed burg would still
  pass the test (because the value would stay `true`). **Updated the
  fixture so the toggle direction is "unlock all" and the removed
  burg starts at `lock=true`** — so the only way the removed burg
  ends up `true` is if it was correctly skipped.

  Revised fixture for test §5:
  ```ts
  [
    { i: 0 },
    { i: 1, lock: true, name: "A" },
    { i: 2, lock: true, removed: true, name: "Removed" },
    { i: 3, lock: true, name: "C" },
  ]
  ```
  Now: pre-mutation `allLocked` is `true` (because the only active
  burgs are `burgs[1]` and `burgs[3]`, both locked — the removed
  burg is filtered out of the `every` check). Toggle direction is
  "unlock all". Body:
  ```jsonc
  {
    ok: true,
    active_count: 2,
    previously_all_locked: true,
    now_locked: 0,
    now_unlocked: 2,
    skipped_removed: 1,
  }
  ```
  Active burgs `burgs[1]` and `burgs[3]` become `lock === false`.
  Removed burg `burgs[2]` stays `lock === true` — load-bearing
  because the new state would have been `false` if it had been
  touched.

- **Test §6 ("burg 0 untouched") was not strict.** Same issue —
  `burgs[0].lock=true` and the toggle direction was "lock all"
  (also `true`). **Updated the fixture so the toggle direction is
  "unlock all" and `burgs[0].lock` starts at `true`** — so the only
  way `burgs[0].lock` stays `true` is if it was correctly skipped.

  Revised fixture for test §6:
  ```ts
  [
    { i: 0, lock: true },
    { i: 1, lock: true, name: "A" },
    { i: 2, lock: true, name: "B" },
  ]
  ```
  Pre-mutation `allLocked` is `true` (active burgs all locked).
  Toggle direction is "unlock all". Body: `previously_all_locked: true`,
  `now_locked: 0`, `now_unlocked: 2`, `active_count: 2`,
  `skipped_removed: 0`. After: `burgs[0].lock === true` (untouched
  load-bearing — would be `false` if touched), `burgs[1].lock === false`,
  `burgs[2].lock === false`.

- **In-place mutation test §8 covers BOTH array identity and per-burg
  object identity.** Verified — see the assertions list. The
  `setLock` implementation does direct property assignment, never
  rewrites the array or replaces a burg object.

- **Empty-active-set test §7 verified `setLock` is NOT called.**
  The implementation skips the loop entirely when `activeIndices`
  is empty, so the spy gets zero calls — checked via
  `expect(setLock).not.toHaveBeenCalled()`.
