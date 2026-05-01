# Plan 340: `remove_all_markers` tool

## Use case

Add an AI chat tool `remove_all_markers` that wipes every non-locked
marker (data + DOM + notes), preserving locked markers, mirroring the
"Remove all markers" button in the Markers Overview UI. The legacy
implementation in `public/modules/ui/markers-overview.js:211-222` is:

```js
function removeAllMarkers() {
  pack.markers = pack.markers.filter(({i, lock}) => {
    if (lock) return true;

    const id = `marker${i}`;
    byId(id)?.remove();
    notes = notes.filter(note => note.id !== id);
    return false;
  });

  addLines();
}
```

`triggerRemoveAll` (line 202) is the dialog-confirmation wrapper — the
AI tool skips the dialog (the model decides; users can revoke via the
permission prompt).

We already have:

- `add_marker`, `remove_marker`, `move_marker`
- `set_marker_*` (lock, pinned, type, icon, etc.)
- `list_markers`, `find_markers_*`, `get_marker_info`,
  `get_marker_distribution`, `list_marker_pins`, `list_marker_types`

This plan adds the missing **bulk remove** action. Locked markers
(`marker.lock`) are PRESERVED — the AI cannot wipe them this way
(matching the UI: locked markers survive bulk deletion).

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-340-remove-all-markers`, master @ 4b456b7, working tree
clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 785 files in 627ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- `pack.markers` is filtered: only entries with `lock === true` are
  kept. The new array is **REASSIGNED** to `pack.markers` (matches
  legacy `pack.markers = pack.markers.filter(...)` — NOT in-place).
  This is load-bearing: code observing `pack.markers` (like a debugger
  or a future reactive layer) must see the binding swap.
- For each removed marker (`m.lock !== true`), best-effort:
  - Compute `id = "marker" + m.i`.
  - Call `document.getElementById(id)?.remove()` (legacy `byId(id)?.remove()`),
    swallowing any thrown errors silently. The DOM op may fail if SVG
    state is mid-mutation; we don't want a half-cleared world.
- After computing the list of removed markers, filter `notes`
  globally to drop entries with `n.id === "marker" + i` for any
  removed `i`. Reassign `globalThis.notes` (matches legacy
  `notes = notes.filter(...)`).
- Best-effort: call `addLines()` (the markers overview refresher)
  if `globalThis.addLines` is a function. Wrap in try/catch — silently
  ignore if it throws or is missing. The overview may not be open;
  even so the call is a no-op when the panel isn't mounted.
- Do NOT also call `drawMarkers()`. The legacy code doesn't (the DOM
  removal already cleared the SVG nodes). Re-drawing would
  re-introduce the same elements from `pack.markers`, which now
  excludes the removed entries — so it would be a no-op AT BEST and
  potentially mask a regression at worst.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. Extraneous properties are tolerated and ignored.

### Validation

- `pack.markers` must exist and be an array.
- `notes` is best-effort: if absent or not an array, note pruning is
  silently skipped (the tool succeeds). The legacy code would NPE in
  this case (`notes.filter(...)` on undefined), but we treat the
  absence as "the AI is calling this before notes is initialised" and
  proceed gracefully. The marker pack mutation still happens.

### Errors (verbatim)

- `"window.pack.markers is not available; the map hasn't finished loading."`
  if `pack.markers` is missing or not an array.
- Runtime errors from `setMarkers` / `setNotes` are propagated via
  `errorResult(err.message)`. (These shouldn't happen — the runtime
  defaults just reassign global bindings — but the abstraction keeps
  the error path testable.)

### Success result

```jsonc
{
  "ok": true,
  "previous_count": M,        // total markers before the call
  "removed_count": N,         // M - kept_count
  "kept_count":  K,           // count of locked markers that survived
  "removed_marker_ids": [1, 3, 7, 12, ...],  // capped to first 50 by id (ascending)
  "removed_marker_ids_truncated": false      // true iff removed_count > 50
}
```

- `removed_marker_ids` is capped to the first 50 ids in **ascending
  order** (so behaviour is deterministic regardless of iteration
  order). When `removed_count > 50`, `removed_marker_ids_truncated`
  is `true` and `removed_marker_ids.length === 50`. Otherwise the flag
  is `false` and the array contains every removed id.
- `previous_count = removed_count + kept_count` (invariant).

## Files

- **NEW** `src/ai/tools/remove-all-markers.ts` — the tool. Exports:
  - `interface RemoveAllMarkersRuntime`:
    ```ts
    {
      getMarkers(): RawMarker[] | undefined;
      setMarkers(arr: RawMarker[]): void;
      getNotes(): RawNote[] | undefined;
      setNotes(arr: RawNote[]): void;
      removeDomNode(id: string): void;
      addLines?(): void;
    }
    ```
  - `defaultRemoveAllMarkersRuntime`:
    - `getMarkers()` → `getPack<{ markers?: RawMarker[] }>()?.markers`.
    - `setMarkers(arr)` → `(getPack() as { markers?: RawMarker[] }).markers = arr`.
      Uses the existing pack object reference (do NOT replace `pack`
      itself — only its `markers` property). Falls back to a no-op if
      pack is missing (the validation step in `execute` already
      surfaced the error before we get here).
    - `getNotes()` → `getNotes<RawNote>()` (the shared helper —
      returns undefined if absent or not an array).
    - `setNotes(arr)` → `(globalThis as Record<string, unknown>).notes = arr`.
      Mirrors the namesbase reassignment pattern in
      `restore-default-namesbases.ts`.
    - `removeDomNode(id)`:
      - `if (typeof document === "undefined") return;`
      - `try { document.getElementById(id)?.remove(); } catch { /* swallow */ }`.
      - Mirrors the legacy `byId(id)?.remove()` (which uses
        `document.getElementById`).
    - `addLines()`:
      - `const fn = getGlobal<() => void>("addLines");`
      - `if (typeof fn === "function") { try { fn(); } catch { /* swallow */ } }`.
  - `createRemoveAllMarkersTool(runtime?)` returning a `Tool` named
    `remove_all_markers`.
  - `removeAllMarkersTool` — default-runtime instance.

  **Tool execute flow:**
  1. `const markers = runtime.getMarkers();`
  2. If `!Array.isArray(markers)` → `errorResult("window.pack.markers is not available; the map hasn't finished loading.")`.
  3. Walk `markers` once. Build:
     - `kept: RawMarker[]` (those with `lock === true`).
     - `removedIds: number[]` (`m.i` for each non-locked marker).
  4. `const previous_count = markers.length;`
     `const removed_count = removedIds.length;`
     `const kept_count = kept.length;`
  5. For each `id` in `removedIds`: `runtime.removeDomNode("marker" + id)`.
  6. `try { runtime.setMarkers(kept); } catch (err) { return errorResult(err.message); }`
  7. Notes pruning (best-effort): `const notes = runtime.getNotes();`
     If `Array.isArray(notes)` AND `removedIds.length > 0`:
     - `const removedIdSet = new Set(removedIds.map(i => "marker" + i));`
     - `const filteredNotes = notes.filter(n => !(n && removedIdSet.has(n.id)));`
     - If `filteredNotes.length !== notes.length`:
       `try { runtime.setNotes(filteredNotes); } catch (err) { return errorResult(err.message); }`
     - Else: skip (no-op — saves the reassignment when nothing changed).
       Actually, **always reassign** when `removedIds.length > 0` and
       `notes` is an array — matching the legacy code's unconditional
       `notes = notes.filter(...)`. This is observable via identity
       check (`notesAfter !== notesBefore`).
  8. `runtime.addLines?.()` (best-effort, errors swallowed by the runtime).
  9. Sort `removedIds` ascending. Compute capped slice + truncation flag.
  10. Return `okResult({ previous_count, removed_count, kept_count, removed_marker_ids, removed_marker_ids_truncated })`.

- **NEW** `src/ai/tools/remove-all-markers.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { removeAllMarkersTool } from "./tools/remove-all-markers";`
    in the import block, alphabetically between `remove-burg-group`
    (line 209) and... wait. `remove-all-markers` < `remove-burg`.
    String compare: `remove-a` < `remove-b`, so it slots BEFORE
    `removeBurgTool` at line 208. Actually, check existing order:
    `removeBurgTool` (208), `removeBurgGroupTool` (209). Insert
    `removeAllMarkersTool` BEFORE `removeBurgTool`.
  - Add the re-export block near other `remove-*` re-exports,
    alphabetically before the `remove-burg` block (around line 2010).
  - Add `registry.register(removeAllMarkersTool);` near the other
    `remove*` registrations. Topical grouping with `removeMarkerTool`
    at line 3042 — slot immediately before it for proximity.

## Tests (Vitest)

Mirror the layout of `remove-marker.test.ts` and
`restore-default-namesbases.test.ts` (the two closest analogues).

### `remove_all_markers tool` (unit, runtime stubbed)

Helper `makeRuntime(markers, notes)` produces a runtime with
`getMarkers`/`setMarkers`/`getNotes`/`setNotes`/`removeDomNode`/
`addLines` as `vi.fn`s. Includes spies for assertions on calls.

1. **Happy path: 5 markers, 2 locked → 3 removed.**
   - `markers = [{i:1, lock:true}, {i:2}, {i:3}, {i:4, lock:true}, {i:7}]`.
   - `notes = []` (empty for simplicity in this test).
   - Execute `{}`. Assertions:
     - `result.isError` falsy.
     - `setMarkers` called once with an array of length 2 containing
       only the locked markers (ids 1, 4 in order).
     - **Identity check**: capture the array reference passed to
       `setMarkers`; assert `=== !==` the original `markers` array
       (it's a NEW array, not the same reference). This proves
       reassignment, not in-place mutation.
     - `removeDomNode` called 3 times with `"marker2"`, `"marker3"`,
       `"marker7"` (in input order). Locked markers' DOM (`marker1`,
       `marker4`) NOT touched: assert
       `removeDomNode.mock.calls.flat().includes("marker1") === false`
       and same for `"marker4"`.
     - `addLines` called once.
     - Body deep-equals
       ```
       {
         ok: true,
         previous_count: 5,
         removed_count: 3,
         kept_count: 2,
         removed_marker_ids: [2, 3, 7],
         removed_marker_ids_truncated: false,
       }
       ```

2. **DOM cleanup verification (locked DOM untouched).**
   - `markers = [{i:1, lock:true}, {i:2}, {i:3, lock:true}]`.
   - Execute `{}`.
   - `removeDomNode.mock.calls` deep-equals `[["marker2"]]` — only
     marker 2's DOM is touched. Locked markers' nodes are NEVER
     passed to `removeDomNode`.

3. **Notes pruning + identity check.**
   - `markers = [{i:1, lock:true}, {i:3}]`.
   - `notes = [{id:"marker1", legend:"keeps"}, {id:"marker3", legend:"goes"}, {id:"markerX", legend:"unrelated"}]`.
   - Execute `{}`.
   - `setNotes` called once with an array of length 2 containing
     `{id:"marker1",...}` and `{id:"markerX",...}` (in original order
     after filtering — `marker3` removed).
   - **Identity check**: the array passed to `setNotes` is a NEW
     reference (not the same as the original `notes`). Confirms
     reassignment.

4. **Notes pruning skipped when `removedIds.length === 0` (all locked).**
   - `markers = [{i:1, lock:true}, {i:2, lock:true}]`.
   - `notes = [{id:"marker1"}, {id:"markerX"}]`.
   - Execute `{}`.
   - `setNotes` NOT called (no removals → no need to reassign notes).
   - `setMarkers` IS called (with both markers, an identity-distinct
     array — semantically reassigning even when no ids change, to
     match the legacy `pack.markers = pack.markers.filter(...)` which
     unconditionally reassigns).

5. **All locked → no removal, returns zeros.**
   - `markers = [{i:1, lock:true}, {i:2, lock:true}]`.
   - Execute `{}`. Body:
     ```
     { ok:true, previous_count:2, removed_count:0, kept_count:2,
       removed_marker_ids:[], removed_marker_ids_truncated:false }
     ```
   - `removeDomNode` not called.
   - `addLines` still called (legacy unconditionally calls it).

6. **All unlocked → all removed.**
   - `markers = [{i:1}, {i:2}, {i:3}]`. (No `lock` field is the
     same as `lock !== true`.)
   - Body: `previous_count:3, removed_count:3, kept_count:0,
     removed_marker_ids:[1,2,3], removed_marker_ids_truncated:false`.
   - `setMarkers` called with `[]`.

7. **Empty markers array → ok with all zeros.**
   - `markers = []`. Body: `previous_count:0, removed_count:0,
     kept_count:0, removed_marker_ids:[], removed_marker_ids_truncated:false`.
   - `setMarkers` called with `[]` (identity-distinct from the
     original empty array — yes, even an empty array is reassigned).
   - `removeDomNode` not called. `setNotes` not called.

8. **Missing pack.markers → error.**
   - `getMarkers` returns `undefined`.
   - Result `isError: true`; error matches
     `/window\.pack\.markers is not available/`.
   - `setMarkers`, `setNotes`, `removeDomNode`, `addLines` NEVER called.

9. **Non-array pack.markers → error.**
   - `getMarkers` returns the string `"oops"`.
   - Same error as §8.

10. **Missing/non-array notes → tool still succeeds, notes left alone.**
    - `markers = [{i:5}]`. `getNotes` returns `undefined`.
    - Body has `removed_count:1`, `removed_marker_ids:[5]`.
    - `setNotes` NOT called.
    - `setMarkers` IS called with `[]`.

11. **Removed_marker_ids capped at 50 with truncation flag.**
    - Build `markers` of size 70: `Array.from({length:70}, (_,k) => ({i:k+1}))`.
      No locks.
    - Execute `{}`. Body:
      - `previous_count:70, removed_count:70, kept_count:0`.
      - `removed_marker_ids.length === 50`.
      - First and last ids: `removed_marker_ids[0] === 1`,
        `removed_marker_ids[49] === 50` (ascending order, first 50).
      - `removed_marker_ids_truncated === true`.

12. **Removed_marker_ids exactly at boundary (50) → not truncated.**
    - 50 unlocked markers. `removed_marker_ids.length === 50`,
      `removed_marker_ids_truncated === false`.

13. **Removed_marker_ids ordering deterministic regardless of input
    order.**
    - `markers = [{i:9}, {i:1}, {i:5}, {i:3}, {i:7}]` (no locks).
    - `removed_marker_ids` is `[1, 3, 5, 7, 9]` (ascending).

14. **`addLines` absent → no error.**
    - Build runtime where `addLines` is `undefined` (the optional
      property is just missing). Execute with valid markers. Result
      `isError` falsy.

15. **`addLines` throws → error swallowed (default runtime contract).**
    - The default runtime swallows errors from `addLines`. We test
      this at the integration level (§19). Unit tests don't need to
      cover it because the runtime contract for `addLines` is "may
      be undefined or a function; if a function, the runtime
      itself swallows errors before they leave the runtime"
      (the spy in §1/§14 doesn't throw, so this is trivially satisfied).

16. **Tool name + schema + registry round-trip.**
    - `expect(removeAllMarkersTool.name).toBe("remove_all_markers");`
    - `expect(removeAllMarkersTool.input_schema).toEqual({type:"object", properties:{}});`
    - Build a fresh `ToolRegistry`, register the tool, assert
      `reg.list().map(t => t.name).includes("remove_all_markers")`.

17. **Tolerates extraneous input properties.**
    - `tool.execute({ bogus: "value" })` succeeds.
    - `tool.execute(null)` succeeds.
    - `tool.execute(undefined)` succeeds.

### `defaultRemoveAllMarkersRuntime (integration)`

Save/restore `globalThis.pack`, `globalThis.notes`, `globalThis.addLines`,
and `globalThis.document` per test.

18. **End-to-end: pack + notes + DOM + addLines wired.**
    - Set up:
      ```ts
      const pack = {
        markers: [
          { i: 1 },
          { i: 2, lock: true },
          { i: 3 },
          { i: 4 },
        ],
      };
      globalThis.pack = pack;
      globalThis.notes = [
        { id: "marker1", legend: "L1" },
        { id: "marker3", legend: "L3" },
        { id: "markerX", legend: "unrelated" },
      ];
      const removed: string[] = [];
      const fakeDoc = {
        getElementById(id: string) {
          return {
            remove() { removed.push(id); },
          };
        },
      };
      globalThis.document = fakeDoc;
      const addLinesSpy = vi.fn();
      globalThis.addLines = addLinesSpy;
      ```
    - `const beforeMarkers = pack.markers; const beforeNotes = globalThis.notes;`
    - Execute `removeAllMarkersTool.execute({})`.
    - Assertions:
      - `result.isError` falsy.
      - Body: `previous_count:4, removed_count:3, kept_count:1,
        removed_marker_ids:[1,3,4], removed_marker_ids_truncated:false`.
      - **Identity**: `pack.markers !== beforeMarkers` (REASSIGNED).
      - `pack.markers` length 1, contains the locked marker (`i:2`).
      - **Identity**: `globalThis.notes !== beforeNotes` (REASSIGNED).
      - `globalThis.notes` length 2, contains only `marker2`'s
        survivor... wait, marker2 was the LOCKED one, no note for it
        in the input. The notes input had `marker1` and `marker3` (both
        will be pruned because their markers are gone) and `markerX`
        (which survives). So `globalThis.notes.length === 1` and
        contains only `{id:"markerX", ...}`.
      - `removed` (the DOM-removal log) deep-equals `["marker1", "marker3", "marker4"]`
        (in input order, the order ids were walked). Marker 2's DOM
        was NOT touched (locked).
      - `addLinesSpy` called once with no args.

19. **Integration: `addLines` throws → tool still succeeds.**
    - Same setup as §18, but `globalThis.addLines = vi.fn(() => { throw new Error("boom"); });`
    - Result `isError` falsy. Body unchanged.
    - `pack.markers` and `globalThis.notes` still reassigned correctly.

20. **Integration: `addLines` absent → tool still succeeds.**
    - Same setup, `globalThis.addLines = undefined`.
    - Result `isError` falsy.

21. **Integration: missing `pack.markers` → error.**
    - `globalThis.pack = {};`
    - Result `isError: true`; error matches
      `/window\.pack\.markers is not available/`.
    - `globalThis.notes` and DOM untouched.

22. **Integration: missing `globalThis.notes` → tool still succeeds,
    markers cleared, no notes mutation.**
    - `globalThis.pack = { markers: [{i:1}] }`.
    - `globalThis.notes = undefined`.
    - Result `isError` falsy. Body `removed_count:1`.
    - `pack.markers === []` (length 0, after reassignment).
    - `globalThis.notes` is still `undefined`.

23. **Integration: `document` missing → DOM removal silently skipped,
    rest still works.**
    - `globalThis.pack = { markers: [{i:1}, {i:2, lock:true}] }`.
    - `globalThis.notes = []`.
    - `globalThis.document = undefined`.
    - Result `isError` falsy. Body `removed_count:1`.
    - No throw despite the DOM unavailable.
    - `pack.markers` reassigned to `[{i:2, lock:true}]`.

24. **Integration: `document.getElementById(id).remove()` throws →
    swallowed, rest still works.**
    - Fake document where `remove()` throws.
    - Tool still succeeds; data mutations still happen.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0 info**.
  Baseline must hold.

## Self-review (added during step 5)

Reviewed plan + tasks against the use case:

- **Use case fidelity.** Mirrors `removeAllMarkers` exactly: filter
  out non-locked markers (reassign `pack.markers`), remove their SVG
  elements via `byId(id)?.remove()`, prune corresponding notes by id
  (reassign `notes`), call `addLines()`. The AI tool faithfully
  reproduces all four side effects.

- **Reassignment is load-bearing and tested.** The legacy code does
  `pack.markers = pack.markers.filter(...)` and
  `notes = notes.filter(...)` — both are REASSIGNMENTS (let bindings
  in the legacy file context, but observable as global property
  swaps from outside). Test §1 captures the array reference passed
  to `setMarkers` and asserts it's identity-distinct from the
  original. Test §3 does the same for `setNotes`. Test §18 (the
  integration) asserts via `pack.markers !== beforeMarkers` and
  `globalThis.notes !== beforeNotes`. A regression that did
  `markers.length = 0; markers.push(...kept)` (in-place mutation)
  would fail these tests.

- **Locked-marker DOM untouched.** Test §1 explicitly asserts that
  `removeDomNode` was never called with `"marker1"` or `"marker4"`
  (the locked ones). Test §2 deep-equals the entire `mock.calls`
  array to `[["marker2"]]`. Test §18 (integration) asserts the
  `removed` log is exactly `["marker1", "marker3", "marker4"]` —
  marker 2 (locked) never appears.

- **`removed_marker_ids` cap + ordering tested.** Test §11 covers
  the 70-marker case. Test §12 covers the boundary (exactly 50).
  Test §13 covers the ordering claim (ascending regardless of input
  order). The truncation flag is asserted in both §11 and §12.

- **Note pruning is best-effort.** Test §10 (unit) and §22
  (integration) confirm that `notes` missing or non-array is NOT a
  hard error — the tool succeeds with marker mutations applied. The
  legacy code would NPE here (`undefined.filter`); we improve on it
  by gracefully handling the case. Documented in Errors section.

- **`addLines` is best-effort.** Test §14 (absent) and §19/§20
  (integration absent and throwing) confirm. Documented in Behavior
  section. The default runtime wraps the call in try/catch, which
  is the contract — the runtime itself swallows; the tool doesn't
  need to.

- **DOM removal is best-effort.** Test §23 (no `document`) and §24
  (`remove()` throws) confirm the default runtime swallows DOM
  errors. The tool doesn't half-rollback.

- **No `drawMarkers()` call.** The legacy code doesn't call it;
  re-rendering would just rebuild the now-correct SVG state from
  `pack.markers`, but the DOM removal already cleared the right
  nodes. Calling `drawMarkers()` would be wasteful at best, and
  could mask a regression where DOM removal was broken (the
  redraw would fix it up). Documented in Behavior section.

- **Validation matches `restore-default-namesbases.ts`.** Both
  follow the pattern of "validate global is an array, otherwise
  emit a structured error mentioning the global's name."

- **Alphabetical insertion in `src/ai/index.ts`.**
  `remove-all-markers` < `remove-burg` (string compare: at index 7
  it's `a` vs `b`). Confirms placement BEFORE `removeBurgTool` at
  line 208. The re-export block follows the same alphabetical rule.
  The `registry.register` call is grouped TOPICALLY with other
  `remove*` registrations, so alphabetical ordering doesn't apply
  there — slot near `removeMarkerTool`.

- **`previous_count = removed_count + kept_count` is an invariant.**
  Tests §1, §5, §6, §7 all satisfy this trivially. Documenting it
  in the Success Result section helps consumers (and us, in case
  of future drift).

- **Consistent error wording.** `"window.pack.markers is not
  available; the map hasn't finished loading."` matches the
  consistent shape used by `restore-default-namesbases` and the
  `clear-rulers` tool ("X is not available; the map hasn't
  finished loading.").

- **No `removed: true` flag on markers.** The legacy code
  filter-removes markers entirely; it does NOT set
  `marker.removed = true` on the dropped ones. This is
  intentional — markers don't have a tombstone pattern (unlike
  burgs/states/etc.), they just disappear from the array. The
  `RawMarker.removed` field exists but isn't used by this code path.

## Corrections (added during step 5 review)

Re-read both files. Verified:

- **Tests use `===` identity checks** to confirm `pack.markers`
  and `notes` are REASSIGNED, not mutated in place. Tests §1, §3,
  §4 (unit), §18 (integration) all assert this. No correction
  needed.

- **Locked markers' DOM is verified UNTOUCHED.** Tests §1, §2,
  §18 all explicitly check that `removeDomNode` was NEVER called
  with the locked-marker ids. No correction needed.

- **`removed_marker_ids` cap and ordering are tested.** Tests §11
  (70 → cap 50, truncated true), §12 (50 → not truncated), §13
  (ordering ascending) cover all three concerns. No correction
  needed.

- **One small enhancement during review:** added test §4 to
  document the subtle case where ALL markers are locked. The
  legacy code STILL reassigns `pack.markers` even when no markers
  were removed (filter returns a new array unconditionally). The
  test captures this by asserting `setMarkers` is called even with
  `removed_count === 0`. This protects against a future
  optimisation that "skips reassignment when nothing changed",
  which would be observably different from the legacy semantics.

- **Validation order before mutations.** The plan's execute flow
  validates `pack.markers` BEFORE any DOM/notes/addLines work
  (step 2 in flow). Test §8 confirms `setMarkers`/`setNotes`/
  `removeDomNode`/`addLines` are NEVER called when the marker
  validation fails. No half-mutation possible.

- **`addLines` is unconditionally called** (not gated on
  `removed_count > 0`). The legacy code calls it after the filter
  unconditionally — the markers overview list needs refreshing
  even if zero markers were removed (the panel might already be
  showing stale data). Test §5 confirms.

- **Notes reassignment when removedIds is empty.** Re-read step 7
  of the execute flow: when `removedIds.length === 0`, we skip
  `setNotes` entirely. The rationale: the legacy code's
  `notes = notes.filter(note => note.id !== id)` runs INSIDE the
  marker-filter callback, only when a marker is being removed. If
  no markers are removed, `notes` is never reassigned. Test §4
  asserts `setNotes` is NOT called in the all-locked case, matching
  this. Confirmed correct interpretation of the legacy code.
