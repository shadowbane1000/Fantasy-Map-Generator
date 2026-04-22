# Tasks 74 — set_religion_type AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-religion-type.ts`:
  - Imports: `createAliasResolver`, `errorResult`,
    `findEntityByRef`, `getPackCollection`, `okResult`,
    `parseEntityRef`, type `RawReligion`.
  - `RELIGION_TYPES = ["Folk","Organized","Cult","Heresy"] as const`.
  - `resolveReligionType = createAliasResolver(RELIGION_TYPES)`.
  - Types:
    - `ReligionTypeRef { i, name, previousType }`.
    - `ReligionTypeRuntime { find, apply }`.
  - `defaultReligionTypeRuntime`:
    - `find`: findEntityByRef on getPackCollection.
    - `apply(i, type)`: lookup; throw if missing/removed; write
      `religion.type`.
  - Tool schema: `religion` (int|string required), `type` (string
    required).
  - Execute: parseEntityRef(religion); resolve type; find → 404;
    reject id 0; try apply; respond.

## Task 2 — Register

- [ ] Import + barrel re-export + register.

## Task 3 — Tests

- [ ] `src/ai/tools/set-religion-type.test.ts`:
  - Runtime-injected: by id, by name, canonicalize lowercase,
    reject unknown type, invalid refs, reject religion 0,
    surface failures.
  - Default-runtime integration: stub pack.religions; apply →
    data updated; reject removed.

## Task 4 — README

- [ ] Row near `set_religion_color`:
  ```
  | `set_religion_type`     | Change a religion's type (Folk / Organized / Cult / Heresy — same enum as the Religions Editor dropdown). Writes `religion.type`. Matches by id (>0) or case-insensitive name; the "No religion" placeholder (0) is rejected. | "Turn the Old Faith into a Cult", "Promote the Brightpath to an Organized religion" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-religion-type` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_religion_type tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Religions Editor type dropdown.
- Plan writes the same `religion.type` the UI writes.
- "No religion" (id 0) rejected.

## Verification that tests prove the use case

- Injected-runtime tests cover validation + dispatch.
- Integration test proves live mutation.
