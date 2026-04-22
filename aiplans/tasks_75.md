# Tasks 75 — set_religion_form AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-religion-form.ts`:
  - Imports: `errorResult`, `findEntityByRef`,
    `getPackCollection`, `okResult`, `parseEntityRef`, type
    `RawReligion`.
  - `ReligionFormRef { i, name, previousForm }`.
  - `ReligionFormRuntime { find, apply }`.
  - `defaultReligionFormRuntime.find`: findEntityByRef → shape.
  - `defaultReligionFormRuntime.apply`: lookup pack.religions[i];
    throw if missing/removed; write `religion.form = form`.
  - Tool schema: `religion` (int|string required), `form` (string
    required non-empty).
  - Execute: parseEntityRef(religion); validate form trimmed;
    find → 404; reject id 0; try apply; respond with
    previousForm/form.

## Task 2 — Register

- [ ] Import + barrel re-export + register.

## Task 3 — Tests

- [ ] `src/ai/tools/set-religion-form.test.ts`:
  - Runtime-injected: set by id, by name, trim, reject invalid
    refs, reject invalid form (null, "", "   ", 42), reject
    religion 0, surface failures.
  - Default-runtime integration: stub pack; apply → data updated;
    reject removed.

## Task 4 — README

- [ ] Row near `set_religion_type`:
  ```
  | `set_religion_form`     | Set a religion's form — the free-form narrative descriptor from the Religions Editor (e.g. Druidism, Shamanism, Church of Light, Heterodoxy). Writes `religion.form`. Matches by id (>0) or case-insensitive name; "No religion" (0) rejected. | "Make the Old Faith Animist", "Set the Brightpath form to 'Orthodoxy'" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-religion-form` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_religion_form tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Religions Editor form input.
- Plan writes `religion.form` identically to the editor's
  `religionChangeForm` handler. No side-effects (form is a
  narrative field, not used in generation).

## Verification that tests prove the use case

- Runtime-injected tests cover validation + dispatch.
- Integration test proves live mutation + removed-religion
  rejection.
