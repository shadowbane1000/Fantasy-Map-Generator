# Plan 78 — set_culture_base AI tool

## Use case

The Cultures Editor has a name-base dropdown per culture
(`cultureChangeBase` at
`public/modules/dynamic/editors/cultures-editor.js:371`). It
writes `pack.cultures[i].base = numericIndex` — the index into
`window.nameBases` (language families like German, English,
French, etc.). The base drives which names the generator emits
for that culture's burgs / states / provinces.

The chat has `list_cultures` (reports `base: number | null`) +
rename / color / type / lock / expansionism for cultures — no
name-base knob.

## Scope

Add one tool: `set_culture_base(culture, base)`.

- `culture` required — id or case-insensitive name via
  `findEntityByRef`.
- `base` required — numeric index (non-negative integer) OR
  case-insensitive name of a `nameBases` entry ("German",
  "Norse", "Elven", etc.). Resolution rule:
  1. If number: must be integer ≥ 0; if out-of-range, reject.
  2. If string: find `nameBases` entry whose `name` matches
     case-insensitively; reject if unknown.
- Writes `culture.base = resolvedIndex`.
- Rejects culture 0 (Wildlands).

## Implementation

1. **New file `src/ai/tools/set-culture-base.ts`**:
   - Imports: `errorResult`, `findEntityByRef`, `getGlobal`,
     `getPackCollection`, `okResult`, `parseEntityRef`, type
     `RawCulture`.
   - `NameBase { name: string }` — minimal shape.
   - `resolveNameBase(value, nameBases)`:
     - null if nameBases missing.
     - numeric: validate integer in [0, nameBases.length); null
       otherwise.
     - string: trim + lowercase; scan; return matching index.
   - `CultureBaseRef { i, name, previousBase, previousBaseName }`.
   - `CultureBaseRuntime { find, apply }`.
   - `defaultCultureBaseRuntime.find(ref)`: findEntityByRef →
     ref; look up nameBases[ref.base] for previousBaseName.
   - `defaultCultureBaseRuntime.apply(i, base)`: lookup,
     throw if missing/removed, write `culture.base = base`.
   - Tool schema: `culture` (int|string required), `base`
     (int|string required).
   - Execute: parseEntityRef(culture); resolve base via
     `nameBases` (from getGlobal); error if unknown; find → 404;
     reject id 0; try apply; respond.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-culture-base.test.ts`**:
   - Runtime-injected:
     - Sets by culture id + numeric base.
     - Sets by culture name + name base.
     - Rejects invalid culture refs.
     - Rejects invalid bases (negative, 1.5, out-of-range,
       unknown name).
     - Rejects culture 0 (Wildlands).
     - Surface runtime failures.
   - `resolveNameBase` unit tests.
   - Default-runtime integration:
     - Stub `globalThis.nameBases` + `globalThis.pack.cultures`.
     - Apply base by number → data updated.
     - Apply base by name → resolves correctly.

4. **README_AI.md** — row near `set_culture_type`.

## Verification

- `npm test -- --run src/ai/tools/set-culture-base` green.
- `npm test -- --run` — 952 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can set a culture's name-base by index or by language
  name ("Norse", "German").
- Wildlands (culture 0) protected.
- Out-of-range indices + unknown names produce clear errors.
