# Plan 47 — set_river_type AI tool

## Use case

The Rivers Editor (`public/modules/ui/rivers-editor.js:201 changeType`)
exposes a free-form type input next to the name field. The tooltip
reads "e.g. fork, creek, river, brook, stream" but the field accepts
any string. The generator produces one of River / Creek / Brook /
Stream / Fork / Branch (from `river-generator.ts:37 riverTypes`), but
the user is free to reclassify a river to anything (e.g. "Ditch",
"Canal", "Ravine") to suit their narrative.

The chat already has `list_rivers` (reports type) and `rename_river`
(name). Retyping is the other per-river scalar the user can set from
the UI and is the obvious next river tool.

## Scope

Add one tool: `set_river_type(river, type)`. Free-form `type` string
(non-empty); no enum validation — matches the UI's text input. Reuses
`findRiverByRef` for id/name resolution and `.removed` skip.

## Implementation

1. **New file `src/ai/tools/set-river-type.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     `RawRiver` from `_shared`; `findRiverByRef` from `./rename-river`.
   - `RiverTypeRef { i, name, previousType }`.
   - `RiverTypeRuntime { find(ref), apply(i, type) }`.
   - `defaultRiverTypeRuntime`:
     - `find`: reuse `findRiverByRef(getPack()?.rivers, ref)`.
     - `apply(i, type)`: find by i; throw if null; write
       `river.type = type`.
   - Tool schema: `river` (int|string, required), `type` (string,
     required, non-empty). Description lists the common generator
     outputs (River, Creek, Brook, Stream, Fork, Branch) as hints
     while noting any string is allowed.

2. **Register** in `src/ai/index.ts`: import, barrel export,
   `registry.register(setRiverTypeTool)` next to other set-* river/zone
   tools (placed alphabetically/after setReligionColorTool area is
   fine).

3. **Tests `src/ai/tools/set-river-type.test.ts`** (runtime-injected):
   - Sets type by numeric id — apply called with `(i, "Fork")`.
   - Sets type by case-insensitive name.
   - Trim surrounding whitespace on `type`.
   - Reject unknown river ref.
   - Reject invalid `river` (null, 0, -1, 1.5, "").
   - Reject invalid `type` (non-string, empty, whitespace).
   - Allow common non-standard types ("Ravine", "Ditch") since the
     field is free-form.
   - Surface runtime failures.

4. **Default-runtime integration test**:
   - Stub `globalThis.pack.rivers` with non-contiguous ids (including
     a removed one).
   - Call tool → the matching river's `.type` updates.
   - Removed river cannot be retyped.

5. **README_AI.md** — new row under `rename_river`.

## Verification

- `npm test -- --run src/ai/tools/set-river-type` green.
- `npm test -- --run` — full suite green (574 before).
- `npm run lint` — baseline 7 / 1 intact.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "reclassify river 12 as a Stream" / "make the smaller
  tributary a Brook" and the write lands on `pack.rivers[k].type`
  identically to a manual UI edit. Retyping a removed river is
  rejected. Free-form values are accepted.
