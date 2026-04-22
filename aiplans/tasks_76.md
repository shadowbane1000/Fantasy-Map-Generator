# Tasks 76 — set_religion_deity AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-religion-deity.ts`:
  - Imports: `errorResult`, `findEntityByRef`,
    `getPackCollection`, `okResult`, `parseEntityRef`, type
    `RawReligion`.
  - `ReligionDeityRef { i, name, previousDeity }`.
  - `ReligionDeityRuntime { find, apply }`.
  - `defaultReligionDeityRuntime.find`: findEntityByRef → shape
    with `previousDeity: religion.deity ?? null` (keep null when
    absent; `deity` may be null per the existing `RawReligion`
    type).
  - `defaultReligionDeityRuntime.apply(i, deity)`: lookup; throw
    if missing/removed; write `religion.deity = deity`.
  - Tool schema: `religion` (int|string required), `deity`
    (string required).
  - Execute: parseEntityRef; validate `deity` is a string; allow
    empty `""`; reject whitespace-only; trim non-empty when
    storing; find → 404; reject id 0; try apply; respond.

## Task 2 — Register

- [ ] Import + barrel re-export + register.

## Task 3 — Tests

- [ ] `src/ai/tools/set-religion-deity.test.ts`:
  - Runtime-injected:
    - Set by id.
    - Set by case-insensitive name.
    - Trim non-empty deity.
    - Allow `""` (clear).
    - Reject whitespace-only deity.
    - Reject non-string deity.
    - Reject invalid religion refs.
    - Reject religion 0.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub pack; apply deity → data updated.
    - apply "" → cleared.
    - Apply on removed religion → error.

## Task 4 — README

- [ ] Row near `set_religion_form`:
  ```
  | `set_religion_deity`    | Name or clear a religion's supreme deity (free-form text — same as the Religions Editor deity input). `""` clears; whitespace-only is rejected. Matches by id (>0) or case-insensitive name; "No religion" (0) rejected. | "Name the Old Faith's deity Azoth the Flame-Bearer", "Clear the deity on the Brightpath" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-religion-deity` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_religion_deity tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Religions Editor deity input.
- Plan writes `religion.deity` identically.
- Empty string clears (matching how the UI's input can hold "").

## Verification that tests prove the use case

- Injected-runtime tests cover validation + dispatch.
- Integration test proves the live mutation.
- Whitespace-only rejection keeps the value meaningful.
