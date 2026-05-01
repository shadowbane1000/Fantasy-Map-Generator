# Plan 344: `remove_all_burgs` tool

## Use case

Add an AI chat tool `remove_all_burgs` that removes every burg that is
NOT locked AND NOT a capital, mirroring the "Remove all" button in the
Burgs Overview UI. The legacy implementation is `triggerAllBurgsRemove`
in `public/modules/ui/burgs-overview.js:555-568`:

```js
function triggerAllBurgsRemove() {
  const number = pack.burgs.filter(b => b.i && !b.removed && !b.capital && !b.lock).length;
  confirmationDialog({
    title: `Remove ${number} burgs`,
    message: `
      Are you sure you want to remove all <i>unlocked</i> burgs except for capitals?
      <br><i>To remove a capital you have to remove its state first</i>`,
    confirm: "Remove",
    onConfirm: () => {
      pack.burgs.filter(b => b.i && !(b.capital || b.lock)).forEach(b => Burgs.remove(b.i));
      burgsOverviewAddLines();
    }
  });
}
```

Two filter shapes appear in the legacy code:

- `count = filter(b => b.i && !b.removed && !b.capital && !b.lock).length`
  — used only for the dialog title's number.
- `removal = filter(b => b.i && !(b.capital || b.lock)).forEach(...)`
  — the actual side-effect set. Note this lacks `!b.removed`, but
  calling `Burgs.remove(i)` on an already-removed burg is effectively
  a no-op (it sets `removed = true` again, removes the same notes
  entry that's already gone, etc.). The legacy code happily passes
  removed burgs through `Burgs.remove` — but the resulting iteration
  is wasted work and the result count would be misleading.

We tighten this in the AI tool: we filter by `b.i && !b.removed && !b.capital && !b.lock` for BOTH counting AND removal — i.e. we never invoke `Burgs.remove` on already-removed burgs. This matches the dialog title's reported number exactly and avoids duplicate-removal noise in the result body.

We already have:

- `remove_burg`, `add_burg` (single)
- `toggle_lock_all_burgs` (plan 343), `regenerate_all_burg_names`
- The marker bulk family (`remove_all_markers`, `invert_marker_pins`,
  `invert_marker_locks`)

This plan adds the missing **bulk burg removal** action. CRITICAL:
capital burgs (`burg.capital === 1`) and locked burgs (`burg.lock === true`)
are SKIPPED — the AI cannot wipe them this way (matching the UI
strictly: removing a capital requires removing its state first via
`remove_state`, which the model can do separately if desired).

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-344-remove-all-burgs`, master @ 1521f58, working tree
clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 793 files in 629ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- Compute `targets = pack.burgs.filter(b => b && b.i && !b.removed && !b.capital && !b.lock)`.
  `b.i` excludes the placeholder at index 0. `!b.removed` excludes
  tombstoned burgs. `!b.capital` and `!b.lock` are the two skip
  classes.
- For each target burg (in id-ascending order — same as input order
  since `pack.burgs` is id-indexed): call `runtime.removeBurg(b.i)`.
  This delegates to `Burgs.remove(i)` (in `src/modules/burgs-generator.ts:715`)
  which:
  - Sets `burg.removed = true`.
  - Clears `pack.cells.burg[burg.cell] = 0`.
  - Splices the matching `notes` entry (`burg{i}`).
  - Removes `#burgCOA{i}` and the emblem `<use>` element.
  - Calls `removeBurgIcon(i)` and `removeBurgLabel(i)` to drop the
    SVG icon and label.
- Best-effort: call `runtime.addLines?.()` (which delegates to
  `window.burgsOverviewAddLines`) to refresh the overview list. Wrap
  in try/catch — silently ignore if it throws or is missing.
- We do NOT also handle DOM cleanup ourselves — `Burgs.remove` does it.
- We do NOT call `burgsOverviewAddLines` per-burg; only once at the
  end (matches the legacy code).

### Skip-bucket precedence (load-bearing)

A burg can be both a capital AND locked. The result body has two
separate counters: `skipped_capital` and `skipped_locked`. We pick a
single bucket per skipped burg (no double counting) using the rule:

- **`capital` takes precedence over `lock`.** A capital that is also
  locked is counted in `skipped_capital` only.

Rationale: the UI message "to remove a capital you have to remove its
state first" treats `capital` as the *primary* protection — locking
is a secondary protection that any burg can have, but capital-ness is
structural (tied to a state). Reporting capitals separately makes it
obvious why removal didn't proceed.

This is documented in the tool description so the model knows to read
`skipped_capital` first when triaging unexpected zero-removals.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. Extraneous/null/undefined inputs are tolerated and
ignored.

### Validation

- `pack.burgs` must exist and be an array.
- `Burgs.remove` must be a function (else error — the UI assumes it
  and `Burgs.remove` is set on `window` by `burgs-generator.ts:735`).

### Errors (verbatim)

- `"window.pack.burgs is not available; the map hasn't finished loading."`
  if `pack.burgs` is missing or not an array.
- `"window.Burgs.remove is not available; the map hasn't finished loading."`
  if `Burgs.remove` is not a function.
- Runtime errors thrown by `runtime.removeBurg(i)` are propagated via
  `errorResult(err.message)`. Mutations from previously-processed
  burgs are NOT rolled back (best-effort; the renderer is imperative
  and there is no transaction layer). The result body in this case
  is the standard error shape; the partial work is observable in
  `pack.burgs` (the burgs we already removed have `removed = true`).

### Success result

```jsonc
{
  "ok": true,
  "previous_count": M,        // active burgs before (b.i && !b.removed)
  "removed_count": N,
  "skipped_capital": C,       // burgs with capital=1 (regardless of lock)
  "skipped_locked":  L,       // non-capital burgs with lock=true
  "removed_burg_ids": [3, 7, 12, ...],  // ascending; capped at 50
  "removed_burg_ids_truncated": false   // true iff removed_count > 50
}
```

Invariant: `previous_count = removed_count + skipped_capital + skipped_locked`.

`removed_burg_ids` is sorted ascending and capped to the first 50
entries. When `removed_count > 50`, `removed_burg_ids_truncated` is
`true` and `removed_burg_ids.length === 50`. Otherwise the flag is
`false` and the array contains every removed id.

## Files

- **NEW** `src/ai/tools/remove-all-burgs.ts` — the tool. Exports:
  - `interface RemoveAllBurgsRuntime`:
    ```ts
    {
      getBurgs(): RawBurg[] | undefined;
      removeBurg(i: number): void;
      addLines?(): void;
    }
    ```
  - `defaultRemoveAllBurgsRuntime`:
    - `getBurgs()` → reads `pack.burgs`; returns `undefined` if
      missing or not an array.
    - `removeBurg(i)` → reads `globalThis.Burgs?.remove`; if not a
      function, throws with the validation-style error message
      (`"window.Burgs.remove is not available; the map hasn't finished loading."`).
      Otherwise calls `remove(i)`.
    - `addLines()` → reads `globalThis.burgsOverviewAddLines`; if a
      function, calls it inside try/catch (swallows errors).
  - `createRemoveAllBurgsTool(runtime?)` returning a `Tool` named
    `remove_all_burgs`.
  - `removeAllBurgsTool` — default-runtime instance.

  **Tool execute flow:**
  1. `let burgs: RawBurg[] | undefined;` then
     `try { burgs = runtime.getBurgs(); } catch (err) { return errorResult(...) }`.
  2. If `!Array.isArray(burgs)` → `errorResult("window.pack.burgs is not available; ...")`.
  3. Pre-flight check: validate `Burgs.remove` BEFORE doing any
     mutations. The default runtime's `removeBurg` throws if missing,
     so we must avoid the partial-mutation case where the very FIRST
     `removeBurg` call surfaces "not available" — we'd want to error
     out before any work. We accomplish this by exposing a separate
     `runtime.checkRemovable?()` hook... actually, simpler: have the
     default `removeBurg` ALSO throw a structured error message
     matching the validation copy, and let it surface through the
     normal try/catch. Since we do the work in id-ascending order
     starting from the first eligible burg, if `Burgs.remove` is
     missing the very first call throws and no partial mutation
     happens. We propagate the error verbatim.

     Wait — but the test for "missing Burgs.remove" should report
     the EXACT verbatim error message. So we need the default
     runtime's `removeBurg` to throw `new Error("window.Burgs.remove is not available; the map hasn't finished loading.")`,
     and the result body's `error` field will be exactly that string.

     This is the simplest design — no extra preflight method, just
     a careful error message in the runtime contract.
  4. Walk `burgs` once. Build:
     - `previous_count` = number of `b.i && !b.removed` entries.
     - `targets: number[]` = ids of `b && b.i && !b.removed && !b.capital && !b.lock`.
     - `skipped_capital` = count of `b && b.i && !b.removed && b.capital`.
     - `skipped_locked` = count of `b && b.i && !b.removed && !b.capital && b.lock`.
     (Per the precedence rule: capital wins; locked-AND-capital counts
     in `skipped_capital`.)
  5. For each `id` in `targets` (in iteration order, which is id-ascending):
     `try { runtime.removeBurg(id); processedIds.push(id); }
      catch (err) { return errorResult(err.message, { removed_burg_ids: ... }) }`.
     The error path includes the `removed_burg_ids` of work already
     done so the model can see what got partially applied.

     Actually, simpler: only include `removed_burg_ids` in the
     SUCCESS result. On error, the result is `{ ok:false, error }`.
     The model can call `list_burgs` afterward to inspect state.
     This matches `toggle-lock-all-burgs` and `regenerate-all-burg-names`
     error semantics.
  6. Best-effort `runtime.addLines?.()` (swallows errors).
  7. Sort `processedIds` ascending (already in order, but
     defensive). Compute the capped slice and truncation flag.
  8. Return `okResult({ previous_count, removed_count, skipped_capital, skipped_locked, removed_burg_ids, removed_burg_ids_truncated })`.

- **NEW** `src/ai/tools/remove-all-burgs.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { removeAllBurgsTool } from "./tools/remove-all-burgs";`
    in the import block. Slot alphabetically: `remove-all-burgs` <
    `remove-all-markers`, so it goes IMMEDIATELY BEFORE
    `removeAllMarkersTool` at line 209.
  - Add the re-export block before `remove-all-markers`
    (alphabetical) — currently around line 2018:
    ```ts
    export {
      createRemoveAllBurgsTool,
      defaultRemoveAllBurgsRuntime,
      type RemoveAllBurgsRuntime,
      removeAllBurgsTool,
    } from "./tools/remove-all-burgs";
    ```
  - Add `registry.register(removeAllBurgsTool);` near the `remove*`
    registrations. Slot IMMEDIATELY BEFORE
    `registry.register(removeAllMarkersTool);` at line 3075 (topical
    grouping with the other bulk-remove registrations).

## Tests (Vitest)

Mirror the layout of `remove-all-markers.test.ts` and
`toggle-lock-all-burgs.test.ts`.

### `remove_all_burgs tool` (unit, runtime stubbed)

Helper `makeRuntime({ burgs, addLines, removeBurgThrows, includeAddLines })`
produces a runtime with `getBurgs`/`removeBurg`/`addLines` as `vi.fn`s.
The default `removeBurg` mutates the source burgs array (sets
`removed = true`) so subsequent reads observe it. `removeBurgThrows`
overrides this with a thrower for error tests.

1. **Happy path: 6 active burgs (2 capitals, 1 locked, 1 locked+capital,
   2 normal) → only 2 removed.**
   - `burgs = [`
     - `{ i: 0 },`
     - `{ i: 1, name: "Cap1", capital: 1 },`
     - `{ i: 2, name: "Cap2", capital: 1 },`
     - `{ i: 3, name: "Locked", lock: true },`
     - `{ i: 4, name: "LockedCap", capital: 1, lock: true },`
     - `{ i: 5, name: "Norm5" },`
     - `{ i: 6, name: "Norm6" }`
     `]`
   - Execute `{}`. Assertions:
     - `result.isError` falsy.
     - Body deep-equals
       ```ts
       {
         ok: true,
         previous_count: 6,
         removed_count: 2,
         skipped_capital: 3,  // burgs 1, 2, 4 (4 is locked-capital → counts here)
         skipped_locked: 1,   // burg 3 only
         removed_burg_ids: [5, 6],
         removed_burg_ids_truncated: false,
       }
       ```
     - `removeBurg.mock.calls.flat()` deep-equals `[5, 6]`.
     - `removeBurg` was NOT called with `0`, `1`, `2`, `3`, or `4`.
     - `addLines` called once.

2. **Skip precedence: capital wins over locked.**
   - `burgs = [{ i: 0 }, { i: 1, capital: 1, lock: true }];`
   - Body: `previous_count:1, removed_count:0, skipped_capital:1, skipped_locked:0`.
   - `removeBurg` not called.

3. **Invariant: previous_count = removed_count + skipped_capital + skipped_locked.**
   - it.each over five varied configurations (all-normal, all-capitals,
     all-locked, mixed, empty active set). Assert the invariant on
     each result body.

4. **Burg 0 untouched (LOAD-BEARING).**
   - `burgs = [{ i: 0, name: "Placeholder" }, { i: 1, name: "A" }];`
   - Execute. `removeBurg` was NOT called with `0`. `removeBurg` was
     called once with `1`. `removed_burg_ids === [1]`. Body's
     `previous_count === 1` (burg 0 doesn't count).

5. **Already-removed burgs are not re-removed (LOAD-BEARING).**
   - `burgs = [{ i: 0 }, { i: 1, removed: true, name: "Gone" }, { i: 2, name: "Norm" }];`
   - Execute. `removeBurg` called once with `2` only.
   - `removed_burg_ids === [2]`. `previous_count === 1`. (Removed
     burgs don't count toward `previous_count` either — they're
     already gone.) `skipped_capital === 0`, `skipped_locked === 0`.
   - `removeBurg.mock.calls.flat()` does NOT contain `1`.

6. **Capitals never removed even when not locked.**
   - `burgs = [{ i: 0 }, { i: 1, capital: 1 }, { i: 2, capital: 1 }];`
   - Body: `removed_count:0, skipped_capital:2, skipped_locked:0`.
   - `removeBurg` not called.

7. **Locked never removed even when not capital.**
   - `burgs = [{ i: 0 }, { i: 1, lock: true }, { i: 2, lock: true }];`
   - Body: `removed_count:0, skipped_capital:0, skipped_locked:2`.
   - `removeBurg` not called.

8. **Empty active set (only burg 0 + only removed burgs).**
   - `burgs = [{ i: 0 }, { i: 1, removed: true }];`
   - Body: `previous_count:0, removed_count:0, skipped_capital:0,
     skipped_locked:0, removed_burg_ids:[], removed_burg_ids_truncated:false`.
   - `removeBurg` not called.

9. **Call ORDER: removeBurg invoked once per target in id-ascending
   order.**
   - `burgs = [{ i: 0 }, { i: 1, name: "A" }, { i: 2, capital: 1 },
     { i: 3, name: "C" }, { i: 4, lock: true }, { i: 5, name: "E" }];`
   - Execute. `removeBurg.mock.calls.flat()` deep-equals `[1, 3, 5]`.
     (Capital and locked skipped.)

10. **Missing pack.burgs → exact error.**
    - `getBurgs: () => undefined`.
    - Result `isError: true`; error matches `/window\.pack\.burgs is not available/`.
    - `removeBurg`, `addLines` NEVER called.

11. **Non-array pack.burgs → same error.**
    - `getBurgs: () => "oops" as unknown as RawBurg[]`.
    - Same error as §10.

12. **Missing Burgs.remove → exact error from runtime contract.**
    - `removeBurg: () => { throw new Error("window.Burgs.remove is not available; the map hasn't finished loading."); }`.
    - `burgs = [{ i: 0 }, { i: 1, name: "A" }];` (one removable).
    - Result `isError: true`; error matches
      `/window\.Burgs\.remove is not available/`.
    - The error originated from the FIRST `removeBurg` call, which
      means the burg's mutation didn't go through. (Defensive: the
      mock thrower doesn't mutate, so we can verify
      `addLines` WAS NOT called — error short-circuits.)

13. **removeBurg throws on second burg → error result; partial state
    visible in pack.burgs.**
    - `burgs = [{ i: 0 }, { i: 1, name: "A" }, { i: 2, name: "B" }, { i: 3, name: "C" }];`
    - Custom `removeBurg` that mutates burg[i].removed=true for i=1,
      then throws on i=2.
    - Result `isError: true`; error matches `/dom!/` (or whatever the
      thrower says).
    - `burgs[1].removed === true` (work that completed before throw
      stayed applied).
    - `burgs[2].removed` is undefined (the throwing call didn't
      mark removed — depends on how the runtime stub orders side
      effects, but the test pins down the visible state).
    - `burgs[3].removed` is undefined (never reached).
    - `addLines` NOT called (error short-circuits before
      best-effort).

14. **`removed_burg_ids` capped at 50; truncated flag for 70 burgs.**
    - `burgs = [{ i: 0 }, ...Array.from({length:70}, (_,k) => ({ i: k+1, name: \`B${k+1}\` }))];`
    - Body:
      - `previous_count:70, removed_count:70`.
      - `removed_burg_ids.length === 50`.
      - `removed_burg_ids[0] === 1`.
      - `removed_burg_ids[49] === 50`.
      - `removed_burg_ids_truncated === true`.

15. **Boundary: exactly 50 → not truncated.**
    - 50 normal burgs (plus burg 0). Body:
      `removed_burg_ids.length === 50`,
      `removed_burg_ids_truncated === false`.

16. **`removed_burg_ids` ascending regardless of input order.**
    - Already trivially true since we walk the source array in
      iteration order, and `pack.burgs[i].i === i` by convention. We
      add an explicit test using a non-canonical layout to lock in
      the sort step:
      `burgs = [{ i: 0 }, { i: 5, name: "E" }, { i: 1, name: "A" }, { i: 9, name: "I" }, { i: 3, name: "C" }];`
    - Body: `removed_burg_ids === [1, 3, 5, 9]` (ascending).

17. **`addLines` absent → no error.**
    - Build runtime with `includeAddLines: false`.
    - `burgs = [{ i: 0 }, { i: 1 }];`
    - Execute. Result `isError` falsy.

18. **`addLines` throws → swallowed; result still ok; mutations
    applied.**
    - `addLines: () => { throw new Error("svg!"); }`.
    - `burgs = [{ i: 0 }, { i: 1 }];`
    - Result `isError` falsy. `removeBurg` was called with `1`.

19. **getBurgs() throws → error propagated.**
    - `getBurgsThrows: new Error("boom")`.
    - Result `isError: true`; error matches `/boom/`.
    - `removeBurg` NOT called.

20. **Tool name + schema + registry round-trip.**
    - `expect(removeAllBurgsTool.name).toBe("remove_all_burgs");`
    - `expect(removeAllBurgsTool.input_schema).toEqual({ type:"object", properties:{} });`
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("remove_all_burgs")`.

21. **Tolerates extraneous / null / undefined input.**
    - `tool.execute({ bogus: 1 })`, `tool.execute(null)`,
      `tool.execute(undefined)` — all succeed.

### `defaultRemoveAllBurgsRuntime (integration)`

Save/restore `globalThis.pack`, `globalThis.Burgs`,
`globalThis.burgsOverviewAddLines` per test.

22. **End-to-end: pack + Burgs.remove + burgsOverviewAddLines wired.**
    - `globalThis.pack = { burgs: [{ i: 0 }, { i: 1, capital: 1 },
      { i: 2, lock: true }, { i: 3 }, { i: 4 }] };`
    - `const removeSpy = vi.fn((i: number) => { pack.burgs[i].removed = true; });`
    - `globalThis.Burgs = { remove: removeSpy };`
    - `const addLinesSpy = vi.fn();`
    - `globalThis.burgsOverviewAddLines = addLinesSpy;`
    - Execute. Body:
      `{ ok:true, previous_count:4, removed_count:2,
         skipped_capital:1, skipped_locked:1,
         removed_burg_ids:[3, 4], removed_burg_ids_truncated:false }`.
    - `removeSpy.mock.calls.flat()` deep-equals `[3, 4]`.
    - `removeSpy` was NOT called with `0`, `1`, `2`.
    - `pack.burgs[3].removed === true` and `pack.burgs[4].removed === true`.
    - `pack.burgs[1].removed` is falsy (capital preserved).
    - `pack.burgs[2].removed` is falsy (locked preserved).
    - `addLinesSpy` called once.

23. **Integration: missing pack → error.**
    - `globalThis.pack = undefined;`
    - Result `isError: true`; error matches `/window\.pack\.burgs is not available/`.

24. **Integration: pack.burgs missing → same error.**
    - `globalThis.pack = {};`
    - Same error.

25. **Integration: missing Burgs.remove → tool errors with the
    Burgs.remove validation message.**
    - `globalThis.pack = { burgs: [{ i: 0 }, { i: 1, name: "A" }] };`
    - `globalThis.Burgs = undefined;`
    - Result `isError: true`; error matches
      `/window\.Burgs\.remove is not available/`.
    - The single non-capital, non-locked burg was NOT removed (no
      `removed = true` on burg 1).

26. **Integration: Burgs object exists but `remove` is not a function.**
    - `globalThis.Burgs = { remove: "nope" };`
    - Same error as §25.

27. **Integration: burgsOverviewAddLines absent → tool succeeds.**
    - `globalThis.pack = { burgs: [{ i: 0 }, { i: 1 }] };`
    - `globalThis.Burgs = { remove: vi.fn((i) => { pack.burgs[i].removed = true; }) };`
    - `globalThis.burgsOverviewAddLines = undefined;`
    - Result `isError` falsy. `pack.burgs[1].removed === true`.

28. **Integration: burgsOverviewAddLines throws → swallowed; mutation
    applied.**
    - Same setup, but `burgsOverviewAddLines = vi.fn(() => { throw new Error("ui!") });`
    - Result `isError` falsy. `pack.burgs[1].removed === true`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0 info**.
  Baseline must hold.

## Self-review (added during step 5)

Re-read both files. Verified the four review checkpoints:

- **Skip-bucket rules unambiguous and tested.** Capital wins over
  locked: a burg with `capital === 1 && lock === true` is counted in
  `skipped_capital`, not `skipped_locked`. Test §1 has exactly such a
  burg (`i:4, capital:1, lock:true`) and asserts `skipped_capital:3,
  skipped_locked:1` (capitals: 1, 2, 4; locked-only: 3). Test §2
  isolates the precedence with a single burg that's both. The
  invariant `previous_count = removed_count + skipped_capital +
  skipped_locked` is asserted in §3 across five configurations to
  catch any accidental double-counting.

- **`Burgs.remove` invoked per burg (not as a batch).** Test §1
  asserts `removeBurg.mock.calls.flat()` deep-equals `[5, 6]` —
  exactly two calls, one per target. §9 asserts the call list and
  ordering across a 5-burg input. §13 verifies that a throw on the
  second call does NOT prevent the first call's mutation from being
  visible (best-effort, no rollback).

- **Burg 0 explicitly tested as untouched.** Test §4 has a burg-0
  with a real name and asserts `removeBurg` was NOT called with
  `0`. §1, §9, §22 also include `{ i: 0 }` placeholders and don't
  see them in the call lists.

- **Pre-removed burgs explicitly tested as untouched.** Test §5
  has a burg with `removed: true` mid-array and asserts
  `removeBurg.mock.calls.flat()` does NOT contain its id. The
  `previous_count` of `1` (not 2) confirms removed burgs aren't
  counted in the active set either.

## Corrections (added during step 5 review)

- **Tightened legacy filter for the active-set count.** The plan now
  filters by `b.i && !b.removed && !b.capital && !b.lock` for the
  removal target list (matching the dialog title's `number`
  computation), not the `b.i && !(b.capital || b.lock)` shape that
  the legacy `forEach` uses (which would re-call `Burgs.remove` on
  already-removed burgs). This is documented at the top of the
  Behavior section. Test §5 verifies removed burgs are skipped.

- **`previous_count` semantics pinned.** Defined as "active burgs
  before the call, i.e. `b.i && !b.removed`" — NOT `pack.burgs.length`,
  because that includes burg 0 and tombstones, which would mislead
  the model. The invariant test in §3 confirms the math holds.

- **Error message verbatim copies.** Both error paths (`pack.burgs`
  missing and `Burgs.remove` missing) use the canonical
  "is not available; the map hasn't finished loading." suffix
  matching the rest of the bulk-burg family
  (`toggle-lock-all-burgs.ts`).

- **No DOM cleanup duplication.** The plan explicitly notes that we
  do NOT remove DOM nodes ourselves — `Burgs.remove` already does it.
  Adding redundant DOM manipulation would risk double-removal errors
  and divergence from the legacy code path.

- **`burgsOverviewAddLines` called once at the end** (matching the
  legacy code), not per-burg. The legacy `triggerAllBurgsRemove`
  does `forEach(b => Burgs.remove(b.i)); burgsOverviewAddLines();` —
  one refresh after all removals. Test §1 asserts `addLines` called
  exactly once.

- **No rollback on partial failure.** Test §13 documents that
  intermediate `Burgs.remove` calls' side effects stay applied if a
  later call throws. This matches the rest of the codebase (no
  transaction layer; renderer is imperative). The error result is
  `{ ok:false, error }` with no extra body — the model can call
  `list_burgs` afterward to inspect.

- **Schema `properties: {}`, no `required`.** Matches the bulk-action
  family and Anthropic schema norms.
