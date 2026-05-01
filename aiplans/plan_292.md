# Plan 292: regenerate_lake_name tool

## Lint baseline (captured before any work)

```
Checked 684 files in 530ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(2 of those warnings are the existing `noDynamicNamespaceImportAccess` in
`src/renderers/draw-heightmap.ts`, plus 5 others; "info" is unchanged. No
errors. Final lint must not regress this baseline.)

## Use case

Add a new AI chat tool `regenerate_lake_name` that re-rolls the name of an
existing lake. This mirrors the two name buttons in the lakes editor:

```js
function generateNameCulture() {
  const lake = getLake();
  lake.name = lakeName.value = Lakes.getName(lake);
}

function generateNameRandom() {
  const lake = getLake();
  lake.name = lakeName.value = Names.getBase(rand(nameBases.length - 1));
}
```

The user-visible feature is "open Edit Lake → click 'Name (culture)' or 'Name
(random)' to re-roll the lake's name". The AI currently has no equivalent.

## Behavior

- Identify a lake by `id` (`feature.i`) or `name` (case-insensitive exact
  match), exactly the same convention as the just-merged `rename_lake` and
  `set_lake_group` tools (id-or-name with disambiguation).
- `mode` is required and must be exactly `"culture"` or `"random"` (rejects
  anything else, including casing-only aliases — be explicit since this is a
  destructive mutation).
- `mode: "culture"` calls the runtime culture-name generator (default impl
  delegates to `window.Lakes.getName(feature)`).
- `mode: "random"` calls the runtime random-name generator (default impl reads
  `window.nameBases.length`, picks a random integer in `[0, length-1]` via
  the project's `rand` global if available, falls back to
  `Math.floor(Math.random() * length)`, then calls
  `window.Names.getBase(idx)`).
- The chosen name is written to `lake.name` on the matching feature in
  `pack.features`.
- Returns `{ ok: true, id, mode, old_name, new_name }` on success.

There is no SVG redraw side-effect: lake names aren't drawn by default
(consistent with `rename_lake`'s rationale).

## Input schema

```ts
{
  type: "object",
  properties: {
    id:   { type: "integer", minimum: 1, description: "Lake feature id." },
    name: { type: "string",                  description: "Current lake name (case-insensitive)." },
    mode: { type: "string", enum: ["culture", "random"], description: "Generator to use." },
  },
  required: ["mode"],
}
```

(Following `rename_lake`'s pattern, neither `id` nor `name` is in `required`,
but at least one of them must be provided. Both is allowed but they must
agree.)

## Validation rules

- `mode` missing → error `"mode must be \"culture\" or \"random\"."`
- `mode` not a string or not one of the two literal values → same error.
  Casing must match exactly (lowercase). This is stricter than
  `regenerate_burg_name` because the use-case description says "Pick one of
  these two literal strings; reject anything else."
- Neither `id` nor `name` provided → error
  `"Provide either id or name to identify the lake."`
- `id` present but not a positive integer → error
  `"id must be a positive integer."`
- `name` present but not a non-empty string after `.trim()` → error
  `"name must be a non-empty string."`
- Lake not found by `id` → error `"No lake found with id <n>."`
- Lake not found by `name` → error `"No lake found with name <name>."`
- Multiple lakes match `name` → error
  `"Multiple lakes match name <name>. Disambiguate by id."` with
  `candidates: [{ id, name, group }, ...]`
- `id` and `name` both provided and disagree → error
  `"id and name refer to different lakes."`
- Non-lake feature with matching id → error `"No lake found with id <n>."`
  (i.e. behaves identically to "lake not found")
- `pack` / `pack.features` missing → error message names which dependency
  is missing (matches `rename_lake`).
- `Lakes.getName` (mode=culture) unavailable → error
  `"Lakes.getName is not available; the map hasn't finished loading."` (or
  similar — the message must mention `Lakes`/`getName`).
- `Names.getBase` (mode=random) unavailable → similar error mentioning
  `Names`/`getBase`.
- `nameBases` missing/empty (mode=random) → error mentioning `nameBases`.
- Generator throws → error surfaced through `errorResult`; pack unchanged.
- Generator returns empty / non-string → error
  `"Name generator returned an empty/invalid name."` (or similar — must
  trigger when result is not a non-empty string after trimming); pack
  unchanged.

## Files to add / modify

- **add** `src/ai/tools/regenerate-lake-name.ts` — the tool factory
  + default runtime.
- **add** `src/ai/tools/regenerate-lake-name.test.ts` — Vitest unit tests.
- **modify** `src/ai/index.ts` — three small additions:
  1. `import { regenerateLakeNameTool } from "./tools/regenerate-lake-name";`
     (alphabetised between `regenerateBurgNameTool` and
     `regenerateDomainTool`).
  2. `export { ... } from "./tools/regenerate-lake-name";` block (between the
     existing `regenerate-burg-name` export block and `regenerate-domain`).
  3. `registry.register(regenerateLakeNameTool);` line (placed near the
     other regenerate-name registrations: just after
     `registry.register(regenerateBurgNameTool);` and before
     `regenerateStateNameTool` / `regenerateProvinceNameTool`).

(`src/ai/chat-controller.ts` is intentionally dirty on master — leave it
alone; do NOT stage it.)

## Runtime injection seam

```ts
export interface RegenerateLakeNameRef {
  i: number;
  name: string;
  group: string;
}

export type LakeNameMode = "culture" | "random";

export interface RegenerateLakeNameRuntime {
  findById(id: number): RegenerateLakeNameRef | null;
  findByName(name: string): { matches: RegenerateLakeNameRef[] };
  generateCultureName(ref: RegenerateLakeNameRef): string;
  generateRandomName(): string;
  apply(i: number, name: string): void;
}

export const defaultRegenerateLakeNameRuntime: RegenerateLakeNameRuntime = {...};

export function createRegenerateLakeNameTool(
  runtime?: RegenerateLakeNameRuntime,
): Tool;

export const regenerateLakeNameTool: Tool;
```

The default runtime:
- `findById` / `findByName` reuse `findLakeById` and `findLakesByName` from
  `./rename-lake` (already exported) so the lake-identification logic stays
  in one place.
- `generateCultureName` reads `window.Lakes` via `getGlobal`, validates
  `getName` is a function, calls it with the matching pack feature object
  (looked up freshly so we pass the same shape Azgaar's editor passes — i.e.
  the actual feature, not just the ref). Throws a descriptive Error if any
  precondition is missing.
- `generateRandomName` reads `window.Names` and `window.nameBases` via
  `getGlobal`. Picks an index using `window.rand` if it's a function,
  otherwise `Math.floor(Math.random() * nameBases.length)`. Calls
  `Names.getBase(idx)`. Throws on missing dependencies / empty `nameBases`.
- `apply(i, name)` writes `feature.name = name` on the matching `pack.features`
  entry by linear scan (same as `defaultRenameLakeRuntime.rename`). Throws
  if pack is missing or no lake matches.

## Tests (Vitest)

Stub-runtime tests:
- happy path mode=culture by id (returns "Foo Lake"; pack mutates;
  old/new_name reported)
- happy path mode=random by id (returns "Bar"; pack mutates)
- identification by unique name works
- ambiguous name → error with candidates; pack unchanged
- id/name disagreement → error
- lake not found by id → error
- non-lake feature with matching id → error: "No lake found with id ..."
- mode missing → error; pack unchanged
- mode invalid (e.g. "foo") → error; pack unchanged
- generator throws → error surfaced; pack unchanged
- generator returns empty string → error; pack unchanged
- generator returns non-string → error; pack unchanged
- tool name + registry round-trip
- input_schema has mode in `required`

Default-runtime integration tests (using `globalThis` like `rename-lake`'s
integration block does):
- end-to-end with `window.Lakes.getName` and `window.Names.getBase` stubbed
  on `globalThis`
- `window.Lakes` missing (mode=culture) → error message names which
  dependency
- `window.Names` missing (mode=random) → error message names which
  dependency
- `window.nameBases` empty (mode=random) → error
- `window.nameBases` missing (mode=random) → error

## Error cases — summary

| Condition                                          | Outcome                                  |
| -------------------------------------------------- | ---------------------------------------- |
| `mode` missing / not "culture" / not "random"      | error `mode must be "culture" or "random".` |
| Neither `id` nor `name` provided                   | error                                    |
| `id` invalid                                       | error                                    |
| `name` invalid                                     | error                                    |
| Lake not found                                     | error                                    |
| Multiple matches                                   | error w/ candidates                      |
| id & name disagree                                 | error                                    |
| Non-lake feature with matching id                  | error (same as not found)                |
| `pack` missing                                     | error                                    |
| Generator dependency missing                       | error                                    |
| Generator throws                                   | error                                    |
| Generator returns empty / non-string               | error                                    |

## Workflow checkpoints

1. Lint baseline captured (above).
2. This plan written.
3. tasks_292.md written.
4. Self-review (Review section below).
5. Implement.
6. `npm test` passes; `tsc --noEmit` clean; lint not regressed.
7. Commit `feat(ai): add regenerate_lake_name tool` with only the new
   tool files plus the three small additions to `src/ai/index.ts`.

## Review

Re-read the plan and tasks file after writing both. Verify:

(a) **Tasks accomplish the plan.** Tasks list covers: file creation
(implementation + tests), all schema/validation rules from this plan, the
three index.ts edit points, and the verify-and-commit pipeline. Nothing in
the plan is unaddressed.

(b) **Plan accomplishes the use case.** The use case is "AI re-rolls a lake
name using either the cultural or the random base-name generator". Both
modes are wired through the runtime seam to the same window globals the
lakes-editor uses, by-id and by-name identification matches the existing
`rename_lake` UX, and validation matches `rename_lake` plus the use-case
spec (strict literal `"culture" | "random"` for mode).

(c) **Tests verify the use case.** Both happy-path modes are tested via
stub runtime AND end-to-end via default runtime exercising real globals.
Identification, disambiguation, and dependency-missing failure modes are
covered. Pack unchanged on every error path is asserted on the most
important error branches.

Edits applied during review:
- Tightened the "mode invalid" error message — must mention both
  `"culture"` and `"random"` in plain text (so the error is
  actionable).
- Confirmed registry-round-trip test should run through
  `ToolRegistry`, mirroring `rename-lake.test.ts`.
- Removed any vestige of "caller-supplied seed" — the use-case spec
  explicitly forbids it.
- Confirmed the integration test will set `globalThis.pack` directly
  (no DOM), matching what `rename-lake.test.ts` does.
