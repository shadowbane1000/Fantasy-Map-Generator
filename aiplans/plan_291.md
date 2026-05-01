# Plan 291 — `set_lake_group` AI tool

## Lint baseline (pre-implementation)

```
Checked 680 files in 522ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(0 errors. From `npm run lint` on plan-291 branch @ 322b9ef.)

## Use case

Provide an AI tool that performs the same side effect as the lakes-editor's
"Group" dropdown (`changeLakeGroup` in `public/modules/ui/lakes-editor.js`):
move a lake into an existing lake group.

```js
function changeLakeGroup() {
  byId(this.value).appendChild(elSelected.node());
  getLake().group = this.value;
}
```

The tool only performs assignment to an EXISTING `<g>` group under `#lakes`.
Creating new groups is out of scope (a future `add_lake_group` tool will
handle that).

## Verified facts about the data

- Lakes are entries in `pack.features` with `type === "lake"`.
  `pack.features[0]` is a `0` placeholder; subsequent entries have `i`,
  `type`, `group`, `name`, etc. (see `src/modules/features.ts` for the
  `PackedGraphFeature` type and `src/ai/tools/list-features.ts` for the
  read pattern.)
- The lakes-editor identifies the lake from a clicked SVG node via
  `+elSelected.attr("data-f")` and looks it up via
  `pack.features.find(feature => feature.i === lakeId)`.
- Lake SVG markup (from `src/renderers/draw-features.ts`):
  - `<path id="feature_{i}" data-f="{i}">` lives inside `defs#featurePaths`
    (the path geometry).
  - The on-map *render* uses `<use href="#feature_{i}" data-f="{i}"></use>`
    inside `<g id="{group}">`, all under `<g id="lakes">`. So the element
    that `lakes-editor` re-parents is a `<use>`, not a `<path>`.
  - The plan brief says "selector: `#lakes path[data-f=...]`" but instructs
    us to verify and use what's actually used. The actual element is a
    `<use>`, so I'll select with `#lakes [data-f="{i}"]` (tag-agnostic) and
    additionally guard that the element is inside `#lakes`.
- Default lake-group ids (from `removeLakeGroup`): `freshwater`, `salt`,
  `sinkhole`, `frozen`, `lava`, `dry`. Custom groups may also exist.
  The lake-group dropdown is built from the live `<g>` children of
  `#lakes`, so the tool must validate against the DOM (not a hardcoded
  list).

## Tool contract

- Name: `set_lake_group`
- File: `src/ai/tools/set-lake-group.ts`
- Tests: `src/ai/tools/set-lake-group.test.ts`
- Wired in: `src/ai/index.ts` (alphabetically near `set-route-group`).

### Inputs

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "The lake's pack.features[i].i value."
    },
    "name": {
      "type": "string",
      "description": "The lake's current name (case-insensitive exact match)."
    },
    "group": {
      "type": "string",
      "description": "Target group id; must already exist as a <g> under #lakes."
    }
  },
  "required": ["group"]
}
```

At least one of `id` / `name` must be present. (Schema uses `required: ["group"]`
only and the execute method enforces the id-or-name rule, mirroring how the
existing tools handle similar XOR semantics. We will document this in the
description.)

### Validation rules (executed in order, first failure wins)

1. `pack` must be present and `pack.features` must be an array — otherwise
   error "Map is not ready yet…".
2. `group` must be a non-empty string after trimming.
3. At least one of `id` / `name` must be provided. `id` (when present) must
   be a positive integer. `name` (when present) must be a non-empty string
   after trimming.
4. Resolve the lake:
   - If only `id`: find feature with `feature.i === id` and `type === "lake"`.
     Missing → error.
   - If only `name`: scan `pack.features` for `type === "lake"` entries
     whose `name` (lowercased) equals the trimmed lowercased input.
     - 0 matches → error "No lake found with name…".
     - >1 matches → error with `candidates: [{i, name, group}, …]`.
   - If both `id` and `name`: find by id (must be a lake); the resolved
     lake's name (lowercased) must equal the trimmed lowercased input —
     otherwise error "id X is lake 'Y', not 'Z'".
5. Validate target group: there must exist a `<g>` element with
   `id === group` directly under `#lakes`. Missing → error
   "No lake group with id 'X' under #lakes." (We additionally enumerate
   the existing groups in the error payload so the caller can recover.)
6. Find the lake's SVG element under `#lakes` whose `data-f` attribute
   equals the lake's `i` (string). If not found → error
   "Lake i=X has no SVG element under #lakes." (pack is NOT mutated.)
7. If the element is already a child of the target group → no-op
   success with `changed: false`.
8. Otherwise: append the SVG element to the target `<g>`, set
   `lake.group = group`, return success with `changed: true`,
   `old_group`, `new_group`.

### Result shape

Success:

```json
{
  "ok": true,
  "i": <number>,
  "name": <string>,
  "old_group": <string|null>,
  "new_group": <string>,
  "changed": <boolean>
}
```

Errors use `errorResult` (which yields
`{ok: false, error, …extra}` and `isError: true`).
Ambiguous-name errors include
`candidates: [{i, name, group}, …]`.
Unknown-target-group errors include `available: [...]` with the existing
group ids.

## Runtime injection seam

Mirroring `set-route-group`:

```ts
export interface LakeGroupRef {
  i: number;
  name: string;
  oldGroup: string | null;
}

export interface SetLakeGroupRuntime {
  // Resolve lake by either numeric id, name, or both. Returns
  // - null when not found
  // - {error: 'ambiguous', candidates} for multiple-name matches
  // - {error: 'mismatch', resolved} when id and name disagree
  // - LakeGroupRef on success
  find(input: { id?: number; name?: string }): LakeGroupResolution;
  // List existing group ids under #lakes (for validation + error messages).
  listGroups(): string[] | null;
  // Move the SVG element and write feature.group. Throws on missing
  // SVG element or missing target group. Returns changed flag.
  apply(i: number, group: string): { changed: boolean; oldGroup: string | null };
}
```

`defaultSetLakeGroupRuntime` reads `getPack<…>().features` and uses
`document` queries (`document.getElementById("lakes")`,
`querySelectorAll(":scope > g")`, `querySelector('[data-f="{i}"]')`).

`createSetLakeGroupTool(runtime?)` returns the `Tool`. `setLakeGroupTool`
exports the default-runtime version.

## Wiring

Add to `src/ai/index.ts`:

- import `setLakeGroupTool` from `./tools/set-lake-group`
- export `createSetLakeGroupTool`, `setLakeGroupTool`
- `registry.register(setLakeGroupTool)` near other registrations.

## Test plan (`set-lake-group.test.ts`)

Two `describe` blocks following the set-route-group / rename-river style:

### A. Unit tests using a fake `SetLakeGroupRuntime`

1. Happy path by id — `apply` called with `(i, group)`; result
   `{ok, i, name, old_group, new_group, changed: true}`.
2. Happy path by name (case-insensitive) — `find` receives `{name}`;
   `apply` called.
3. Both id and name provided and consistent — succeeds.
4. id and name provided but inconsistent → error mentioning the actual
   name, no `apply`.
5. Ambiguous name → error with `candidates`, no `apply`.
6. Unknown id → error, no `apply`.
7. Neither id nor name provided → error, no `apply`.
8. Missing/empty `group` → error, no `apply`.
9. Apply throws (`group element missing`) → surfaced as error.
10. Apply returns `{changed: false}` (target group equals current) →
    success with `changed: false`, no `old_group !== new_group` claim.
11. Tool name is `set_lake_group`; registry round-trip — register the
    tool and resolve it via `registry.run`.

### B. Integration tests using the default runtime + a mocked DOM

Set `globalThis.pack` to a fixture with two lake features and one
non-lake feature; set `globalThis.document` to a stub exposing:

- `getElementById("lakes")` returning a fake `<g>` with `<g>` children.
- `querySelector` / `querySelectorAll` semantics on those children
  enough for our queries.

Cases:

12. Happy path by id moves the `<use>` and updates `feature.group`.
13. Happy path by name (case-insensitive).
14. Target group equals current → idempotent: feature.group unchanged
    (or still equal); `changed: false`; no spurious `appendChild`.
15. Unknown target group → error; pack and DOM unchanged.
16. Lake `<use>` not found in DOM → error; `feature.group` NOT mutated.
17. Non-lake feature with matching id → error "lake not found"; pack
    unchanged.
18. Multiple lakes share a name → error with candidates; pack unchanged.
19. `pack` missing → error "Map is not ready yet…".

## Error cases checklist (traceability)

| Brief case                                | Plan section | Test |
|-------------------------------------------|--------------|------|
| Lake not found by id or name              | 4            | 6, 16-non-lake |
| Multiple lakes match name                 | 4            | 5, 18 |
| Both id and name provided but disagree    | 4            | 4 |
| Neither id nor name provided              | 3            | 7 |
| `group` missing/empty                     | 2            | 8 |
| Target group `<g>` doesn't exist          | 5            | 15 |
| Target group equals current               | 7            | 10, 14 |
| `pack`/`pack.features` missing            | 1            | 19 |
| Lake's SVG `<path>` element not found     | 6            | 16 |
| Tool name + registry round-trip           | n/a          | 11 |

## Review

I re-read the plan with the use-case and tasks side-by-side. Findings:

- (a) **Tasks accomplish the plan**: tasks_291.md has one task per file
  (tool, test, wiring) plus the verification step. Each task's deliverable
  matches a plan section.
- (b) **Plan accomplishes the use case**: plan mirrors `changeLakeGroup`
  exactly — write `feature.group`, re-parent the SVG element. Identifies
  the lake by `feature.i` (matches `lakes-editor.js`'s
  `pack.features.find(feature => feature.i === lakeId)`). Validates the
  target group is one of the live `<g>` children of `#lakes` rather than
  a hardcoded list — matches how the dropdown is populated.
- (c) **Tests verify the use case**: integration tests exercise the
  default runtime against a mocked DOM that mirrors the actual SVG
  shape (`#lakes > g > use[data-f]`). They assert both the data
  mutation (`feature.group`) and the DOM re-parent
  (`appendChild` called with the right element) — the two effects
  the user-visible operation produces.

Gaps closed in this revision:

- Originally I had only `[data-f]` selectors at the document root. Updated
  to scope queries to `#lakes` so we don't accidentally pick up
  `defs#featurePaths > path[data-f]` (which has the same `data-f` but
  must NOT be re-parented).
- Originally I had `required: ["id", "group"]` in the schema. Loosened to
  `required: ["group"]` so callers can pass `name` instead, and the
  id-or-name rule is enforced in `execute`. This matches how the brief
  defines the inputs.
- Added test 17 for the "non-lake feature with same i" case (e.g. an
  island shares an `i` slot — actually `i` is unique in `pack.features`,
  but features include oceans/islands that aren't lakes; the brief
  explicitly calls this out).
- Added an `available: [...]` field to the unknown-target-group error to
  help callers recover, mirroring the `supported:` field set-route-group
  uses for invalid groups.
