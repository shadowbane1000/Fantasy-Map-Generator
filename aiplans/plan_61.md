# Plan 61 — rename_biome AI tool

## Use case

The Biomes Editor's name input (`biomeChangeName` in
`public/modules/ui/biomes-editor.js:198`) writes
`biomesData.name[i] = newName`. Users rename biomes to suit
narrative (e.g. "Hot desert" → "Scorched Waste") or to add
custom biomes with meaningful names.

`list_biomes` (plan 60) reads biomes but can't edit them. Renaming
is the simplest write — same pattern as other rename_* tools.

## Scope

Add one tool: `rename_biome(biome, name)`.

- `biome` required — numeric id or case-insensitive current name.
- `name` required non-empty string.
- Skip (error) biomes marked `"removed"` (the editor's deletion
  sentinel — repurposing their slot would confuse the UI).
- Refuse to rename TO `"removed"` (dedicated to deletion).
- Writes `biomesData.name[i] = name`.

## Implementation

1. **New file `src/ai/tools/rename-biome.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult`; no pack-types
     needed (biomes live in `window.biomesData` directly).
   - `BiomeRenameRef { i, name }`.
   - `BiomeRenameRuntime { find(ref), rename(i, name) }`.
   - `findBiomeByRef(biomesData, ref)`:
     - null if biomesData or its `i`/`name` arrays missing.
     - Numeric ref: match `biomesData.i[k] === ref`; return
       `{ k, id, name }` where `k` is the array index (for use in
       subsequent writes).
     - String ref: trim+lowercase; iterate; match against
       `biomesData.name[k]` case-insensitively; skip when that
       slot is "removed".
   - `defaultBiomeRenameRuntime`:
     - `find(ref)`: uses `findBiomeByRef`.
     - `rename(i, name)`: finds by numeric id, throws if missing or
       slot is removed, writes `biomesData.name[k] = name`.
   - Tool schema: `biome` (int|string), `name` (string).
   - Execute: parseEntityRef-style validation for `biome` (accept
     integer >= 0 since marine is i=0 — not a placeholder); reject
     empty/whitespace name; reject rename-to "removed"; call
     runtime.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/rename-biome.test.ts`**:
   - Runtime-injected:
     - Rename by numeric id.
     - Rename by case-insensitive name.
     - Trim name before writing.
     - Refuse rename-to-"removed".
     - Reject unknown ref.
     - Reject invalid biome / name types.
     - Surface runtime failures.
   - `findBiomeByRef` unit tests:
     - null input → null.
     - Skip "removed" slots for name lookups.
     - Match by id even when the id is 0 (Marine is i=0).
   - Default-runtime integration:
     - Stub `globalThis.biomesData` with a small 3-biome data.
     - Rename biome 1 by id → biomesData.name[1] updated.
     - Rename biome "grassland" by name → correct slot updated.
     - Rename of removed biome → error, no mutation.

4. **README_AI.md** — row near `list_biomes`.

## Verification

- `npm test -- --run src/ai/tools/rename-biome` green.
- `npm test -- --run` — 753 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "rename Hot desert to Scorched Waste" and the
  Biomes Editor / anyone reading `biomesData.name` sees the change.
- "removed" sentinel is protected in both directions (can't read
  a removed biome by name; can't set name TO "removed").
- Works for any biome including the Marine / i=0 case.
