# Plan 124 — regenerate_all_province_names AI tool

## Use case

The Provinces Editor bulk-renames every active province at
once (the UI's "Regenerate names" path). The AI needs the
same bulk-rename power — a single tool call to reroll every
non-locked, non-removed province name without chaining
`regenerate_province_name` calls.

Parallels the just-merged `regenerate_all_state_names` and
`regenerate_all_burg_names` tools. Uses the same name
mechanics as the single-province tool
(`regenerate_province_name`):

- `mode=culture` (default): `Names.getState(Names.getCultureShort(cellCulture), cellCulture)`
- `mode=random`: `Names.getState(Names.getBase(base), undefined, base)` with a random name-base.
- Both write `province.name` AND `province.fullName`
  (recomposed via `composeProvinceFullName(short, formName)`
  matching the UI's `getFullName`).

## Scope

Add one tool: `regenerate_all_province_names(mode?)`.

- `mode` — optional string, case-insensitive, one of
  `"culture"` (default) or `"random"`.
- Skips province `i=0`, `province.removed`, and
  `province.lock`.
- For each remaining province:
  - Reads culture from `pack.cells.culture[center]`.
  - Generates a short name.
  - Composes `fullName` via the existing
    `composeProvinceFullName` helper
    (`"{short} {formName}"`, or `"The {formName}"` if short
    empty, or just `short` if formName empty).
  - Writes `province.name` + `province.fullName`.
  - Best-effort updates `#provinceLabel{i}` text content.
- Errors inside the loop are recorded in `skipped` with
  `reason`; the loop never throws out.
- Returns
  `{ok, mode, renamed:[{i,previousName,previousFullName,name,fullName}], skipped:[{i,name,reason}]}`.

## Implementation

1. **`src/ai/tools/regenerate-all-province-names.ts`** —
   runtime-seam pattern mirroring
   `regenerate-all-state-names.ts`:
   - `interface RegenerateAllProvinceNamesProvinceRef {
       i, name, fullName, center, formName, lock?, removed?
     }`
   - `interface RegenerateAllProvinceNamesRuntime {
       list(): RegenerateAllProvinceNamesProvinceRef[];
       generate(mode: ProvinceNameMode, center: number): string;
       compose(short: string, form: string): string;
       apply(i: number, name: string, fullName: string): void;
     }`
   - `defaultRegenerateAllProvinceNamesRuntime`:
     - `list` reads `pack.provinces`.
     - `generate` uses `Names.getState` with either
       `Names.getCultureShort(culture)` or
       `Names.getBase(rand)` depending on mode — pulls
       culture from `pack.cells.culture[center]`.
     - `compose` delegates to the exported
       `composeProvinceFullName`.
     - `apply` writes `name` + `fullName` to the province
       and, if `document` is defined, best-effort updates
       `#provinceLabel{i}` text content.
   - `createRegenerateAllProvinceNamesTool(runtime)`
     returns a `Tool` with name
     `regenerate_all_province_names`, schema accepting
     optional `mode`.
   - Re-uses `PROVINCE_NAME_MODES`, `ProvinceNameMode`,
     `resolveProvinceNameMode`, and
     `composeProvinceFullName` from
     `./regenerate-province-name`.

2. **Registration** in `src/ai/index.ts`:
   - Import `regenerateAllProvinceNamesTool`.
   - Re-export factory + tool.
   - `registry.register(regenerateAllProvinceNamesTool)`
     alongside the other bulk-regenerate tools.

3. **`README_AI.md`** — add a table row next to
   `regenerate_all_state_names` describing the tool,
   reusing the existing API-key-provisioning prose (the
   "Using the chat in the app" section already documents
   API key handling).

## Tests

`src/ai/tools/regenerate-all-province-names.test.ts` with:

Unit describe (stubbed runtime):
- default mode is culture, skips i=0, locked, removed.
- explicit random mode canonicalizes case (`"RANDOM"` →
  `"random"`).
- rejects unknown mode and never touches runtime.
- generator errors go to `skipped`; loop continues.
- empty generator output is skipped.
- apply errors go to `skipped`; loop continues.
- list-throws returns `errorResult`.
- composes fullName correctly (short + form, "The form"
  when short empty, just short when form empty).

`defaultRegenerateAllProvinceNamesRuntime` integration
describe (stubs `globalThis.pack`, `Names`, `nameBases`,
`document`):
- culture mode: renames only non-locked, non-removed
  (skips province 0); writes both `name` and `fullName`;
  updates DOM labels.
- random mode: calls `getBase` + `getState` with base
  index.
- errors when Names is missing — per-province generator
  errors go to `skipped`.
- errors when nameBases missing in random mode — per-
  province generator errors go to `skipped`.

## Verification

- `npm test -- --run` — baseline 1521; target 1521 +
  new tests.
- `npx biome check src/` — baseline 0 errors / 7
  warnings / 1 info; must match (errors must not
  increase; warnings must not increase — decreases OK).
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired into registry, exported in barrel.
- Bulk renames every active province; preserves locked,
  removed, and province 0.
- Writes both `province.name` and `province.fullName`;
  best-effort updates `#provinceLabel{i}` SVG per-province.
- Per-province errors never throw out of `execute`.
- Documented in README_AI.md.
