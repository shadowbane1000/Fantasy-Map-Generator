# Plan 290 — `rename_lake` AI tool

## Use case

Add a new AI chat tool **`rename_lake`** so the model can rename a lake
on the current map. Mirrors the `changeName` listener in
`public/modules/ui/lakes-editor.js` (`byId("lakeName").on("input",
changeName)`), which sets `getLake().name = this.value`. Lakes live
inside `pack.features` (no `pack.lakes` array) — they are entries with
`type === "lake"`. A lake feature has at least `i`, `name`, `group`,
`vertices`, `area`, `height`, plus the rest of the
`PackedGraphFeature` shape from `src/modules/features.ts`.

The tool only handles the explicit-name path (caller supplies the
exact new name). It does NOT regenerate from culture or random — those
are separate UI buttons (`generateNameCulture` /
`generateNameRandom`). No SVG redraw is triggered: the legacy
`changeName` does only the assignment, and lake names aren't drawn by
default — the rename takes effect on the next read of `pack.features`.

## Lint baseline (master @ 322b9ef → branch plan-290)

`npm run lint`:

- Found 7 warnings.
- Found 1 info.
- 0 errors.
- 680 files checked.

The new code must keep the count at the same numbers (no new warnings,
no new infos, no errors).

## Behavior

- Tool name: `rename_lake`.
- Inputs (object):
  - `id` (optional): integer — the lake's `feature.i`.
  - `name` (optional): string — the lake's current name (case-insensitive,
    exact match, trimmed).
  - `new_name` (required): string — the new name. Trimmed before
    writing; rejected if empty after trim. No length cap (the legacy
    `<input type="text">` has none).
  - At least one of `id` or `name` must be provided.
- Effect: locate the matching `pack.features` entry with
  `type === "lake"`. Set `feature.name = new_name.trim()`. No redraw.
- Success result (`okResult`):
  ```json
  { "ok": true, "id": <feature.i>, "old_name": <prior name>, "new_name": <trimmed new name> }
  ```
- Errors (`errorResult`, `isError: true`):
  - `pack` missing or `pack.features` not an array →
    `"pack.features is unavailable. Generate a map first."`
  - Neither `id` nor `name` provided →
    `"Provide either id or name to identify the lake."`
  - `id` provided but not a positive integer →
    `"id must be a positive integer."`
  - `name` provided but not a non-empty trimmed string →
    `"name must be a non-empty string."`
  - `new_name` missing/not string/empty after trim →
    `"new_name must be a non-empty string."`
  - Lake not found by id (no feature with that `i`, OR the feature is
    not type `"lake"`, OR is the index-0 placeholder) →
    `"No lake found with id <id>."`
  - Lake not found by name (no `type === "lake"` feature whose
    case-insensitive name matches) →
    `"No lake found with name <name>."`
  - Multiple lakes share the supplied name → ambiguity error with
    extra payload listing candidates:
    `errorResult("Multiple lakes match name <name>. Disambiguate by id.", { candidates: [{ id, name, group }, ...] })`
  - Both `id` and `name` provided but they refer to different lakes
    (the id's lake's name doesn't match the supplied name
    case-insensitively, OR the name lookup yielded a different id) →
    `"id and name refer to different lakes."`

## Files

- **New** `src/ai/tools/rename-lake.ts`
  - Exports:
    - `LakeRenameRef` interface — `{ i, name, group }`.
    - `LakeRenameRuntime` interface — `findById(id) | findByName(name) | rename(i, newName)`.
      - `findById(id)`: returns matching `LakeRenameRef` or `null`.
      - `findByName(name)`: returns `{ matches: LakeRenameRef[] }`.
        Caller decides ambiguity.
      - `rename(i, newName)`: throws if pack missing or feature gone;
        sets `feature.name = newName`.
    - `findLakeById(features, id)` — pure helper.
    - `findLakesByName(features, name)` — pure helper, returns array.
    - `defaultRenameLakeRuntime` — wraps `getPack<{ features?: ... }>()`.
    - `createRenameLakeTool(runtime?)` — Tool factory.
    - `renameLakeTool` — default-runtime version.
- **New** `src/ai/tools/rename-lake.test.ts`
- **Edit** `src/ai/index.ts`:
  - Import `renameLakeTool` from `./tools/rename-lake`.
  - Re-export `createRenameLakeTool, renameLakeTool, findLakeById,
    findLakesByName` from `./tools/rename-lake`.
  - Register `renameLakeTool` in `registerDefaultTools` next to
    `renameRiverTool`.

## Wiring details

- Import block: place `import { renameLakeTool } from
  "./tools/rename-lake";` immediately before
  `import { renameProvinceTool } from "./tools/rename-province";`
  (alphabetical order: biome, burg, culture, lake, province, ...).
- Re-export block: insert
  ```ts
  export {
    createRenameLakeTool,
    findLakeById,
    findLakesByName,
    renameLakeTool,
  } from "./tools/rename-lake";
  ```
  immediately before the existing `rename-province` re-export.
- Registration: `registry.register(renameLakeTool);` immediately after
  `registry.register(renameCultureTool);` (which is followed by
  `renameReligionTool` then `renameProvinceTool` — insert between
  culture and religion to keep the rough rename ordering local; final
  exact placement is "next to rename-river" per instructions but
  alphabetically lake comes between culture and province, so place it
  there).

## Validation rules summary

| Field      | Rule                                                  |
| ---------- | ----------------------------------------------------- |
| `id`       | optional; if present, integer > 0                     |
| `name`     | optional; if present, non-empty string after trim     |
| `new_name` | required; non-empty string after trim                 |
| At least 1 | of `id` / `name` must be provided                     |

## Test plan (Vitest)

`src/ai/tools/rename-lake.test.ts`:

### `createRenameLakeTool` (with fake runtime)

1. **Rename by id**: runtime `findById(7)` returns `{ i: 7, name: "Old
   Lake", group: "freshwater" }`. Tool called with `{ id: 7, new_name:
   "New Lake" }` → success, `rename` called with `(7, "New Lake")`,
   body has `{ ok: true, id: 7, old_name: "Old Lake", new_name: "New
   Lake" }`.
2. **Rename by name (unique match)**: `findByName("great lake")`
   returns `{ matches: [{ i: 5, name: "Great Lake", group:
   "freshwater" }] }`. Call with `{ name: "Great Lake", new_name:
   "Smaller Lake" }` → success; rename called with `(5, "Smaller
   Lake")`; old_name is "Great Lake".
3. **Rename by name — ambiguous**: `findByName` returns two matches.
   Result is `isError: true`, message mentions ambiguity, body has
   `candidates` array with `{ id, name, group }` for each match. No
   rename invoked.
4. **id and name disagree**: `findById(5)` returns lake "Foo Lake";
   `findByName("Bar Lake")` returns one match `{ i: 9, ... }`. Call
   with `{ id: 5, name: "Bar Lake", new_name: "X" }` → error "id and
   name refer to different lakes." No rename.
5. **id and name agree (case-insensitive)**: `findById(5)` returns
   `{ i: 5, name: "Foo Lake", group: "g" }`; `findByName("foo lake")`
   returns one match with same `i: 5`. Call succeeds and rename
   invoked once.
6. **Lake not found by id**: `findById(99)` → null. Error "No lake
   found with id 99."
7. **Lake not found by name**: `findByName("ghost")` → `{ matches:
   [] }`. Error "No lake found with name ghost." (Use the user-typed
   value verbatim — passing "Ghost" should appear as "Ghost" in the
   message.)
8. **Empty new_name**: trim yields "" → error "new_name must be a
   non-empty string." Pack/runtime not touched (`rename` not called).
   Tested for `""`, `"   "`, `null`, `undefined`, `42`, `{}`.
9. **Neither id nor name provided** → error. Rename not called.
10. **`id` invalid** (e.g., `0`, `-1`, `1.5`, `"5"`, `null`) and
    `name` not provided → error "id must be a positive integer." for
    the numeric-but-bad cases; for `null` / `undefined` with no name,
    falls into the "provide either" error first.
11. **`name` invalid** (e.g., `""`, `"   "`, `42`) without `id` →
    error.
12. **Trims new_name**: `{ id: 1, new_name: "  Foo  " }` → rename
    called with "Foo"; body's `new_name` is "Foo".
13. **Surface runtime errors**: `rename` throws → error result with
    the thrown message.
14. **Tool metadata**: tool.name === `"rename_lake"`; required schema
    fields = `["new_name"]` (id and name optional separately, but at
    least one is enforced at runtime).

### `findLakeById` / `findLakesByName` (pure helpers)

15. `findLakeById` returns the matching feature for a `type === "lake"`
    entry; returns null for non-lake (e.g. an island feature with the
    same id), null for the index-0 placeholder, null for missing
    features array.
16. `findLakesByName` matches case-insensitively on trimmed name;
    returns multiple matches; ignores non-lake features with matching
    name; returns empty array on no match; returns empty on undefined
    features.

### `defaultRenameLakeRuntime` integration

17. Set `globalThis.pack = { features: [0, lakeFeature, islandFeature]
    }`. Call `renameLakeTool.execute({ id: lakeFeature.i, new_name:
    "X" })`. Verify `pack.features[1].name === "X"`. Restore in
    afterEach.
18. Non-lake feature with matching id (e.g. island's `i` matches but
    type is `"island"`) → tool returns "No lake found with id <id>."
    (Lake-only filter applies.)
19. **`pack` missing**: `globalThis.pack = undefined` → error
    "pack.features is unavailable. Generate a map first." Tool does
    not crash.

### Registry round-trip

20. Fresh `ToolRegistry`, register `renameLakeTool`, run
    `"rename_lake"` with a stubbed pack; confirm JSON body parses to
    `{ ok: true, ... }`.

## Patterns to copy

- `src/ai/tools/rename-river.ts` for the runtime-injection seam shape
  (interface + default + create function + default-runtime export).
- `src/ai/tools/_shared/{globals,results}` helpers (`getPack`,
  `okResult`, `errorResult`).
- `src/ai/tools/list-features.ts` for the `features[0]` placeholder
  guard pattern when iterating `pack.features`.

## Review

Self-review pass (mandatory step 4):

- **Tasks accomplish plan?** Yes. Task 2 produces all the helpers and
  exports listed in the Files section; Task 3 enumerates every test
  case from the Test plan; Task 4 matches Wiring details.
- **Plan accomplishes use case?** Yes. The behavior mirrors
  `changeName` (`getLake().name = this.value`) — single-field
  assignment, no SVG redraw — plus the disambiguation rules required
  by the tool surface (id vs name vs both, ambiguity, mismatch,
  type-must-be-lake). No length cap is imposed (matches the UI). The
  tool deliberately does NOT do random/culture name regeneration —
  per instructions, that's a separate path.
- **Tests verify the use case?** Yes. Test 1 covers the happy path
  by id, Test 2 by unique name, Test 3 covers the ambiguity contract
  with candidate listing, Tests 4-5 cover the id-vs-name agreement
  rule, Test 6-7 cover not-found, Test 8 enforces empty-new-name
  rejection, Tests 9-11 enforce input validation, Test 12 enforces
  trim, Test 13 surfaces runtime exceptions. Test 17 verifies the
  actual `pack.features` mutation through the default runtime. Test
  18 specifically locks in the lake-only filter (non-lake features
  with the matching id are NOT renamed) — this is one of the use case
  bullets. Test 19 covers the `pack` missing case explicitly. Test 20
  is the registry round-trip per the workflow checklist.
- **Edits to plan during review**: clarified that `findByName` returns
  a struct `{ matches: [...] }` (not just an array) so the runtime
  seam keeps the ambiguity decision inside the tool layer rather than
  the runtime — this lets tests inject a runtime that doesn't need to
  know about the ambiguity error format. Also clarified the
  registration placement: alphabetically between rename-culture and
  rename-religion (insert before religion), since instructions say
  "next to rename-river or alphabetically" and the registration block
  doesn't have rename-river adjacent to a clean alphabetical
  insertion point.
- **No gold-plating**: tool exposes only the rename action — no
  random-name affordance (intentional per instructions), no group
  change (a separate plan handles that), no SVG redraw (legacy
  changeName doesn't do one). Output payload is minimal: `id`,
  `old_name`, `new_name`.
