# Plan 75 — set_religion_form AI tool

## Use case

The Religions Editor (`religionChangeForm` at
`public/modules/dynamic/editors/religions-editor.js:372`) has a
free-form text input for each religion's `form` — a narrative
descriptor like "Druidism", "Shamanism", "Church of Light",
"Heterodoxy". The generator emits it for each type (Folk,
Organized, Cult, Heresy) but users retype it freely.

The chat has `rename_religion` / `set_religion_color` /
`set_religion_type` (plan 74) but no way to set the form. This
is a natural lore knob — "make the Old Faith an Animist
tradition", "rename the Brightpath's form to 'Orthodoxy'".

## Scope

Add one tool: `set_religion_form(religion, form)`.

- `religion` required — id or case-insensitive current name via
  `findEntityByRef`.
- `form` required non-empty string. Free-form (no enum).
- Writes `religion.form = form`.
- Rejects religion 0 ("No religion" placeholder).

## Implementation

1. **New file `src/ai/tools/set-religion-form.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getPackCollection`, `okResult`, `parseEntityRef`, type
     `RawReligion`.
   - `ReligionFormRef { i, name, previousForm }`.
   - `ReligionFormRuntime { find, apply }`.
   - `defaultReligionFormRuntime.find`: findEntityByRef → ref
     with `previousForm: religion.form ?? null`.
   - `defaultReligionFormRuntime.apply(i, form)`: lookup, throw
     if missing/removed, write `religion.form = form`.
   - Tool schema: `religion` (int|string required), `form`
     (string required non-empty).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-religion-form.test.ts`**:
   - Runtime-injected: set by id, by name, trim whitespace,
     reject invalid refs, reject invalid form (non-string, empty,
     whitespace), reject religion 0, surface failures.
   - Default-runtime integration: stub pack; apply form → data
     updated; reject removed religion.

4. **README_AI.md** — row near `set_religion_type`.

## Verification

- `npm test -- --run src/ai/tools/set-religion-form` green.
- `npm test -- --run` — 919 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can set a religion's form freely.
- "No religion" (id 0) protected.
