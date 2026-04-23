# Plan 129 — set_religion_culture AI tool

## Use case

Change a religion's associated/origin culture. This is
the `culture` field on `pack.religions[i]` — it anchors
the religion to a parent culture (used by `Religions`
helpers such as `Religions.getDeityName(cultureId)`).

The Religions Editor (`public/modules/dynamic/editors/
religions-editor.js`) does NOT expose a per-row culture
selector — the culture field is read-only in the table
and is used to derive the deity name when the user clicks
"regenerate deity" (line 386: `const cultureId =
pack.religions[religionId].culture`). There is still
value in exposing this as a data-layer mutation so the
AI can link a religion to a different parent culture
(e.g. when a religion is re-assigned to a new people).

Existing AI tools touch nearby fields:
- `set_religion_color` — `religion.color`
- `set_religion_type` — `religion.type`
- `set_religion_form` — `religion.form`
- `set_religion_deity` — `religion.deity`
- `set_religion_expansion` — `religion.expansion`

`religion.culture` is the last remaining trivially-
settable religion field.

## Scope

Add one tool: `set_religion_culture(religion, culture)`.

- `religion` — religion id (>0) or case-insensitive name.
  Required. Rejects id 0 ("No religion" placeholder),
  removed religions.
- `culture` — culture id (>= 0, 0 = Wildlands allowed,
  matching `set_state_culture`) or case-insensitive name.
  Required. Rejects removed cultures.
- Mutates `pack.religions[i].culture = cultureId`.
- `origins` is NOT touched — in this data model,
  `religion.origins` is a list of parent religions
  (line 509 in the editor filters it by religion ids),
  not cultures. Out of scope.
- No visual redraw: the Religions Editor doesn't re-
  render anything when `culture` changes (no layer uses
  it directly). Wrapped apply in try/catch for safety
  per task prompt but there's nothing to call.
- Returns `{ ok, i, previousCulture, culture }` where
  previousCulture / culture are `{ id, name }`.

## Delete approach

N/A — pure field mutation.

## Implementation

1. **New file `src/ai/tools/set-religion-culture.ts`**:
   - Imports: errorResult, findEntityByRef,
     getPackCollection, okResult, parseEntityRef, type
     RawCulture, type RawReligion from `./_shared`;
     Tool + ToolResult from `./index`.
   - Local helper `findCultureByRef` (copy of the one in
     `set-state-culture.ts`) — supports id 0 for
     Wildlands.
   - `ReligionCultureRef { i, name, previousCultureId,
     previousCultureName }`.
   - `CultureTarget { i, name }`.
   - `ReligionCultureRuntime { findReligion, findCulture,
     apply }`.
   - `defaultReligionCultureRuntime`:
     - `findReligion` — `findEntityByRef(religions, ref)`
       → null or the ref.
     - `findCulture` — `findCultureByRef(cultures, ref)`
       → `{ i, name }`.
     - `apply(religionId, cultureId)` — re-read pack,
       assert both exist + not removed, write
       `religion.culture = cultureId`.
   - `createSetReligionCultureTool(runtime?)`,
     `setReligionCultureTool`.
   - Schema: `religion` (int | string, required),
     `culture` (int | string, required).
   - Validation:
     - `parseEntityRef(input.religion, "religion")`.
     - `culture` — accept int >= 0 or non-empty string
       (matches `set_state_culture` guard).
     - `religion.i <= 0` → reject (No religion).
     - Unknown religion / culture → error.
   - Return `{ ok, i, name, previousCulture: { id, name },
     culture: { id, name } }`.

2. **Register** in `src/ai/index.ts`:
   - Import alongside other religion set-tools.
   - Barrel re-export `createSetReligionCultureTool`,
     `setReligionCultureTool`.
   - `registry.register(setReligionCultureTool)` next to
     the other religion set-tools.

3. **Tests** `src/ai/tools/set-religion-culture.test.ts`:
   - Unit (stubbed runtime):
     - sets by ids
     - sets by case-insensitive names
     - allows Wildlands (culture 0)
     - rejects religion 0 (No religion placeholder)
     - rejects invalid religion / culture refs
     - errors on unknown religion / culture
     - surfaces runtime failures (apply throws)
   - `defaultReligionCultureRuntime (integration)` with
     `(globalThis as unknown as { pack?: unknown }).pack`
     double-cast per tsc-strict rule:
     - sets `religion.culture` in the live pack
     - allows Wildlands (culture 0)
     - refuses a removed culture
     - refuses a removed religion

4. **README_AI.md** — row after `set_religion_form` (line
   108) covering: `religion.culture` field, id / name
   lookup, Wildlands allowed, "No religion" rejected.

## Verification

- Baseline lint: 7 warnings / 1 info / 0 errors.
- Baseline tests: 1586 passing across 140 files.
- `npm test` green after changes (1586 + ~10 new).
- `npm run lint` still 7 / 1 / 0.
- `npm run build` succeeds (catches tsc errors lint
  misses).

## Success criteria

- Tool callable, wired, documented.
- Uses shared helpers (parseEntityRef, findEntityByRef)
  exactly like `set-state-culture.ts`.
- Rejects religion 0, unknown refs, removed religions /
  cultures.
- Return payload surfaces previous culture so the LLM
  can confirm the change.
