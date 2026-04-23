# Tasks 239 — `find_burgs_by_feature`

## 1. Implement `src/ai/tools/find-burgs-by-feature.ts`

- Imports from `./_shared`: `errorResult`, `getPack`, `okResult`, `RawBurg`.
- Imports from `./index`: types `Tool`, `ToolResult`.
- Constants: `DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT = 10000`,
  `MAX_FIND_BURGS_BY_FEATURE_LIMIT = 100000`.
- Types:
  - `FindBurgsByFeatureHit { i, name, x, y, population, capital }`
  - `FindBurgsByFeaturePayload { burgs, count }`
  - `FindBurgsByFeatureResult = Payload | "not-ready"`
  - `ResolvedFeature { i, type: string | null, name: string | null }`
  - `ResolveFeatureResult = ResolvedFeature | "not-ready" | "not-found"`
- Local `PackLike` covering:
  - `burgs?: RawBurg[]`
  - `features?: ArrayLike of featureish entries | 0 | null | undefined`
  - `cells?: { f?: Array<number | undefined> }`
- `resolveFeatureRefInPack(pack, featureId)`:
  - Not-ready if pack/features missing.
  - Not-found if id <= 0, id >= features.length, slot falsy or non-object.
  - Return `{ i, type, name }` pulling raw feature.type (string|null) and
    feature.name (non-empty string|null; empty or absent → null).
- `findBurgsByFeatureInPack(pack, featureI, limit)`:
  - Not-ready if `pack`, `pack.burgs`, or `pack.cells.f` missing.
  - Iterate `pack.burgs`, skip i=0, removed, burg with non-number cell.
  - Compare `cellFeature[b.cell] === featureI` (undefined won't match).
  - Cap by `limit`; always count full total.
- Runtime seam `FindBurgsByFeatureRuntime` with `resolveFeature` / `find`
  functions; `defaultFindBurgsByFeatureRuntime` delegates through
  `getPack<PackLike>()`.
- `parseLimit(value)` — same pattern as religion tool.
- `parseFeatureRef(value)` — integer >= 1 required; returns
  `{ok, ref} | {ok:false, error}`. (No string name support for features
  — feature names are not unique / may be null. Matches
  `get_feature_info` which only accepts numeric ids.)
- `createFindBurgsByFeatureTool(runtime = default)`:
  - `name: "find_burgs_by_feature"`
  - Description closely modeled on `find_burgs_by_religion` description,
    but swap to feature vocabulary. Include API key reference.
  - `input_schema` with `feature` (integer, minimum 1) and optional
    `limit` (integer 1..MAX).
  - `execute`: validate ref → resolve → find → return `{ok, feature: {i, type, name}, burgs, count}`.
- Export default singleton: `findBurgsByFeatureTool`.

## 2. Implement `src/ai/tools/find-burgs-by-feature.test.ts`

Structure mirrors `find-burgs-by-religion.test.ts`:

- `FakePack` with `burgs`, `features`, `cells: { f: [...] }`.
- `asPack` helper: cast via `as unknown as Parameters<typeof findBurgsByFeatureInPack>[0]`.
- `makePack()` builds:
  - Features:
    - `[0]` = 0 (sentinel)
    - 1: `{i:1, type:"island", name:"Isle"}`
    - 2: `{i:2, type:"continent", name:"Main"}`
    - 3: `{i:3, type:"lake", name:"Mirror"}`
    - 4: `{i:4, type:"ocean"}` (no name — test null)
    - 5: 0 (empty slot)
  - `cells.f` array mapping cell indices to feature ids (some out of range).
  - Burgs covering: capital on feature 1, town on feature 1, town on
    feature 2, two on feature 4, removed burg, no-cell burg, out-of-bounds
    cell burg.
- Scanner tests:
  - Returns all active burgs for a feature.
  - Second feature clean (no cross-contamination).
  - Empty when feature has no burgs.
  - Skips i=0 placeholder + removed.
  - Skips out-of-bounds cell (cells.f[99] undefined).
  - Truncates at limit but preserves count.
  - Populates x/y/name/population/capital correctly.
  - `not-ready` when pack missing / burgs missing / cells.f missing.
- `resolveFeatureRefInPack` tests:
  - Resolves valid id with type/name.
  - Handles unnamed feature (returns name: null).
  - Rejects id 0 (sentinel).
  - Rejects negative id.
  - Rejects out-of-range id.
  - Rejects empty slot (value `0`).
  - `not-ready` when features missing.
- Tool surface tests:
  - ok=true with resolved feature + burgs + count.
  - Accepts integer feature; echoes {i,type,name}.
  - Unnamed ocean feature surfaces name:null.
  - Rejects missing / invalid feature (string, null, 0, -1, 1.5, bool).
  - Surfaces 'not-found' as structured error.
  - Surfaces 'not-ready' from resolveFeature as error.
  - Surfaces 'not-ready' from find as error.
  - Respects explicit limit with full count.
  - Rejects invalid limit values.
  - Applies default limit when omitted.
  - Empty-feature case.
  - Exported as findBurgsByFeatureTool with schema.
  - Exposes DEFAULT / MAX constants.
- `defaultFindBurgsByFeatureRuntime` integration block:
  - beforeEach/afterEach save+restore `globalThis.pack`.
  - Cast `(globalThis as unknown as { pack?: unknown }).pack`.
  - Uses `makePack()` for default runtime, verifies resolve + find.
  - Default tool end-to-end for feature 1 and 4.
  - `pack = undefined` → `not-ready` from both + tool error.

## 3. Register in `src/ai/index.ts`

- Add `import { findBurgsByFeatureTool } from "./tools/find-burgs-by-feature";`
  in the right alphabetical slot (after `find-burgs-by-culture`, before
  `find-burgs-by-population-range`).
- Add re-export block (alphabetical among `find-burgs-by-*` exports)
  matching the shape of the religion block.
- Add `registry.register(findBurgsByFeatureTool);` near the other
  `findBurgs*` registrations around the religion registration.

## 4. README_AI.md

- Insert a new row for `find_burgs_by_feature` in the tools table,
  adjacent to the `find_burgs_by_religion` row. Description closely
  mirrors the registered tool description; sample prompts:
  - "List every burg on the continent feature 2"
  - "What cities sit on the Verdant Isle?"
  - "Show me every burg on feature 4"

## 5. Verify

- `npm run lint 2>&1 | tail -5` — expect 7 warnings / 1 info / 0 errors.
- `npm run build` — expect clean exit.
- `npm test 2>&1 | tail -5` — all tests pass, count grows by new file.

## 6. Commit

- Stage only:
  - `src/ai/tools/find-burgs-by-feature.ts`
  - `src/ai/tools/find-burgs-by-feature.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_239.md`
  - `aiplans/tasks_239.md`
- Commit message (HEREDOC): `feat(ai): add find_burgs_by_feature tool`
  with a 1-2 line body and the standard Co-Authored-By trailer.
