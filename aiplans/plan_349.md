# Plan 349 — `add_coastline_group` AI tool

## Use case

The Coastline Editor (`public/modules/ui/coastline-editor.js` lines
140-173) renders an "Add group" button. Clicking it reveals a text
input bound to `createNewGroup`:

```js
function createNewGroup() {
  if (!this.value) return tip("Please provide a valid group name");

  const group = this.value
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^\w\s]/gi, "");

  if (byId(group)) return tip("Element with this id already exists. Please provide a unique name", false, "error");

  if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

  // ... clones the parent <g> (sea_island / lake_island) and appends under #coastline
  const newGroup = elSelected.node().parentNode.cloneNode(false);
  byId("coastline").appendChild(newGroup);
  newGroup.id = group;
  ...
}
```

The user-visible round-trip is "open Coastline Editor → click Add
group → type a name → press enter → a new `<g id={name}>` exists under
`#coastline`, cloning the styling of the previously-selected
coastline's parent group (typically `sea_island`)".

The AI side already has `add_lake_group`, `add_burg_group`,
`add_route_group`, `add_label_group`, plus per-feature `set_*_group`
and `remove_*_group` siblings. There is no `add_coastline_group`. This
plan adds the missing creator — the simplest of the coastline-group
family. Per-feature `set_coastline_group` and `remove_coastline_group`
are out of scope (follow-up plans).

## Lint baseline (before any changes)

`npm run lint` on plan-349 base (`master @ 1b44de5`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 801 files in 648ms. No fixes applied.
```

Clean. No warnings, no errors. Post-implementation lint must remain
clean.

## Tool name

`add_coastline_group`

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Desired group name. Will be lowercased, spaces converted to underscores, and special characters stripped. No prefix added — coastline group ids are bare like \"sea_island\" or any custom name."
    }
  },
  "required": ["name"]
}
```

Only the `name` field is supported. The chat tool intentionally does
NOT take an "elementToMove" hint — unlike the editor, which moves the
currently-selected coastline path into the new group, this primitive
only creates the empty container. Pair with a (future)
`set_coastline_group` for movement.

## Behavior

1. Validate `name` is a non-empty string.
2. Sanitize via `sanitizeGroupName` re-exported from
   `add-route-group.ts` (which is the same function `add-lake-group.ts`
   re-exports). Pipeline: `lowercase → spaces→underscores → strip
   non-\w/\s`. Crucially this tool does NOT prefix the result —
   coastline group ids are bare like lake / label group ids.
3. Reject empty sanitized result with `"Invalid group name (sanitized
   to empty)."` (matches `add-lake-group.ts` wording exactly).
4. Reject sanitized name that starts with a digit with `"Group name
   must start with a letter."` (matches `add-lake-group.ts`).
5. Reject id collision (DOM-wide via `document.getElementById` —
   matches `byId(group)` in the UI). When colliding, surface the
   existing element's tag in the error, e.g. `"Element with id
   storm_coast (<g>) already exists."` — wording matches
   `add-lake-group.ts`.
6. Append a new `<g id={id}>` under the `#coastline` SVG layer:
   - Look up the `coastline` D3 selection via `getGlobal("coastline")`
     and `.node()`. Fall back to `document.getElementById("coastline")`.
   - Error if neither resolves: `"#coastline SVG layer is unavailable."`
   - When a `<g id="sea_island">` exists, shallow-clone its attributes
     (so the new group inherits styling — fill, stroke, etc.).
     Otherwise create a bare `<g>` via
     `document.createElementNS(SVG_NS, "g")` (or fall back to
     `createElement("g")`).
   - **Always set the new id explicitly via `setAttribute("id", id)`**
     — even when cloning, otherwise the clone would carry the
     `sea_island` id verbatim.
7. Return the canonical id.

## Inputs/Outputs

Successful append (cloned from sea_island):
```jsonc
{
  "ok": true,
  "id": "shipping_lanes",
  "cloned_from": "sea_island"
}
```

Successful append (no template available, bare `<g>` created):
```jsonc
{
  "ok": true,
  "id": "shipping_lanes",
  "cloned_from": null
}
```

The runtime seam exposes a hint via the `appendGroup` return value so
the tool can populate `cloned_from` accurately. (Lake group's runtime
returns `void`; we extend it slightly here.)

## Validation / error catalog

- `name` missing / not string / empty / whitespace-only after trim →
  `"name must be a non-empty string."`.
- Sanitized `name` empty (e.g. input `"!!!"` → `""` after sanitize) →
  `"Invalid group name (sanitized to empty)."`.
- Sanitized `name` starts with digit (e.g. `"9foo"` → `"9foo"`) →
  `"Group name must start with a letter."`.
- DOM id collision (any tag, anywhere in document) → `"Element with id
  <id> (<<tag>>) already exists."` (or, when tag info missing,
  `"Element with id <id> already exists."`).
- `#coastline` SVG layer unavailable (no `window.coastline` D3 selection
  AND no `#coastline` DOM element) → `"#coastline SVG layer is
  unavailable."`.
- Runtime errors during append are propagated verbatim via
  `errorResult(err.message)`.

## Files to add

- `src/ai/tools/add-coastline-group.ts` — tool implementation.
- `src/ai/tools/add-coastline-group.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Import alphabetically near other `add*` imports (immediately after
    `addBurgGroupTool`, before `addCultureTool`):
    `import { addCoastlineGroupTool } from "./tools/add-coastline-group";`
  - Add re-export block near the lake-group / label-group exports
    (alphabetical by module name → between `add-burg-group` and
    `add-culture`):
    ```
    export {
      type AddCoastlineGroupRuntime,
      addCoastlineGroupTool,
      createAddCoastlineGroupTool,
      defaultAddCoastlineGroupRuntime,
    } from "./tools/add-coastline-group";
    ```
  - Add `registry.register(addCoastlineGroupTool);` adjacent to
    `addLakeGroupTool` / `addBurgGroupTool` registrations.

## Runtime-injection seam

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import { sanitizeGroupName } from "./add-route-group";
import type { Tool, ToolResult } from "./index";

export { sanitizeGroupName };

export interface IdExistsCheck {
  exists: boolean;
  tag?: string;
}

export interface AppendGroupResult {
  /** id of the template the new group was cloned from, or null if a bare <g> was created. */
  clonedFrom: string | null;
}

export interface AddCoastlineGroupRuntime {
  idExists(id: string): IdExistsCheck;
  /**
   * Append a new <g id={id}> under the #coastline SVG layer. Returns
   * info about whether attributes were cloned from #sea_island. Throws
   * when the coastline layer is unavailable.
   */
  appendGroup(id: string): AppendGroupResult;
}

export const defaultAddCoastlineGroupRuntime: AddCoastlineGroupRuntime = { ... };

export function createAddCoastlineGroupTool(runtime?): Tool { ... }

export const addCoastlineGroupTool = createAddCoastlineGroupTool();
```

The runtime returns information about whether the clone-template was
used so the tool's success result can include the
`cloned_from` field accurately. This is the only meaningful divergence
from the lake-group runtime shape (which returns `void`).

## Tests (Vitest)

Mocked-runtime unit tests:

1. **Happy path**: name `"Shipping Lanes"` → id `shipping_lanes`,
   appended; result `{ ok: true, id: "shipping_lanes", cloned_from:
   "sea_island" }`.
2. **Sanitization (special chars stripped)**: name `"Storm Coast!"` →
   id `storm_coast`.
3. **Sanitization regression**: ensure no `route-` or other prefix is
   added. `"foo"` → id `"foo"`.
4. **Rejects non-string name** (undefined, null, number, bool, object,
   array).
5. **Rejects empty / whitespace-only name** (`""`, `"   "`, `"\t\n"`).
6. **Rejects name that sanitizes to empty** (`"!!!"`) →
   `"Invalid group name (sanitized to empty)."`.
7. **Rejects sanitized name starting with digit** (`"9foo"`) →
   `"Group name must start with a letter."`.
8. **Id collision (with tag info)**: idExists returns `{ exists: true,
   tag: "g" }` → error mentions `<g>`.
9. **Id collision (no tag info)**: idExists returns `{ exists: true
   }` → still says "already exists".
10. **Surfaces appendGroup failures** (e.g.
    `"#coastline SVG layer is unavailable."`).
11. **Tool name** is `"add_coastline_group"`.
12. **Registry round-trip**: register and find it in `registry.list()`.

Default-runtime integration tests (fake DOM):

13. **D3 path**: `globalThis.coastline` present with
    `node()` → new `<g>` appended with the correct id; result includes
    `cloned_from: null` (no `sea_island` template in this test).
14. **DOM fallback**: `globalThis.coastline` absent, `#coastline` DOM
    element present → still appends; success.
15. **Inherits attributes from `#sea_island`** when present:
    fill+stroke copied to new `<g>`, new id set explicitly so the
    clone does NOT carry `sea_island` as its id; `cloned_from:
    "sea_island"`.
16. **Bare `<g>` fallback**: no `#sea_island` template → new `<g>`
    created via `createElementNS`; `cloned_from: null`.
17. **Errors when neither `coastline` selection nor `#coastline`
    element exists**: `"#coastline SVG layer is unavailable."`.
18. **Collision: existing `<g id="sea_island">` blocks
    `name: "sea_island"`** — error, no append.
19. **Collision: unrelated `<input id="storm_coast">` elsewhere
    blocks `name: "Storm Coast"`** — error names `<input>`, no append.

## Verification

- `npm test` — full suite, all tests pass.
- `npm run lint` — clean (matches baseline: 0 warnings, 0 errors).
- `npx tsc --noEmit` — clean.

## Self-review

Re-read pass after drafting this plan and the tasks file:

- Sanitization is delegated to `sanitizeGroupName` from
  `add-route-group.ts` (same as `add-lake-group.ts` and
  `add-label-group.ts`). Not reinvented.
- Id collision check is DOM-wide (not scoped to `#coastline`) —
  matches the UI's `byId(group)` semantics exactly.
- The clone-from-`sea_island` fallback is tested both ways: present
  and absent.
- The new id is set explicitly via `setAttribute("id", id)` AFTER
  cloning. Without this, the clone would carry `sea_island` as its
  id and the collision check would later catch a duplicate. Tested in
  test 15.
- Error wording matches `add-lake-group.ts` verbatim where they
  apply: `"name must be a non-empty string."`, `"Invalid group name
  (sanitized to empty)."`, `"Group name must start with a letter."`,
  `"Element with id <id> (<<tag>>) already exists."`. The layer-
  unavailable wording is the same shape: `"#coastline SVG layer is
  unavailable."`.
- The success object adds a `cloned_from` field that the lake-group
  tool does not. This is intentional for caller introspection —
  knowing whether attribute styling was inherited is useful (the
  caller may want to set fill/stroke explicitly on a bare `<g>`).
  The runtime seam returns this hint via `appendGroup`'s return
  value (a small struct rather than `void`), avoiding any second
  DOM-walk inside the tool.
- No edits outside the listed files — except a one-character bump
  in `public/main.js` (see below).
- Commit message: `feat(ai): add add_coastline_group tool`.

### Post-implementation correction

- The `global-exposure.test.ts` seam test failed on first run because
  `public/main.js:69` declared the coastline layer as `let coastline =
  ...`. Top-level `let` does NOT attach to `globalThis` in classic
  scripts, AND the SVG layer's `id="coastline"` causes
  `window.coastline` to silently shadow into the `<g>` DOM element
  itself (named-element auto-property). This is exactly the latent
  bug class fixed by commit `1d137af` for 14 sibling layers
  (`lakes`, `labels`, `routes`, `ice`, etc.). Fix applied: change
  `let coastline` → `var coastline` in `public/main.js`. The `var`
  binding's right-hand-side is evaluated AFTER the named-element
  shadow is set, and the assignment overrides it with the intended
  D3 selection. Verified: full test suite green (6739 tests).
- Files modified is therefore `src/ai/index.ts` + `public/main.js`
  (in addition to the two new files).
