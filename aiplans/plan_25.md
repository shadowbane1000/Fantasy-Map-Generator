# Plan 25 — Use Case: Change a state's form (Kingdom, Empire, etc.)

## Status

Iteration 25. 24 AI tools + shared helpers. Baseline 7 warnings / 1
info / 0 errors. 320 tests pass.

## Use Case

**"Change the government form of a specific state."**

The States Editor has a `#stateNameEditorSelectForm` dropdown with
five `optgroup`s: Monarchy, Republic, Union, Theocracy, Anarchy
(see `src/index.html:4506-4582`). Each option is a specific form
name like "Kingdom", "Empire", "Republic", "Theocracy".

`applyNameChange` (`states-editor.js:444-464`) sets two fields when
the form changes:

```js
s.form = <optgroup label>;   // category: "Monarchy", "Republic", …
s.formName = <option value>; // specific:   "Kingdom",  "Republic", …
```

and calls `drawStateLabels([s.i])` when the update-label checkbox is
on (the editor redraws the state label after a form change).

The form is referenced in `states-generator.ts` for fullName
derivation and in various exports, so it's meaningful state.

Prompts:
- *"Change Altaria's form to Empire."*
- *"Make state 3 a Theocracy."*
- *"Turn Free Cities into a Republic."*

### Success criteria

1. `set_state_form({state: 1, formName: "Empire"})` sets
   `pack.states[1].formName = "Empire"` and
   `pack.states[1].form = "Monarchy"` (the derived category).
2. `set_state_form({state: "altaria", formName: "theocracy"})`
   resolves state by name and formName case-insensitively; canonical
   casing is written (`"Theocracy"` / `"Theocracy"` category).
3. Rejects unknown form names with a structured error + the
   `supported` list (all canonical formNames).
4. Rejects state 0 (Neutrals).
5. Rejects unknown state refs.
6. Runtime throws → structured error.
7. Invalid ref types rejected.
8. Response reports
   `{i, name, previousForm, previousFormName, form, formName}`.

## Scope

In-scope:
- `set_state_form` tool with `StateFormRuntime` seam.
- Pure `resolveFormName(name)` helper returning
  `{formName, category} | null`.
- Registry + README + tests.

Out-of-scope:
- Changing fullName (the editor doesn't auto-regenerate; the AI can
  use `rename_state` for that).
- Adding custom forms (the UI has an "add custom form" button, but
  that extends the dropdown, not the data model).

## Design

New file: `src/ai/tools/set-state-form.ts`.

```ts
export const FORM_CATEGORIES = ["Monarchy","Republic","Union","Theocracy","Anarchy"] as const;
export interface CanonicalForm {
  formName: string;
  category: (typeof FORM_CATEGORIES)[number];
}
export interface StateFormRef {
  i: number;
  name: string;
  previousForm: string | null;
  previousFormName: string | null;
}
export interface StateFormRuntime {
  find(ref: number | string): StateFormRef | null;
  apply(i: number, form: CanonicalForm): void;
}
```

`resolveFormName(s)`:
- Trim + lowercase.
- Look up in a static map built from the five optgroups in
  `src/index.html:4506-4582`.
- Returns `{formName: canonicalCasing, category} | null`.

Default runtime:
- `find(ref)`: `findEntityByRef(pack.states, ref)` → returns
  `{i, name, previousForm, previousFormName}`.
- `apply(i, {formName, category})`:
  - Writes `s.formName = formName`, `s.form = category`.
  - Calls `window.drawStateLabels([i])` if available (matching the
    editor's "update label" default).

Executor:
1. Validate state ref (integer > 0 or non-empty string).
2. Validate `formName` is a non-empty string.
3. Resolve via `resolveFormName`; unknown → error + `supported` list.
4. `runtime.find(ref)`; null → error; state 0 → error.
5. `runtime.apply(i, resolved)`; catch throws.
6. Return okResult.

## Files

Create: `plan_25.md`, `tasks_25.md`,
`src/ai/tools/set-state-form.ts`,
`src/ai/tools/set-state-form.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing plan

Unit (`set-state-form.test.ts`):

1. `{state: 1, formName: "Empire"}` → `apply(1, {formName: "Empire",
   category: "Monarchy"})`.
2. Case-insensitive formName (`"empire"`, `"EMPIRE"`, `"  Kingdom  "`).
3. `{state: "altaria", formName: "Theocracy"}` → state lookup by
   name works.
4. Unknown form → error includes `supported` list with a sample of
   canonical formNames.
5. Reject state 0.
6. Reject unknown state ref.
7. Invalid state/formName types rejected.
8. Runtime throws → error.

Pure helper tests:

9. `resolveFormName("Kingdom")` → `{formName: "Kingdom", category:
   "Monarchy"}`.
10. `resolveFormName("REPUBLIC")` → `{formName: "Republic", category:
    "Republic"}`.
11. `resolveFormName("Theocracy")` → Theocracy/Theocracy.
12. `resolveFormName("United Kingdom")` → Union category.
13. `resolveFormName("foobar")` → null.
14. `resolveFormName("")` / `resolveFormName(null)` → null.

## Plan ↔ tasks ↔ tests verification

Each success criterion has a matching test. Alias map is self-documenting.

Lint / test / build gates in tasks_25.md.
