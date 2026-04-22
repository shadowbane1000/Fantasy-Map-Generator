# Plan 46 — rename_river AI tool

## Use case

The Rivers Editor (`public/modules/ui/rivers-editor.js:197`) lets a user
rename any river — change name text, write `river.name`. It also
exposes "generate from culture" and "random" buttons, but the
fundamental user verb is "rename this river to X" (e.g. after picking
one out on the map and deciding it should be called "the Ashwater").

The chat has `list_rivers` (readable catalog) but no way to rename.
Every other rename-able top-level entity already has a tool (states,
burgs, cultures, religions, provinces, zones, markers) — rivers are
the last gap.

## Scope

Add one tool: `rename_river(river, name)`. Writes `river.name`. Like
rivers / zones (and unlike states / burgs / cultures / provinces),
rivers live in an array where `river.i` does NOT correspond to the
array index — the UI uses `.find(r => r.i === id)`. So we cannot use
the shared `findEntityByRef`; we need a ref-by-i helper. Mirror the
`findZoneByRef` pattern.

No redraw needed (names don't appear on the map directly until the
next label re-render / overview refresh; the UI also does no redraw
here — `changeName` just writes the field).

## Implementation

1. **New file `src/ai/tools/rename-river.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     `RawRiver` from `_shared`.
   - Export `findRiverByRef(rivers, ref): RawRiver | null` — same
     shape as `findZoneByRef`, skips `.removed`, matches by numeric
     `i` or case-insensitive name.
   - `RiverRenameRef { i, name }`.
   - `RiverRenameRuntime { find(ref), rename(i, name) }`.
   - `defaultRiverRenameRuntime`:
     - `find` → `findRiverByRef(getPack()?.rivers, ref)` →
       `{ i, name: river.name ?? "" }`.
     - `rename(i, name)` → find by i again, throw if missing or
       removed, write `river.name = name`.
   - Tool schema: `river` (int|string, required), `name` (string,
     required, non-empty).

2. **Register** in `src/ai/index.ts` — import, barrel export, register
   after `renameZoneTool`.

3. **Tests `src/ai/tools/rename-river.test.ts`** (runtime-injected):
   - Rename by numeric id.
   - Rename by case-insensitive name.
   - Trim surrounding whitespace.
   - Reject unknown river ref.
   - Reject invalid `river` (null, 0, -1, 1.5, "").
   - Reject invalid `name` (non-string, empty, whitespace).
   - Rename to same name still calls runtime.rename.
   - Surface runtime failures.

4. **Pack-logic tests for `findRiverByRef`**:
   - Returns null when rivers array is missing.
   - Matches by numeric i even with non-contiguous ids.
   - Skips `removed` rivers (does not resolve to them).
   - Case-insensitive name match; trims whitespace.
   - Returns null for unknown name/id.

5. **Default-runtime integration test**:
   - Stub `globalThis.pack.rivers` with non-contiguous ids.
   - Call `renameRiverTool.execute({ river: 5, name: "Ashwater" })`.
   - Assert the matched entry's `.name` updated.
   - Assert a `removed` river with the same id is not touched.

6. **README_AI.md** — new row in the tool table under `list_rivers`
   (keeping related tools together) with an example prompt.

## Verification

- `npm test -- --run src/ai/tools/rename-river` green.
- `npm test -- --run` full suite green (559 before).
- `npm run lint` — 7 / 1 baseline intact.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "rename the longest river to Ashwater" and the write
  lands on `pack.rivers[k].name` for the right entry — persisted in
  saves, displayed in the next Rivers Overview render, usable by
  any downstream label pass.
- Non-contiguous river ids handled correctly via the new
  `findRiverByRef` helper, which future river tools (set_river_type,
  set_river_discharge, etc.) can reuse.
