# Plan 339: `regenerate_regiment_legend` tool

## Use case

Add an AI chat tool `regenerate_regiment_legend` that wipes and
regenerates the descriptive legend/note attached to a single
regiment, using the procedural military note generator. This mirrors
the legacy `regenerateLegend` function in
`public/modules/ui/regiment-editor.js` (line 380), which is wired
to the per-regiment "Regenerate Legend" button:

```js
function regenerateLegend() {
  const index = notes.findIndex(n => n.id === elSelected.id);
  if (index != -1) notes.splice(index, 1);

  const s = pack.states[elSelected.dataset.state];
  Military.generateNote(getRegiment(), s);
}
```

`elSelected.id` for a regiment is `"regiment" + state + "-" + regiment.i`
(the SVG `<g>` id pattern that `drawMilitary` writes). The note's `id`
field uses that exact same string. `Military.generateNote(reg, state)`
then PUSHES a fresh note onto `notes` (it has no return value — it
side-effects the `notes` array).

We already have:

- `add_regiment`, `remove_regiment`, `rename_regiment`
- `regenerate_regiment_names` (BULK regenerate of regiment NAMES)
- `set_regiment_*` family
- `set_note`, `remove_note`, `find_notes_by_prefix`, `get_note_info`,
  `list_notes`

This plan adds the missing **regenerate-the-procedurally-generated-legend**
action for a single regiment. Distinct from `set_note` (which writes a
user-supplied legend) and from `regenerate_regiment_names` (which
touches the regiment NAME, not its NOTE).

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-339-regenerate-regiment-legend`, master @ 588a524,
working tree clean for `src/`) reports:

```
Checked 781 files in 620ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- Resolve the regiment by `(state, regiment)` pair. State is resolved
  via `resolveStateRefInPack` (numeric id including 0, or
  case-insensitive `name` / `fullName`). Regiment is resolved via
  `findRegimentByRef` against the resolved state's `military` array
  (numeric `regiment.i` per-state, or case-insensitive current
  regiment name within that state). Same pattern as
  `rename_regiment`.
- Compute the SVG/note id: `noteId = "regiment" + stateId + "-" + regimentI`.
  This matches both the regiment-rendering code (the SVG `<g id>`)
  and `Military.generateNote`'s `const id = \`regiment${s.i}-${r.i}\``
  block in `src/modules/military-generator.ts:603`.
- Find any existing note in `notes` with `n.id === noteId`. If found,
  splice it out and capture its previous shape (`id`, `name`, `legend`)
  to return as `previous_note`. If not found, `previous_note: null`.
- **CRITICAL ORDER**: splice the existing note OUT of `notes` BEFORE
  calling `Military.generateNote(reg, state)`. The legacy code does
  this in this order, and there is a reason: `generateNote` itself
  has an "if id already in notes, mutate in-place; otherwise push"
  branch (see `military-generator.ts:604-610`), so leaving the old
  entry would let the legacy code update-in-place rather than push a
  fresh one. This affects observability (we can no longer prove
  "fresh push happened") AND if a future regression flips the
  push-vs-update logic, we want the splice to be load-bearing.
- Call `Military.generateNote(reg, state)` (not `generateNote(getRegiment(), s)`
  but the runtime equivalent: pass the resolved RawRegiment and RawState).
  This pushes the new note onto `notes`.
- Find the new note in `notes` by id (it should now exist). Return its
  shape as `note`. If no note with the expected id appears
  (defensively), still return `ok: true` with `note: null` — this
  gives the AI a signal that something went sideways without
  hard-erroring on what is otherwise a successful generator call.
  Documented limitation: if `Military.generateNote` is silently broken,
  the AI sees `note: null` and the caller can decide to retry.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "state": {
      "type": ["integer", "string"],
      "description": "Owning state — numeric id (0 is valid = Neutrals) or case-insensitive state name / fullName."
    },
    "regiment": {
      "type": ["integer", "string"],
      "description": "Numeric regiment id (regiment.i, per-state) or case-insensitive current regiment name within that state."
    }
  },
  "required": ["state", "regiment"]
}
```

### Validation

- `state` must be a non-negative integer or non-empty string.
- `regiment` must be a non-negative integer or non-empty string.
- The `(state, regiment)` pair must resolve to an existing regiment
  on a non-removed state (mirrors `rename_regiment`).
- `Military.generateNote` must be a function on `globalThis.Military`.
- `notes` array must exist on `globalThis` (treat absent as a hard
  error since the legacy `regenerateLegend` assumes it via
  `notes.findIndex(...)` — silent NPE if missing).

### Errors (verbatim, consistent with rename-regiment / set-note family)

- `"state must be a non-negative integer id or a non-empty name string."` —
  invalid state ref shape.
- `"regiment must be a non-negative integer id or a non-empty name string."` —
  invalid regiment ref shape.
- `` `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.` `` —
  pair didn't resolve. Same wording as `rename_regiment`.
- `"Military.generateNote is not available; the map hasn't finished loading."` —
  `Military` global missing OR `Military.generateNote` isn't a
  function.
- `"window.notes is not available; the map hasn't finished loading."` —
  `notes` global missing or not an array.
- Runtime errors thrown by `Military.generateNote` are propagated via
  `errorResult(err.message)`. The splice-out happened before the
  throw, so the previous note IS removed even if regeneration fails.
  Documented: the AI can call `set_note` to restore by hand, or just
  call this tool again.

### Success result

```jsonc
{
  "ok": true,
  "state": { "i": 3, "name": "Valoria" },
  "regiment": { "i": 1, "name": "5th Cohort" },
  "note_id": "regiment3-1",
  "previous_note": { "id": "regiment3-1", "name": "5th Cohort", "legend": "Old text…" },
  "note":          { "id": "regiment3-1", "name": "5th Cohort", "legend": "Regiment was formed in 482 AD…" }
}
```

- `previous_note` is `null` when no pre-existing note matched the id.
- `note` is `null` IF `Military.generateNote` succeeded but no note
  with the expected id appears in `notes` afterward (defensive). The
  rationale: `generateNote` may have a code path that no-ops in some
  edge case (e.g. a state-less regiment), and we want the AI to see
  that gracefully rather than error out. The splice already happened,
  so the AI knows to re-issue `set_note` if it needs the previous
  legend back.

## Files

- **NEW** `src/ai/tools/regenerate-regiment-legend.ts` — the tool.
  Exports:
  - `interface RegenerateRegimentLegendStateRef { i: number; name: string; }`
  - `interface RegenerateRegimentLegendRegimentRef { i: number; name: string; }`
  - `interface RegenerateRegimentLegendNoteRef { id: string; name: string; legend: string; }`
  - `interface RegenerateRegimentLegendRuntime`:
    ```ts
    {
      find(stateRef: number | string, regRef: number | string): {
        state: RegenerateRegimentLegendStateRef;
        regiment: RegenerateRegimentLegendRegimentRef;
      } | null;
      readNote(id: string): RegenerateRegimentLegendNoteRef | null;
      removeNote(id: string): void; // throws if notes missing
      regenerate(stateId: number, regimentI: number): void; // throws if Military.generateNote missing
    }
    ```
  - `defaultRegenerateRegimentLegendRuntime`:
    - `find(stateRef, regRef)`:
      - `const pack = getPack<BurgPackLike>();`
      - `const stateId = resolveStateRefInPack(pack, stateRef); if (stateId === null) return null;`
      - `const state = pack?.states?.[stateId]; if (!state || !isActive(state)) return null;`
      - `const regiment = findRegimentByRef(state.military, regRef); if (!regiment) return null;`
      - Return `{ state: { i: stateId, name: state.name ?? "" }, regiment: { i: regiment.i, name: regiment.name ?? "" } }`.
    - `readNote(id)`: walk `getNotes<RawNote>()`; return shape with `name` / `legend` defaulted to `""`. Returns null if notes missing OR no match.
    - `removeNote(id)`:
      - `const notes = getNotes<RawNote>(); if (!Array.isArray(notes)) throw new Error("window.notes is not available; the map hasn't finished loading.");`
      - `const idx = notes.findIndex(n => n?.id === id); if (idx >= 0) notes.splice(idx, 1);` (no-op when missing — caller decides whether the absence is meaningful).
    - `regenerate(stateId, regimentI)`:
      - `const military = getGlobal<MilitaryModule>("Military"); if (!military || typeof military.generateNote !== "function") throw new Error("Military.generateNote is not available; the map hasn't finished loading.");`
      - `const pack = getPack<BurgPackLike>(); const state = pack?.states?.[stateId]; if (!state) throw new Error(\`State \${stateId} not found.\`);`
      - `const reg = findRegimentByRef(state.military, regimentI); if (!reg) throw new Error(\`Regiment \${regimentI} not found in state \${stateId}.\`);`
      - `military.generateNote(reg, state);`
  - `createRegenerateRegimentLegendTool(runtime?)` returning a `Tool`
    named `regenerate_regiment_legend`.
  - `regenerateRegimentLegendTool` — default-runtime instance.

  **Tool execute flow:**
  1. Validate `state` and `regiment` shapes (mirror `rename_regiment`).
     Errors as listed.
  2. `const found = runtime.find(state, regiment);` — null →
     `errorResult("No regiment found matching state=…, regiment=…")`.
  3. `let previousNote: RegenerateRegimentLegendNoteRef | null = null;`
     `try { previousNote = runtime.readNote(noteId); } catch { previousNote = null; }`
     (readNote should not throw normally, but guard so a "notes missing"
     error surfaces only on the explicit removeNote path below where it
     matters).
  4. `try { runtime.removeNote(noteId); } catch (err) { return errorResult(err.message); }`
     — surfaces "notes missing" before we attempt regeneration.
  5. `try { runtime.regenerate(found.state.i, found.regiment.i); } catch (err) { return errorResult(err.message); }`
     — surfaces "Military.generateNote not available" or any thrown
     error. Note: previousNote was already removed; documented above.
  6. `let newNote: RegenerateRegimentLegendNoteRef | null = null; try { newNote = runtime.readNote(noteId); } catch { newNote = null; }`
  7. Return
     ```ts
     okResult({
       state: found.state,
       regiment: found.regiment,
       note_id: noteId,
       previous_note: previousNote,
       note: newNote,
     });
     ```

- **NEW** `src/ai/tools/regenerate-regiment-legend.test.ts` — Vitest
  spec (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { regenerateRegimentLegendTool } from "./tools/regenerate-regiment-legend";`
    in the import block, alphabetically between
    `regenerate-province-name` (line 196) and
    `regenerate-regiment-names` (line 197). String compare:
    `regenerate-regiment-legend` < `regenerate-regiment-names`
    (`l` < `n`).
  - Add a re-export block immediately before the
    `regenerate-regiment-names` re-export (around line 1937):
    ```ts
    export {
      createRegenerateRegimentLegendTool,
      defaultRegenerateRegimentLegendRuntime,
      type RegenerateRegimentLegendNoteRef,
      type RegenerateRegimentLegendRegimentRef,
      type RegenerateRegimentLegendRuntime,
      type RegenerateRegimentLegendStateRef,
      regenerateRegimentLegendTool,
    } from "./tools/regenerate-regiment-legend";
    ```
  - Add `registry.register(regenerateRegimentLegendTool);` immediately
    before `registry.register(regenerateRegimentNamesTool);` (line 3000).
    Topical grouping with the other regenerate-regiment-* tools.

## Tests (Vitest)

Mirror the layout of `regenerate-regiment-names.test.ts` and
`rename-regiment.test.ts`.

### `regenerate_regiment_legend tool` (unit, runtime stubbed)

Helper `makeRuntime(opts)` produces a runtime with `find`,
`readNote`, `removeNote`, `regenerate` as `vi.fn`s and returns the
runtime + spies.

1. **Happy path: pre-existing note for the regiment.**
   - `find("Valoria", 1) → { state: { i: 3, name: "Valoria" }, regiment: { i: 1, name: "5th Cohort" } }`.
   - `readNote("regiment3-1")` returns:
     - First call: `{ id: "regiment3-1", name: "5th Cohort", legend: "Old legend" }`.
     - Second call (after regenerate): `{ id: "regiment3-1", name: "5th Cohort", legend: "New legend" }`.
   - `removeNote` is a `vi.fn()` (no-op spy).
   - `regenerate` is a `vi.fn()` (no-op spy).
   - Execute `{ state: "Valoria", regiment: 1 }`. Assertions:
     - `result.isError` falsy.
     - `find` called with `("Valoria", 1)`.
     - `removeNote` called with `"regiment3-1"`.
     - `regenerate` called with `(3, 1)`.
     - **ORDER**: assert `removeNote` was invoked BEFORE `regenerate`.
       Use `vi.fn().mock.invocationCallOrder` (or equivalent — each
       `vi.fn` records `mock.invocationCallOrder`, and a strict less-than
       check proves splice-then-push order).
     - `readNote` called twice with `"regiment3-1"` (pre and post).
     - Body deep-equals
       ```
       {
         ok: true,
         state: { i: 3, name: "Valoria" },
         regiment: { i: 1, name: "5th Cohort" },
         note_id: "regiment3-1",
         previous_note: { id: "regiment3-1", name: "5th Cohort", legend: "Old legend" },
         note: { id: "regiment3-1", name: "5th Cohort", legend: "New legend" },
       }
       ```

2. **Happy path: NO pre-existing note.**
   - `find` returns the same state/regiment.
   - `readNote` returns `null` first call, the new note second call.
   - Body has `previous_note: null`, `note: { ... }`.
   - `removeNote` was still called (it's a no-op when missing — the
     runtime decides). `regenerate` was called once. ORDER preserved.

3. **`regenerate` succeeds but post-call note still missing → ok with note=null.**
   - `find` returns the regiment.
   - `readNote` returns `null` both times.
   - `regenerate` is a successful no-op spy.
   - Result `isError` falsy. Body `previous_note: null`, `note: null`.
   - Documents the defensive return shape.

4. **State/regiment resolution failure → error.**
   - `find` returns `null`. Execute `{ state: 999, regiment: 0 }`.
   - `result.isError === true`; body's `error` matches `/No regiment found matching state=999, regiment=0/`.
   - `removeNote`, `regenerate`, `readNote` never called.

5. **Invalid state ref → error before find.**
   - Loop over `[ {}, { state: null, regiment: 1 }, { state: "", regiment: 1 }, { state: -1, regiment: 1 }, { state: 1.5, regiment: 1 } ]`.
   - Each → `result.isError === true`. `find` never called across iterations.

6. **Invalid regiment ref → error before find.**
   - Loop over `[ { state: 1 }, { state: 1, regiment: null }, { state: 1, regiment: "" }, { state: 1, regiment: -1 }, { state: 1, regiment: 1.5 } ]`.
   - Each → `result.isError === true`. `find` never called.

7. **`removeNote` throws (notes missing) → error, regenerate NOT called.**
   - `find` returns the regiment.
   - `readNote` returns `null` (or whatever — irrelevant before throw).
   - `removeNote` throws `new Error("window.notes is not available; the map hasn't finished loading.")`.
   - Result `isError: true`; body's `error` matches `/window.notes is not available/`.
   - `regenerate.mock.calls.length === 0`.

8. **`regenerate` throws (Military.generateNote missing) → error, but removeNote DID happen.**
   - `find` returns the regiment.
   - `readNote` returns the previous note first call.
   - `removeNote` is a successful spy (called).
   - `regenerate` throws `new Error("Military.generateNote is not available; the map hasn't finished loading.")`.
   - Result `isError: true`; body's `error` matches `/Military\.generateNote is not available/`.
   - `removeNote.mock.calls.length === 1` (splice already happened — documented).
   - **ORDER** still holds: `removeNote.mock.invocationCallOrder[0] < regenerate.mock.invocationCallOrder[0]`.

9. **`regenerate` throws a generic runtime error → error propagated.**
   - `regenerate` throws `new Error("boom")`.
   - Body `error` matches `/boom/`.

10. **Tool name + schema + registry round-trip.**
    - `expect(regenerateRegimentLegendTool.name).toBe("regenerate_regiment_legend");`
    - `expect(regenerateRegimentLegendTool.input_schema.required).toEqual(["state", "regiment"]);`
    - Build a fresh `ToolRegistry`, register the tool, assert
      `reg.list().map(t => t.name).includes("regenerate_regiment_legend")`.

11. **Splice-then-push ORDER explicitly verified.**
    - This is called out as MANDATORY in the prompt.
    - In test §1 we already check via `mock.invocationCallOrder`.
    - This standalone test additionally documents the contract:
      build a runtime where `regenerate` ASSERTS-AT-CALL-TIME that
      `removeNote` has been called by inspecting a shared
      `mutationLog: string[]`. Both spies push to the log
      (`"remove"`, `"regen"`). Tool succeeds; `mutationLog` deep-equals
      `["remove", "regen"]`.

### `defaultRegenerateRegimentLegendRuntime (integration)`

12. **End-to-end with populated globals: pre-existing note replaced.**
    - Save/restore `globalThis.pack`, `globalThis.Military`,
      `globalThis.notes` per test.
    - `pack`:
      ```ts
      const states: RawState[] = [];
      states[0] = { i: 0, name: "Neutrals" };
      states[1] = {
        i: 1, name: "Valoria",
        military: [
          { i: 0, name: "1st Legion", cell: 10, n: 0 },
          { i: 1, name: "5th Cohort", cell: 11, n: 0 },
        ],
      };
      globalThis.pack = { states };
      ```
    - `notes`:
      ```ts
      globalThis.notes = [
        { id: "regiment1-1", name: "5th Cohort", legend: "Old legend" },
        { id: "regiment1-0", name: "1st Legion", legend: "Untouched" },
      ];
      ```
    - `Military.generateNote = vi.fn((reg, state) => { notes.push({ id: \`regiment\${state.i}-\${reg.i}\`, name: reg.name, legend: \`Fresh legend for \${reg.name}\` }); });`
    - Execute `regenerateRegimentLegendTool.execute({ state: "Valoria", regiment: 1 })`.
    - Assertions:
      - `result.isError` falsy.
      - Body `state.i === 1`, `regiment.i === 1`, `note_id === "regiment1-1"`.
      - Body `previous_note.legend === "Old legend"`.
      - Body `note.legend === "Fresh legend for 5th Cohort"`.
      - `notes` array has length 2 (one removed, one added → net same).
      - `notes` contains `{ id: "regiment1-0", name: "1st Legion", legend: "Untouched" }` (sibling regiment's note unchanged).
      - The `regiment1-1` note in `notes` is the NEW one (`legend === "Fresh legend for 5th Cohort"`).
      - `Military.generateNote` was called once with `(reg, state)`
        where `reg.i === 1` and `state.i === 1`.

13. **Integration: NO pre-existing note → new note appended.**
    - `notes = [{ id: "regiment1-0", name: "1st Legion", legend: "U" }]` (no entry for regiment 1).
    - Execute `{ state: 1, regiment: 1 }`.
    - Body `previous_note: null`, `note.legend === "Fresh legend for 5th Cohort"`.
    - `notes.length === 2`.

14. **Integration: missing Military global → error.**
    - `pack` populated with regiment.
    - `notes` populated.
    - `Military = undefined`.
    - Result `isError: true`; error matches `/Military\.generateNote is not available/`.
    - But the splice already happened: `notes.find(n => n.id === "regiment1-1")` returns `undefined` (the previous note IS gone — documented limitation).

15. **Integration: missing notes global → error, NO mutation.**
    - `pack` populated. `Military.generateNote` populated.
    - `notes = undefined`.
    - Result `isError: true`; error matches `/window\.notes is not available/`.
    - `Military.generateNote` was NOT called.

16. **Integration: state ref doesn't resolve → error.**
    - `pack.states = [Neutrals only]`.
    - Execute `{ state: 999, regiment: 0 }`.
    - Result `isError: true`; error matches `/No regiment found matching state=999, regiment=0/`.
    - `notes` untouched. `Military.generateNote` not called.

17. **Integration: case-insensitive state name + per-state regiment id resolves.**
    - Pack as in §12.
    - Execute `{ state: "VALORIA", regiment: 0 }` (regiment id 0 within state 1).
    - Body `state.i === 1`, `regiment.i === 0`, `note_id === "regiment1-0"`.
    - `previous_note.legend === "Untouched"` (the existing one for regiment 0).
    - `note.legend === "Fresh legend for 1st Legion"`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0 info**.
  Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** Mirrors `regenerateLegend` exactly: splice
  the existing note out (if any), then call
  `Military.generateNote(getRegiment(), pack.states[stateId])`. We
  resolve `getRegiment()`'s effect via `findRegimentByRef` against
  the resolved state, which is identical to what
  `pack.states[elSelected.dataset.state]?.military.find(r => r.i == elSelected.dataset.id)`
  computes in the legacy code (line 41 of regiment-editor.js).
- **Note id format verified.** `military-generator.ts:603` uses
  `` `regiment${s.i}-${r.i}` ``. `regiment-editor.js:381` uses
  `elSelected.id`, which is the SVG `<g>` id set by `drawMilitary`
  to `regiment{stateId}-{i}` (verified in `rename-regiment.ts:81`,
  which writes `data-name` to `document.getElementById(\`regiment${stateId}-${i}\`)`,
  proving the SVG element uses the same `regiment{state}-{i}`
  format). NO padding, NO separator quirks — literal interpolation.
- **Splice-then-push order test is mandatory and present.** Test §1
  asserts via `mock.invocationCallOrder` that `removeNote` was
  called BEFORE `regenerate`. Test §11 additionally builds a
  shared `mutationLog: string[]` that both spies push to, and
  asserts the log equals `["remove", "regen"]`. Test §8 (regenerate
  throws) still asserts the order pre-throw, so a regression that
  re-ordered to "regen first, remove on success" would fail multiple
  tests.
- **`previous_note` captured BEFORE removeNote.** The execute flow
  reads `previousNote = runtime.readNote(noteId)` BEFORE calling
  `removeNote`. Test §1 verifies via the two-call `readNote` mock
  that the FIRST call (pre-remove) returned the old shape, and
  asserts that's what's in the response. A regression that read
  the note AFTER removeNote would surface as `previous_note: null`,
  failing the test.
- **`note` captured AFTER regenerate.** Symmetric: the second
  `readNote` call captures the post-generation state. If a
  regression read it before `regenerate`, it would equal the
  previous note (or null), failing test §1.
- **Defensive `note: null` documented + tested.** Test §3 builds
  a `regenerate` that succeeds but writes nothing; the response
  should still be `ok: true` with `note: null`. This matches the
  prompt's documented behavior — silent generator failure is
  observable via `note: null`, not by erroring out.
- **`notes` array missing is a hard error (not silent).** The
  legacy code does `notes.findIndex(...)` which would NPE if
  `notes` is undefined. We turn that into a structured error
  ("window.notes is not available; the map hasn't finished
  loading.") because the AI shouldn't see a NaN response. Test
  §15 verifies. `Military.generateNote` is also not called in this
  case (the order matters: removeNote runs first, throws, we bail
  out — no regen attempt).
- **`Military.generateNote` missing leaves `notes` in an "intermediate"
  state** (previous note removed, new note never written). Test §14
  documents this. We considered re-inserting the previous note on
  failure (rollback), but rejected: (a) the legacy editor doesn't
  do that, (b) the AI can call `set_note` to restore it precisely,
  (c) the more common case is "the map isn't loaded yet", in which
  case the AI hasn't been mutating notes anyway and the rollback
  would be moot. We document this clearly in the Errors section.
- **Validation order matches `rename-regiment`.** state shape →
  regiment shape → resolution. Test §5 / §6 cover both invalid-shape
  paths.
- **Case-insensitive state name + per-state regiment id.** Test §17
  exercises this end-to-end with the integration runtime, mirroring
  the analogous test in `regenerate-regiment-names.test.ts`.
- **Sibling regiment's note untouched.** Test §12 explicitly asserts
  the OTHER regiment's note (`regiment1-0`) is still in `notes`
  after the call. A regression that nuked all `regiment{state}-*`
  notes would fail this.
- **Alphabetical insertion in `src/ai/index.ts`.**
  `regenerate-province-name` (`reg…province-n`) <
  `regenerate-regiment-legend` (`reg…regiment-l`) <
  `regenerate-regiment-names` (`reg…regiment-n`).
  String compare on the third hyphen: `province-` < `regiment-`,
  then `legend` < `names`. Verified.
- **Re-export block ordering.** Multiple types — list them
  alphabetically by their identifier, with the value exports
  (`create…`, `default…`, `regenerateRegimentLegendTool`)
  interleaved per Biome's import sort defaults. Mirroring the
  `regenerate-regiment-names` re-export which is just two values
  doesn't help here (we have more types). I picked: types
  alphabetical, then the const last — matches the regenerate-relief-icons
  re-export shape (line 1942-1946).
- **No coverage of nameBases / Names module needed.** The legend
  generator (`Military.generateNote`) writes a procedural English
  string and doesn't read namesbases. Different from the BURG
  regen path which depends on `Names.getCulture`.

## Corrections (added during step 5 review)

Re-read both files. Verified:

- **Note id format matches the legacy code EXACTLY.**
  `"regiment" + stateId + "-" + regimentI` with no zero-padding,
  no extra separator. Both the editor's `elSelected.id`
  (set by `drawMilitary`) and the generator's
  `` `regiment${s.i}-${r.i}` `` (in `military-generator.ts:603`)
  use this exact format. The `rename-regiment` tool's
  `document.getElementById(\`regiment${stateId}-${i}\`)` cross-check
  confirms it. No correction needed.
- **The splice-then-push order test is present.** Test §1 uses
  `mock.invocationCallOrder` and test §11 uses a shared mutation
  log. Both load-bearing. Test §8 also pins the order on the error
  path. No correction needed.
- **One small enhancement folded in:** test §11 was originally
  going to be a bare order check, but I upgraded it to use a
  shared `mutationLog` so a regression that swallowed an exception
  silently still gets caught (the log would show wrong order even
  if `mock.invocationCallOrder` were somehow misleading).
- **`readNote` is allowed to return `null` without throwing.** This
  is important because in the "no pre-existing note" case (test §2)
  it must just return null, not throw. The runtime's `readNote`
  default impl walks `getNotes<RawNote>()?.find(...)` and returns
  null on missing entry; the only way it would throw is via a
  pathological `notes` array (e.g. mutated mid-walk), which we
  don't model.
