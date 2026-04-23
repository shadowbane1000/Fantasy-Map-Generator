# Tasks 129 — set_religion_culture AI tool

- [ ] Create `src/ai/tools/set-religion-culture.ts`:
  - Imports:
    - `./_shared`: errorResult, findEntityByRef,
      getPackCollection, okResult, parseEntityRef, type
      RawCulture, type RawReligion.
    - `./index`: type Tool, type ToolResult.
  - Local helper `findCultureByRef(cultures, ref)` that
    allows id 0 = Wildlands (mirrors the helper already
    used in `set-state-culture.ts`).
  - Exports:
    - `ReligionCultureRef { i, name, previousCultureId,
      previousCultureName }`.
    - `CultureTarget { i, name }`.
    - `ReligionCultureRuntime { findReligion, findCulture,
      apply }`.
    - `defaultReligionCultureRuntime`:
      - `findReligion(ref)`:
        - `findEntityByRef<RawReligion>("religions", ref)`.
        - Null → null; else
          `{ i, name: r.name ?? "",
            previousCultureId: r.culture ?? 0,
            previousCultureName:
              cultures?.[r.culture ?? 0]?.name ?? null }`.
      - `findCulture(ref)`:
        - `findCultureByRef(cultures, ref)` → null or
          `{ i, name: c.name ?? "" }`.
      - `apply(religionId, cultureId)`:
        - Re-read religions / cultures from pack.
        - Throw if religion missing / removed.
        - Throw if culture missing / removed.
        - `religion.culture = cultureId`.
    - `createSetReligionCultureTool(runtime?)`,
      `setReligionCultureTool`.
  - Tool name: `set_religion_culture`.
  - Description: references the religion.culture field,
    notes it anchors the religion to a parent culture
    (used by deity regeneration), matches by id (>0) or
    case-insensitive name, Wildlands (culture 0) is
    allowed, "No religion" (religion 0) rejected, no
    visual redraw needed.
  - Schema: `religion` (int | string, required),
    `culture` (int | string, required).
  - Validation:
    - `parseEntityRef(input.religion, "religion")`.
    - Culture ref: int >= 0 OR non-empty trimmed string.
    - `religion.i <= 0` → error "Cannot set culture on
      religion 0 (the 'No religion' placeholder).".
    - Unknown religion / culture → "No religion/culture
      found matching ...".
  - Return payload: `{ ok: true, i, name,
    previousCulture: { id, name }, culture: { id, name } }`.

- [ ] Register in `src/ai/index.ts`:
  - Import `setReligionCultureTool` alphabetically with
    other religion set-tools (after `setReligionColorTool`
    or wherever it fits).
  - Barrel re-export `createSetReligionCultureTool`,
    `setReligionCultureTool`.
  - `registry.register(setReligionCultureTool)` inside
    `buildDefaultRegistry` near the other religion tools.

- [ ] Write `src/ai/tools/set-religion-culture.test.ts`:
  - Unit (stubbed runtime) — mirror
    `set-state-culture.test.ts`:
    - sets by ids
    - sets by case-insensitive names
    - allows Wildlands (culture 0)
    - rejects religion 0 via valid-ref guard
    - rejects invalid refs (null, undefined, -1, 1.5, "")
    - errors on unknown religion / culture
    - surfaces runtime failures
  - `defaultReligionCultureRuntime (integration)` block:
    - `beforeEach`: `(globalThis as unknown as { pack?:
      unknown }).pack = { religions: [...], cultures:
      [...] }`. **DOUBLE-CAST per tsc-strict rule.**
    - Religions: `{ i:0, name:"No religion", removed:
      true }`, `{ i:1, name:"Old Faith", culture: 0 }`,
      `{ i:2, name:"Brightpath", culture: 1 }`.
    - Cultures: `{ i:0, name:"Wildlands" }`,
      `{ i:1, name:"Highlanders" }`,
      `{ i:2, name:"Coastalfolk" }`.
    - Tests:
      - sets religion.culture in the live pack
      - allows Wildlands (culture 0)
      - refuses a removed culture
      - refuses a removed religion
    - `afterEach` restores original pack.

- [ ] Update `README_AI.md` — row after
  `set_religion_form` (line 108). Include delegation to
  `religion.culture`, id/name semantics, Wildlands
  allowed, No religion rejected.

- [ ] `npm run lint` — still 7 warnings / 1 info /
  0 errors.

- [ ] `npm test` — passes (1586 → ~1597).

- [ ] `npm run build` — succeeds.

- [ ] Commit with `feat(ai): add set_religion_culture
  tool` and a 1-2 line body.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime (`findReligion`, `findCulture`, `apply`) maps
  cleanly to the mutation and matches
  `set-state-culture.ts`.
- Description + README describe religion.culture's role
  (deity generation, parent-culture anchor).

## Verification: plan → use case

- `religion.culture` is the data field that tracks the
  religion's parent culture — used by
  `Religions.getDeityName(cultureId)` and read from
  `pack.religions[id].culture` in the editor (line 386).
- Editor has no direct culture selector, so no redraw is
  required.
- `origins` is a religion-graph field (parent religions),
  not cultures — correctly left untouched.

## Verification: tests → regressions

- If the tool skipped the religion-0 guard, the "rejects
  religion 0" test fails.
- If the tool skipped the culture-0 allowance, the
  Wildlands test fails.
- If the tool forgot the removed-culture check, the
  "refuses a removed culture" integration test fails.
- If the tool forgot the removed-religion check, the
  "refuses a removed religion" integration test fails.
- Invalid refs are caught by parseEntityRef / guard unit
  tests.
