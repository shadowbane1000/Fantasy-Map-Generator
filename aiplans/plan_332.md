# Plan 332: `restore_default_namesbases` tool

## Use case

Add an AI chat tool `restore_default_namesbases` that wipes any
user-edited namesbases and reloads the bundled defaults. This mirrors
the legacy `namesbaseRestoreDefault` function in
`public/modules/ui/namesbase-editor.js` (lines 215-233):

```js
function namesbaseRestoreDefault() {
  // … confirm dialog …
  Restore: function () {
    $(this).dialog("close");
    Names.clearChains();
    nameBases = Names.getNameBases();
    createBasesList();
    updateInputs();
  },
}
```

`window.Names.clearChains()` (defined in `src/modules/names-generator.ts`
line 78) drops any cached Markov chains. `window.Names.getNameBases()`
(line 323) returns the bundled default namesbase array (German, English,
French, Italian, …). The legacy code then **reassigns the global
`nameBases`** to that returned array — this is a global REASSIGNMENT,
not an in-place mutation of the existing array.

The user can already trigger this via the **Restore** button in the
namesbase editor; the AI chat had no equivalent until now.

We already have these AI namesbase tools:

- `add_namesbase`
- `list_namesbases`
- `rename_namesbase`
- `set_namesbase_duplication`
- `set_namesbase_length_range`
- `set_namesbase_multiword_rate`
- `set_namesbase_names`

This plan adds the missing **wipe-and-reload-defaults** action —
analogous to the no-input regenerate-style tools (`regenerate_zones`,
`regenerate_diplomacy`, `regenerate_emblems`, `randomize_states_expansion`).

## Lint baseline

`cd /workspace/.claude/worktrees/plan-332 && npm run lint 2>&1 | tail -50`
on the worktree base (master @ c177914, branch
`plan-332-restore-default-namesbases`, working tree clean) reports:

```
Checked 769 files in 601ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Capture `previous_count = Array.isArray(window.nameBases) ?
  window.nameBases.length : 0` for inclusion in the response.
- Call `Names.clearChains()` **first** (matches legacy order — clear
  cached chains before swapping in the new corpus so any stale state
  is dropped).
- Then call `Names.getNameBases()` and reassign
  `globalThis.nameBases = <returned array>`. **CRITICAL**: this is a
  global REASSIGNMENT, not an in-place mutation. The legacy code does
  `nameBases = Names.getNameBases()` which writes the global. The
  runtime exposes a `setNameBases(arr)` callback that does
  `globalThis.nameBases = arr` so this is testable in isolation.
- Compute `new_count = window.nameBases.length`.
- Compute `names = window.nameBases.map(b => b.name)` — the list of
  namesbase names after restoration. Useful so the AI can immediately
  see what's available again without a follow-up `list_namesbases`
  call.
- No SVG redraw is required — namesbases are a generation input, not
  on-canvas state. (Legacy `createBasesList()` and `updateInputs()`
  refresh the editor DOM but only when the editor popup is open;
  mirroring that would require a closure-scoped function not exposed
  globally — skipped intentionally, same precedent as
  `regenerate_diplomacy`'s skip of `refreshDiplomacyEditor()`.)

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

- `Names.getNameBases` must be a function. Otherwise:
  `"Names.getNameBases is not available; the map hasn't finished loading."`
- `Names.clearChains` must be a function. Otherwise:
  `"Names.clearChains is not available; the map hasn't finished loading."`
- `Names.getNameBases()` must return an array. Otherwise:
  `"Names.getNameBases did not return an array."`
- Validation order: `clearChains` callable check happens BEFORE
  `clearChains()` is called; `getNameBases` callable check happens
  BEFORE `getNameBases()` is called. Both `Names` lookups go through a
  single `runtime.clearChains()` / `runtime.getNameBases()` seam that
  performs its own callable check and throws on failure.

### Errors (verbatim, consistent with `regenerate_diplomacy`)

- `"Names.getNameBases is not available; the map hasn't finished loading."`
- `"Names.clearChains is not available; the map hasn't finished loading."`
- `"Names.getNameBases did not return an array."`
- Any thrown runtime error from `Names.clearChains()` or
  `Names.getNameBases()` is propagated via
  `errorResult(err instanceof Error ? err.message : String(err))`
  (mirrors all other regenerate-* / randomize-* tools).

### Success result

`okResult({ ok: true, previous_count: M, count: N, names: [...] })`

Example after restoration on a map that previously had 12 user-edited
bases:

```json
{
  "ok": true,
  "previous_count": 12,
  "count": 26,
  "names": ["German", "English", "French", "Italian", "Castillian", "Ruthenian", "…"]
}
```

When called on an unloaded map (no prior `nameBases`):

```json
{
  "ok": true,
  "previous_count": 0,
  "count": 26,
  "names": ["German", "English", "…"]
}
```

## Files

- **NEW** `src/ai/tools/restore-default-namesbases.ts` — the tool,
  patterned on `regenerate-diplomacy.ts` (no-input regenerate
  pattern). Exports:
  - `interface RestoreDefaultNamesbasesResult { previous_count: number; count: number; names: string[]; }`
  - `interface NamesbaseLike { name?: unknown; … }` (only `name` is
    consumed; rest are passthrough for the global reassignment).
  - `interface RestoreDefaultNamesbasesRuntime { clearChains(): void;
    getNameBases(): unknown[]; setNameBases(arr: unknown[]): void;
    countPrevious(): number; }`
  - `defaultRestoreDefaultNamesbasesRuntime`:
    - `clearChains()` reads `getGlobal<{ clearChains?: () => void }>("Names")`,
      throws the `"Names.clearChains is not available; …"` error if
      not callable, otherwise invokes it.
    - `getNameBases()` reads
      `getGlobal<{ getNameBases?: () => unknown[] }>("Names")`,
      throws the `"Names.getNameBases is not available; …"` error if
      not callable, otherwise invokes it. Caller checks the return
      value is an array.
    - `setNameBases(arr)` does
      `(globalThis as Record<string, unknown>).nameBases = arr;`.
      This is the load-bearing global-reassignment seam — it
      explicitly REPLACES the binding, not mutates an existing
      array.
    - `countPrevious()` returns
      `Array.isArray(globalThis.nameBases) ? globalThis.nameBases.length : 0`.
  - `createRestoreDefaultNamesbasesTool(runtime?)` returning a `Tool`
    named `restore_default_namesbases`.
  - `restoreDefaultNamesbasesTool` — default-runtime instance.
- **NEW** `src/ai/tools/restore-default-namesbases.test.ts` — Vitest
  spec (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { restoreDefaultNamesbasesTool } from "./tools/restore-default-namesbases";`
    between line 231 (`import { resetStateDiplomacyTool } from
    "./tools/reset-state-diplomacy";`) and line 232 (`import {
    saveMapTool } from "./tools/save-map";`). Alphabetical:
    `restore-` sorts after `reset-` and before `save-`.
  - Add a re-export block between the `reset-state-diplomacy`
    re-export (lines 2094-2102) and the `save-map` re-export
    (lines 2103-2107):
    ```ts
    export {
      createRestoreDefaultNamesbasesTool,
      defaultRestoreDefaultNamesbasesRuntime,
      type RestoreDefaultNamesbasesResult,
      type RestoreDefaultNamesbasesRuntime,
      restoreDefaultNamesbasesTool,
    } from "./tools/restore-default-namesbases";
    ```
  - Add `registry.register(restoreDefaultNamesbasesTool);` adjacent
    to other namesbase / restore actions. There is no obvious
    namesbase cluster in the registry. Place it immediately after
    `registry.register(resetStateDiplomacyTool);` (line 2958) — keeps
    "reset / restore" sequencing intuitive and slots before the
    `regenerateZonesTool` entry that follows.

## Tests (Vitest)

Mirror the layout of `regenerate-diplomacy.test.ts` (stub-runtime
suite + default-runtime integration suite).

### `restore_default_namesbases tool` (stub-runtime)

1. **Happy path: pre-existing nameBases get replaced**: stub runtime
   returns `previous_count: 7` and a freshly-built array of 26
   default-shaped entries. Tool returns
   `{ ok: true, previous_count: 7, count: 26, names: [...] }`.
   `clearChains` called exactly once; `getNameBases` called exactly
   once; `setNameBases` called exactly once with the array returned
   by `getNameBases`; `countPrevious` called exactly once.

2. **Call ORDER**: assert via `vi.fn().mock.invocationCallOrder` that
   the sequence is **countPrevious → clearChains → getNameBases →
   setNameBases**. Load-bearing: `clearChains` MUST happen before
   `getNameBases` reassigns (matches legacy line 223-224 order).
   `countPrevious` must happen first, before `clearChains`, so the
   reported `previous_count` reflects the BEFORE state, not the
   AFTER state.

3. **Global reassignment verified (identity, not mutation)**:
   in the integration suite (§7), pin
   `globalThis.nameBases === <array returned by Names.getNameBases()>`
   with strict `===`. The stub-runtime suite cannot verify this
   directly because `setNameBases` is a stub; instead this test
   asserts that the array passed to `setNameBases` is the same
   reference returned by `getNameBases` (`expect(setNameBasesArg).
   toBe(getNameBasesReturnValue)`).

4. **Surfaces clearChains errors**: stub `clearChains` throws
   `"Names.clearChains is not available; the map hasn't finished loading."`
   → result `isError: true`, error contains `"Names.clearChains"`.
   `getNameBases` and `setNameBases` are NOT called.

5. **Surfaces getNameBases errors**: stub `clearChains` returns
   normally; stub `getNameBases` throws
   `"Names.getNameBases is not available; the map hasn't finished loading."`
   → result `isError: true`, error contains `"Names.getNameBases"`.
   `setNameBases` is NOT called. (`clearChains` IS called — the
   legacy ordering sacrifices the chains even if the corpus reload
   fails. This matches the legacy code which clears unconditionally
   in line 223 then immediately reads the bases.)

6. **getNameBases returns non-array**: stub `getNameBases` returns
   `null` (or `"nope"`, or `{}`) → result `isError: true`, error
   exactly `"Names.getNameBases did not return an array."`.
   `setNameBases` is NOT called.

7. **Tool name + schema + registry round-trip**: assert
   `tool.name === "restore_default_namesbases"`,
   `tool.input_schema.type === "object"`,
   `tool.input_schema.properties` deep-equals `{}`,
   `tool.input_schema.required` is undefined. Then `new ToolRegistry()`,
   `registry.register(restoreDefaultNamesbasesTool)`,
   `expect(registry.list().map(t => t.name)).toContain(
   "restore_default_namesbases")`.

8. **Empty-input handling**: passing `{}`, `null`, `undefined`, and a
   payload with extraneous keys all execute identically — the tool
   ignores its input.

### `defaultRestoreDefaultNamesbasesRuntime (integration)`

Per-test save/restore of `globalThis.Names` and `globalThis.nameBases`
in `beforeEach` / `afterEach` (mirror `regenerate-diplomacy.test.ts`
lines 105-121).

9. **Calls Names.clearChains then reassigns nameBases**:
   - Set `globalThis.nameBases = [{ name: "OldA" }, { name: "OldB" }]`.
   - Build a `defaultBases = [{ name: "German" }, { name: "English" },
     { name: "French" }]` (3 entries, distinct names).
   - Set `globalThis.Names = { clearChains: vi.fn(), getNameBases:
     vi.fn(() => defaultBases) }`.
   - Call `restoreDefaultNamesbasesTool.execute({})`.
   - Assert result `ok: true`, `previous_count: 2`, `count: 3`,
     `names: ["German", "English", "French"]`.
   - Assert `Names.clearChains` called once with no args.
   - Assert `Names.getNameBases` called once with no args.
   - **Load-bearing identity check**:
     `expect(globalThis.nameBases).toBe(defaultBases)`. This is the
     `===` pin that proves the tool REASSIGNED rather than mutated
     in place.

10. **Errors when Names global is missing**:
    `globalThis.Names = undefined` → result `isError: true`, error
    matches `/Names\.clearChains/` (the first lookup that fails).
    `globalThis.nameBases` UNCHANGED (still the pre-test value).

11. **Errors when Names.clearChains is not a function**:
    `globalThis.Names = { clearChains: "nope", getNameBases: () => [] }`
    → result `isError: true`, error matches `/Names\.clearChains/`.
    `globalThis.nameBases` UNCHANGED.

12. **Errors when Names.getNameBases is not a function**:
    `globalThis.Names = { clearChains: vi.fn(), getNameBases: "nope" }`
    → result `isError: true`, error matches `/Names\.getNameBases/`.
    `Names.clearChains` IS called once (per legacy ordering).
    `globalThis.nameBases` UNCHANGED.

13. **Errors when Names.getNameBases returns non-array**:
    `globalThis.Names = { clearChains: vi.fn(), getNameBases: () =>
    null }` → result `isError: true`, error exactly
    `"Names.getNameBases did not return an array."`.
    `globalThis.nameBases` UNCHANGED (no reassignment when validation
    fails).

14. **previous_count handles missing/non-array nameBases**:
    `globalThis.nameBases = undefined` (or `42`, or `"nope"`); set
    `Names` to a working pair; call the tool. Assert
    `previous_count: 0`, `count: <new>`, `globalThis.nameBases ===
    <returned array>`.

15. **Surfaces a thrown runtime error from clearChains**:
    `globalThis.Names = { clearChains: () => { throw new Error(
    "boom"); }, getNameBases: vi.fn() }` → result `isError: true`,
    error `"boom"`. `getNameBases` NOT called. `globalThis.nameBases`
    UNCHANGED.

16. **Surfaces a thrown runtime error from getNameBases**:
    `globalThis.Names = { clearChains: vi.fn(), getNameBases: () => {
    throw new Error("boom2"); } }` → result `isError: true`, error
    `"boom2"`. `globalThis.nameBases` UNCHANGED.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `namesbaseRestoreDefault` does
  exactly four things: (1) close confirm dialog, (2) call
  `Names.clearChains()`, (3) `nameBases = Names.getNameBases()`,
  (4) refresh the editor DOM (`createBasesList()` + `updateInputs()`).
  The tool faithfully mirrors (2) and (3). (1) is a UI dialog — N/A
  for AI invocation. (4) is editor-popup-only DOM — skipped per same
  precedent as `regenerate_diplomacy` (legacy
  `refreshDiplomacyEditor()` skip).

- **Global REASSIGNMENT, not mutation.** The legacy code does
  `nameBases = ...` which writes the binding. If we instead spliced
  defaults into the existing array (e.g. `nameBases.length = 0;
  nameBases.push(...defaults)`) we would NOT match legacy semantics
  — any other code holding a reference to the original array would
  see the new contents. The legacy semantics mean such holders see
  the OLD contents, while only readers that resolve through the
  global see the new ones. Test §3 (stub) and §9 (integration)
  pin this with `===` identity checks; a regression that mutated
  in place would break both. The runtime exposes a `setNameBases`
  seam specifically so the test can pin `globalThis.nameBases ===
  defaultBases` after the tool runs.

- **Call ordering.** Test §2 asserts
  countPrevious → clearChains → getNameBases → setNameBases via
  `mock.invocationCallOrder`. Load-bearing because:
  - `countPrevious` must happen BEFORE `clearChains` to capture the
    pre-restoration count.
  - `clearChains` must happen BEFORE `getNameBases` reassigns —
    matches legacy line 223-224. (If we got it backwards, stale
    chains pointing into the OLD bases array would be retained
    while the new corpus replaces the binding.)
  - `setNameBases` must happen AFTER `getNameBases` (it consumes
    the return value).

- **Validation order vs legacy unconditional clear.** The legacy
  code calls `Names.clearChains()` unconditionally then
  `Names.getNameBases()`. We mirror this — even if `getNameBases`
  fails, the chains have already been cleared. Test §5 documents
  this (clearChains IS called even when getNameBases throws), and
  test §12 documents the equivalent for the "not a function" case.
  We accepted this asymmetry because (a) it matches legacy
  behaviour and (b) `clearChains()` is a cheap idempotent
  operation — clearing then failing the reload leaves the user with
  no chains, but the next call to `getBase` will lazily recompute
  using whatever `nameBases` currently is. No corruption.

- **Non-array return from getNameBases.** Test §6 / §13 cover this
  explicitly. The error message
  `"Names.getNameBases did not return an array."` is terse and
  consistent with the codebase's style. We validate this BEFORE
  calling `setNameBases` — never reassign `globalThis.nameBases` to
  a non-array.

- **`globalThis.nameBases` UNCHANGED on every error path.** Tests
  §10, §11, §12, §13, §15, §16 all explicitly assert this. Pinning
  it ensures a half-applied restoration never leaves the world in a
  broken state — either the tool succeeds cleanly or the global is
  exactly as it was. (Note: the chains may have been cleared per
  the legacy semantics above; the bases binding itself is
  unchanged.)

- **`previous_count` is robust to missing nameBases.** Test §14
  pins `previous_count: 0` when `globalThis.nameBases` is undefined
  / a non-array — defensive but honest.

- **Result field naming.** `previous_count`, `count`, `names` are
  snake_case + plain English. `count` mirrors the field name in
  `list_namesbases` (which also returns `{ count, items }`),
  keeping the AI's mental model consistent across namesbase tools.
  `names` is a plain string array, which is the most useful
  single-field summary for an LLM that just wiped the list and
  wants to know what's now available without a follow-up
  `list_namesbases` call.

- **No-input schema.** `properties: {}`, no `required` — matches
  `regenerate_diplomacy` exactly. Test §7 asserts the schema shape.

- **Alphabetical insertion.** `restore-default-namesbases` slots
  between `reset-state-diplomacy` (sort key `reset-`) and `save-map`
  (sort key `save-`) in imports AND re-exports. In the registry
  block, placement immediately after `resetStateDiplomacyTool`
  groups "reset / restore" sequencing intuitively without breaking
  the existing implicit groupings.

- **Test isolation.** Integration tests save/restore `globalThis.Names`
  and `globalThis.nameBases` in `beforeEach` / `afterEach` mirroring
  the pattern in `regenerate-diplomacy.test.ts`. Without this,
  state from earlier tests would bleed into later ones (especially
  since the tool literally writes to `globalThis.nameBases`).

- **Error wording matches neighbours.**
  `"Names.getNameBases is not available; the map hasn't finished loading."`
  and `"Names.clearChains is not available; the map hasn't finished loading."`
  follow the same pattern as `regenerate_diplomacy`'s
  `"States.generateDiplomacy is not available; the map hasn't finished loading."`.
  The non-array error is shorter (`"Names.getNameBases did not return an array."`)
  because it represents an internal contract violation, not a
  loading-stage problem.

- **Identity pin in stub-runtime suite (§3).** Originally proposed
  to skip identity assertion in the stub suite (since `setNameBases`
  is mocked there), but on review §3 was added to assert that the
  ARGUMENT passed to `setNameBases` is the SAME reference returned
  by `getNameBases`. This guards against a regression where the
  tool wraps / clones the array before passing it on (which would
  defeat the global-reassignment semantics). Combined with §9's
  end-to-end identity pin, this gives full coverage.
