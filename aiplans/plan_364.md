# Plan 364 — `regenerate_state_full_name` AI chat tool

## Use case

Add an AI chat tool `regenerate_state_full_name` that derives a new
`fullName` for a single state from its short `name` and `formName`,
mirroring the legacy `regenerateFullName` function in
`public/modules/dynamic/editors/states-editor.js` (lines 429–441):

```js
function regenerateFullName() {
  const short = byId("stateNameEditorShort").value;
  const form  = byId("stateNameEditorSelectForm").value;
  byId("stateNameEditorFull").value = getFullName();

  function getFullName() {
    if (!form) return short;
    if (!short && form) return "The " + form;
    const tick = +stateNameEditorFullRegenerate.dataset.tick;
    stateNameEditorFullRegenerate.dataset.tick = tick + 1;
    return tick % 2 ? getAdjective(short) + " " + form : form + " of " + short;
  }
}
```

The user can already trigger this via the "Regenerate" button on the
full-name field of the State editor. The button alternates between two
patterns ("Adjective Form" and "Form of Name") on each click via a DOM
tick-counter. The AI cannot.

`window.getAdjective(noun)` is the existing global helper (registered
in `src/utils/index.ts:21` from `src/utils/languageUtils.ts:32`) that
produces an adjectival form (e.g. "Valorian" from "Valoria").

We already have:

- `rename_state` — manual short+full name setter
- `regenerate_state_name` — single-state short-name regen
- `regenerate_all_state_names` — bulk
- `set_state_form` — sets `state.form` + `state.formName`

This plan adds the missing **fullName-from-short-and-form** derivation.
Useful when the AI changes a state's short name or form via
`rename_state` / `set_state_form` and wants to refresh the displayed
full name without composing it by hand.

## Lint baseline

```
$ npm run lint 2>&1 | tail -50
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 833 files in 672ms. No fixes applied.
```

Clean baseline — zero warnings.

## Behavior

1. Resolve `state` by numeric id or case-insensitive `name` /
   `fullName`. Reuse `findEntityByRef` against
   `getPackCollection<RawState>("states")`.
2. Reject:
   - missing state → `State ${ref} not found.`
   - removed state → `Cannot regenerate full name for removed state ${i}.`
   - state 0 (Neutrals placeholder) →
     `Cannot regenerate full name for state 0 (the Neutrals placeholder).`
3. Read the legacy editor's two relevant inputs:
   - `short = state.name ?? ""` (the editor reads
     `byId("stateNameEditorShort").value`, which is initialized from
     `s.name` at line 378 of the editor).
   - `form  = state.formName ?? ""` (the editor reads
     `byId("stateNameEditorSelectForm").value`, which is initialized
     via `applyOption(stateNameEditorSelectForm, s.formName)` at line
     379, and on save writes back to `s.formName` at line 460). The
     `state.form` field stores the parent category — see
     `set-state-form.ts` — but the editor's full-name expression uses
     the specific value (formName), not the category.
4. Resolve `pattern` (default `"adjective"`):
   - `"adjective"` → `getAdjective(short) + " " + form`
   - `"form_of"`   → `form + " of " + short`
5. Compute `newFullName` per the legacy `getFullName` flow, but with
   pattern selection driven by the input parameter (the legacy DOM
   tick-counter doesn't translate cleanly to a stateless tool):
   - if `!short && !form` → error
     `State has neither short name nor form.` (no useful fullName
     possible).
   - if `!form` (short only) → `newFullName = short`,
     `pattern_used = "short_only"`.
   - if `!short && form` → `newFullName = "The " + form`,
     `pattern_used = "the_form"`.
   - else (both present) → apply selected `pattern`:
     - `"adjective"` → require `window.getAdjective`; error if
       missing.
     - `"form_of"` → no extra requirements.
     - `pattern_used` echoes the input pattern.
6. Capture `previous_full_name = state.fullName ?? null` BEFORE
   mutation.
7. Write `state.fullName = newFullName`.
8. Best-effort: call `drawStateLabels([state.i])`. Wrap in try/catch
   and swallow any throw (matches `regenerate-state-name.ts` pattern).
9. Return the success body documented below.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "state": {
      "type": ["integer", "string"],
      "description": "State id (> 0) or case-insensitive name / fullName."
    },
    "pattern": {
      "type": "string",
      "enum": ["adjective", "form_of"],
      "default": "adjective",
      "description": "Combination pattern: 'adjective' = Adjective Form (e.g. 'Valorian Republic'); 'form_of' = Form of Short (e.g. 'Republic of Valoria'). Ignored when short name or form is missing — the special-case fallbacks ('short only', 'The Form') always win."
    }
  },
  "required": ["state"]
}
```

## Validation

- `state` resolves to a non-removed state, not state 0.
- `pattern`, if provided, must be one of `"adjective"` or `"form_of"`.
- `window.getAdjective` must be available **only** when both short and
  form are present AND the resolved pattern is `"adjective"`.

## Errors (verbatim)

- `State ${ref} not found.`
- `Cannot regenerate full name for removed state ${i}.`
- `Cannot regenerate full name for state 0 (the Neutrals placeholder).`
- `pattern must be 'adjective' or 'form_of'.`
- `State has neither short name nor form.`
- `window.getAdjective is not available; the map hasn't finished loading.`
  (only when the adjective branch is taken)
- Plus the standard `state must be a positive integer id or a non-empty name string.` from `parseEntityRef`.
- Runtime errors from `apply` propagated as-is.

## Success result

```jsonc
{
  "ok": true,
  "state": { "i": 3, "name": "Valoria" },
  "previous_full_name": "Republic of Valoria",
  "full_name": "Valorian Republic",
  "pattern_used": "adjective"   // may be "short_only" or "the_form" when short or form is missing
}
```

`previous_full_name` is `null` when the state had no `fullName` set.

## Files

NEW:

- `src/ai/tools/regenerate-state-full-name.ts`
- `src/ai/tools/regenerate-state-full-name.test.ts`

MODIFY:

- `src/ai/index.ts`
  - import `regenerateStateFullNameTool` (alphabetical — slot between
    `regenerate-state-coa` and `regenerate-state-name`).
  - re-export `createRegenerateStateFullNameTool` and
    `regenerateStateFullNameTool`.
  - `registry.register(regenerateStateFullNameTool)` near the other
    state-name regen registrations (immediately after
    `regenerateStateNameTool`).

## Tests (Vitest)

Tool-layer (mocked runtime; runtime exposes
`find`, `apply`, `getAdjective`, `redraw`):

1. happy path `pattern="adjective"`: short="Valoria", form="Republic"
   → `full_name="Valorian Republic"`, `pattern_used="adjective"`
   (with stubbed `runtime.getAdjective` returning "Valorian"). Asserts
   `runtime.apply(3, "Valorian Republic")` called.
2. happy path `pattern="form_of"`: short="Valoria", form="Republic"
   → `full_name="Republic of Valoria"`, `pattern_used="form_of"`.
   `runtime.getAdjective` NOT called.
3. default pattern (omitted) === `"adjective"` (asserts both result and
   that the adjective code path was taken).
4. missing form (`form=""`) with short="Valoria" →
   `full_name="Valoria"`, `pattern_used="short_only"`. `getAdjective`
   not called.
5. missing short (`short=""`) with form="Empire" →
   `full_name="The Empire"`, `pattern_used="the_form"`.
6. both missing (`short=""`, `form=""`) → error
   `State has neither short name nor form.`. `runtime.apply` not
   called.
7. state not found (`runtime.find` returns null) →
   `State ${ref} not found.`. `runtime.apply` not called.
8. state 0 (`runtime.find` returns `{ i: 0, … }`) →
   `Cannot regenerate full name for state 0 (the Neutrals placeholder).`.
9. removed state (`runtime.find` returns `{ removed: true, … }`) →
   `Cannot regenerate full name for removed state ${i}.`.
10. invalid `state` ref (null, undefined, 0, -1, 1.5, ""): each yields
    an error; `runtime.find` not called for the parse-fail cases.
11. bad `pattern` (`"random"`, `1`, `""`) → error
    `pattern must be 'adjective' or 'form_of'.`. `runtime.apply` not
    called.
12. missing `getAdjective` (runtime returns `null` from
    `getAdjective`) WHEN pattern resolves to adjective → error
    `window.getAdjective is not available; the map hasn't finished loading.`.
13. missing `getAdjective` is NOT required when pattern is `"form_of"`
    or when special-case fallbacks (`short_only`, `the_form`) apply.
14. `previous_full_name` captured BEFORE mutation: `runtime.apply` is a
    spy that mutates the find-snapshot's `fullName`; the response body
    still reports the pre-call value.
15. `previous_full_name === null` when the state has no prior
    `fullName`.
16. `runtime.apply` throwing → propagated as `errorResult` with the
    thrown message.
17. registry round-trip: `buildDefaultRegistry().list()` includes
    `regenerate_state_full_name`.

Default-runtime integration with `globalThis.pack` and
`globalThis.getAdjective`:

18. integration adjective: `pack.states[3] = { i:3, name:"Valoria",
    formName:"Republic", fullName:"Republic of Valoria" }`,
    `globalThis.getAdjective = (n) => n + "n"` →
    after `regenerate_state_full_name({ state: 3 })`,
    `pack.states[3].fullName === "Valorian Republic"` and the response
    `previous_full_name === "Republic of Valoria"`.
19. integration form_of: same fixture, `pattern: "form_of"` →
    `pack.states[3].fullName === "Republic of Valoria"` (idempotent in
    this case but proves the branch).
20. integration `state.form` (parent category) is NOT used: pre-set
    `pack.states[3] = { i:3, name:"X", form:"Republic",
    formName:"Empire" }`; result must use "Empire" (formName), not
    "Republic" (form).
21. integration drawStateLabels called once on success with
    `[state.i]`.
22. integration drawStateLabels missing → call still succeeds.
23. integration drawStateLabels throws → call still succeeds (mutation
    already applied).
24. integration: state-object identity preserved (same reference
    before/after — only `fullName` field mutated; other fields like
    `name`, `formName`, `form`, `i` untouched).
25. integration: `globalThis.getAdjective` missing → adjective branch
    errors with the documented message; state.fullName NOT mutated.
26. integration: name-string lookup
    (`regenerate_state_full_name({ state: "valoria" })`) resolves
    case-insensitively.

## Verification

- `npm test` — all green
- `npx tsc --noEmit` — passes
- `npm run lint` — clean (no new warnings)

## Self-review

Re-read plan + tasks. Verified the mandatory checklist:

- **Both pattern options tested**: tests #1 (adjective) and #2
  (form_of) cover the two main combinations; #18, #19 cover them
  end-to-end through the default runtime.
- **Edge cases (no short / no form / both missing)**: tests #4
  (`short_only`), #5 (`the_form`), #6 (both missing → error).
- **`getAdjective` only called/required when adjective branch taken**:
  test #13 ensures `getAdjective` is not called for `form_of`,
  `short_only`, `the_form`; test #12 covers the required-only-here
  failure mode; test #25 covers the integration case.
- **`previous_full_name` captured BEFORE mutation**: test #14
  enforces this with a spy that intentionally writes to the find
  snapshot before the response is built; test #18 covers the same
  end-to-end via the default runtime.
- **`state.formName` vs `state.form` precedence**: integration test
  #20 specifically pre-populates BOTH `form` and `formName` with
  different values and asserts the tool uses `formName`. Reading
  `set-state-form.ts` (lines 144–150) and the legacy editor
  (`applyOption(stateNameEditorSelectForm, s.formName)` at line 379;
  `s.formName = formSelect.value` at line 460) confirms `formName` is
  the field shown in the form-select that drives `getFullName()`.
- **Error strings verbatim**: `State ${ref} not found.`,
  `Cannot regenerate full name for removed state ${i}.`,
  `Cannot regenerate full name for state 0 (the Neutrals placeholder).`,
  `pattern must be 'adjective' or 'form_of'.`,
  `State has neither short name nor form.`,
  `window.getAdjective is not available; the map hasn't finished loading.`.
- **Schema**: `pattern` is optional with default `"adjective"` and
  enum constraint; `state` accepts `["integer", "string"]` matching
  sibling state tools.

Corrections applied: none — both files line up with the required
workflow.
