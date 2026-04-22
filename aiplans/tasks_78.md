# Tasks 78 — set_culture_base AI tool

## Task 1 — resolveNameBase helper

- [ ] In `src/ai/tools/set-culture-base.ts`, export
  `resolveNameBase(value, nameBases): number | null`:
  - null if `nameBases` not an array.
  - number value: integer ≥ 0 && < nameBases.length → value; else null.
  - string value: trim + lowercase; scan; return index where
    `(nameBases[k]?.name ?? "").toLowerCase() === needle`.
  - Return null for any other input.

## Task 2 — Implement the tool

- [ ] Types:
  - `NameBase { name: string }`.
  - `CultureBaseRef { i, name, previousBase, previousBaseName }`.
  - `CultureBaseRuntime { find, apply, getNameBases }`.
- [ ] `defaultCultureBaseRuntime`:
  - `getNameBases`: `getGlobal<NameBase[]>("nameBases")`.
  - `find(ref)`: findEntityByRef on pack.cultures → shape with
    `previousBase: culture.base ?? null`, `previousBaseName:
    nameBases[previousBase]?.name ?? null`.
  - `apply(i, base)`: lookup; throw missing/removed; write
    `culture.base = base`.
- [ ] Tool schema: `culture` (int|string required), `base`
  (int|string required).
- [ ] Execute:
  - parseEntityRef(culture).
  - nameBases via runtime.getNameBases(); error if missing.
  - resolveNameBase(input.base, nameBases); error if null.
  - find → 404.
  - Reject culture.i ≤ 0.
  - try apply.
  - Return `{ i, name, previousBase, previousBaseName, base,
    baseName }`.

## Task 3 — Register

- [ ] Import + barrel re-export + register after
  `setCultureTypeTool`.

## Task 4 — Tests

- [ ] `src/ai/tools/set-culture-base.test.ts`:
  - `resolveNameBase`:
    - null nameBases.
    - Numeric valid / out-of-range / negative / non-integer.
    - String case-insensitive match.
    - Unknown name.
    - Invalid type.
  - Runtime-injected tool:
    - Set by culture id + numeric base.
    - Set by culture name + name base.
    - Reject invalid culture refs.
    - Reject invalid base (number out-of-range, unknown name,
      non-string/number).
    - Reject culture 0.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.nameBases` = `[{name:"German"},{name:"Norse"}]`.
    - Stub `globalThis.pack.cultures` with 3 cultures.
    - Apply base 1 → `culture.base = 1`.
    - Apply "norse" → same.
    - Refuse on removed culture.

## Task 5 — README

- [ ] Row near `set_culture_type`:
  ```
  | `set_culture_base`      | Set a culture's name-base (language family — same as the Cultures Editor name-base dropdown). `base` accepts a numeric index into `window.nameBases` or a case-insensitive base name ("German", "Norse", "Elven", …). Writes `culture.base`. Matches culture by id (>0) or name; Wildlands (0) rejected. | "Make the Highlanders use Norse names", "Set culture 3's base to 2" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-culture-base` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add set_culture_base tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (resolver + tool) → Tasks 1, 2.
- Plan step 2 (register) → Task 3.
- Plan step 3 (tests) → Task 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Cultures Editor name-base dropdown, UI-only.
- Plan writes the same `culture.base` numeric index the UI
  writes. Acceptance of both numeric and name forms lets
  natural prose prompts work ("make culture 3 Norse").

## Verification that tests prove the use case

- Resolver tests cover every validation branch for base input.
- Integration test proves live mutation + name-to-index lookup.
- Wildlands (culture 0) rejection keeps the tool well-behaved.
