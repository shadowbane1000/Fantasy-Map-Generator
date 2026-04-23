# Plan 119 — regenerate_province_name AI tool

## Use case

The Provinces Editor's province-name dialog has two
regenerate-name buttons
(`public/modules/ui/provinces-editor.js:546-557`):

- Culture: `Names.getState(Names.getCultureShort(
  cells.culture[province.center]),
  cells.culture[province.center])`.
- Random: `Names.getState(Names.getBase(rand),
  undefined, rand)`.

UI buffers short in the dialog; Apply writes province.name
and recomputes fullName.

Parallels `regenerate_burg_name` and
`regenerate_state_name`. This is the provinces version.

## Scope

Add one tool: `regenerate_province_name(province, mode?)`.

- `province` — id (> 0) or case-insensitive name /
  fullName.
- `mode` — `"culture"` (default) or `"random"`.
- Culture of the province = `pack.cells.culture[
  province.center]`.
- Writes:
  - `province.name = newShort`.
  - `province.fullName = newShort + " " + formName`
    (matching the UI's getFullName: "The {form}" if
    short is empty, otherwise "{short} {form}" or
    just {short} if form is empty).
- Best-effort: update `#provinceLabel{i}` SVG text.
- Non-idempotent.

## Implementation

1. **New file `src/ai/tools/regenerate-province-name.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getPack, okResult, parseEntityRef, type RawProvince
     from `./_shared`.
   - `PROVINCE_NAME_MODES = ["culture","random"] as const`.
   - `resolveProvinceNameMode`.
   - `RegenerateProvinceNameRef { i, name, fullName,
      center, formName }`.
   - `RegenerateProvinceNameRuntime { find, generate,
      apply }`.
   - `defaultRegenerateProvinceNameRuntime`:
     - find: findEntityByRef on provinces.
     - generate(mode, center):
       - Get culture from pack.cells.culture[center]
         (throw if missing).
       - mode=culture: Names.getState(Names.getCultureShort
         (culture), culture).
       - mode=random: Names.getState(Names.getBase(rand),
         undefined, rand).
     - apply(i, name, fullName):
       - province.name = name.
       - province.fullName = fullName.
       - Best-effort `#provinceLabel{i}` text update.
   - Schema: `province` (int|string required), `mode`
     (string enum optional).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-province-name.test.ts`:
   - `resolveProvinceNameMode`.
   - Unit (stubbed):
     - default mode = culture
     - explicit random
     - rejects unknown mode
     - rejects invalid refs
     - rejects unknown province
     - surfaces generator errors
     - fullName composition (3 cases: both, no short, no
       form)
   - Integration:
     - stubs pack.cells.culture, pack.provinces, Names,
       nameBases, document.
     - culture mode: Names calls match.
     - random mode: Names calls match.
     - apply writes name + fullName + SVG.

4. **README_AI.md** — row near `regenerate_state_name`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-province-name`
  green.
- `npm test -- --run` — 1457 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Two modes (culture / random) — same as UI.
- Writes name + fullName with the UI's composition
  rule.
- Updates SVG label.
