# Plan 309 — `add_burg_group` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ 1ee280b` (plan-309 branch base):

```
Checked 716 files in 558ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info are the same pre-existing
`lint/performance/noDynamicNamespaceImportAccess` notices in
`src/renderers/draw-heightmap.ts` (lines 34 and 64) plus
`src/modules/provinces-generator.ts:321` `useLiteralKeys` info and
several pre-existing `<explanation>` placeholder suppressions in
`src/modules/emblem/generator.ts`. None are in any file we touch. This
is the baseline that the post-implementation lint must match.

## Use case

The Burg Groups Editor (`public/modules/ui/burg-group-editor.js`)
renders an "Add" dialog button:

```js
Add: () => {
  byId("burgGroupsBody").insertAdjacentHTML(
    "beforeend",
    createLine({name: "", active: true, preview: null})
  );
}
```

Clicking Add inserts a blank `<tr>` with `active: true` and
`preview: null`. The user fills the form, clicks Apply, and
`submitForm` writes the parsed config back to
`options.burgs.groups`. The user-visible round-trip is "open
Configure Burg Groups → click Add → fill in fields → Apply → new group
exists in `options.burgs.groups` and is persisted to
`localStorage["burg-groups"]`".

The AI side already has `list_burg_groups` (plan 289), all the
`set_burg_group_*` setters, and the recent `set_burg_group_active` /
`set_burg_group_default` (plans 306/307). It has no creator. This plan
adds `add_burg_group` — the AI equivalent of the Add+fill+Apply flow,
but as a single primitive that takes the desired field values up front.

## Tool name

`add_burg_group`

## Inputs (everything optional except `name`)

- `name` (string, **required**) — desired group name. Sanitized via
  `sanitizeId` from `src/utils/stringUtils.ts` (the same sanitizer the
  editor's `submitForm` uses for the `name` field). Reject if empty
  before sanitization or empty after sanitization. Reject if the
  sanitized name collides with any existing group's `name`.
- `order` (integer, optional) — draw/render order. Must be a positive
  integer. Default: `(max existing order) + 1` (or `1` if no existing
  group has a numeric `order`).
- `active` (boolean, optional) — default `true`. Reject if non-boolean.
- `preview` (string, optional) — passthrough. Editor allows
  `"watabou-city"`, `"watabou-village"`, `"watabou-dwelling"`, or
  empty/none. We don't validate the value beyond "string"; document
  this. Default: not included on the new group (mirroring the editor's
  `submitForm`, which omits null-valued fields).
- `min` (number, optional) — population min constraint. Default: not
  included.
- `max` (number, optional) — population max constraint. Default: not
  included.
- `percentile` (number, optional) — population percentile in [0,100].
  Validate range when supplied. Default: not included.
- `biomes` (string, optional) — comma-separated biome ids. Default:
  not included.
- `states` (string, optional) — comma-separated state ids.
- `cultures` (string, optional) — comma-separated culture ids.
- `religions` (string, optional) — comma-separated religion ids.
- `features` (object, optional) — feature limitation map (e.g.
  `{ ocean: false, lake: true }`).
- `is_default` (boolean, optional) — default `false`. If `true`, set
  `isDefault: true` on the new group and clear `isDefault` on every
  existing group (mirroring `set_burg_group_default` semantics).

## Behavior

1. Validate inputs (see catalog below).
2. Sanitize `name` via `sanitizeId(input.name)`.
3. Reject if sanitized empty (e.g. input was `"!!!"`) or collides with
   an existing group's `name`.
4. Look up `options.burgs.groups`; reject if missing or non-array.
5. Compute default `order = (max existing order) + 1`; if no group has
   a numeric finite order, use `1`. (The editor's `<input type="number"
   name="order" min="1" required>` enforces a positive integer at
   submit time.)
6. Build the new group config object. Always include `name`, `order`,
   `active`. Include `isDefault: true` when `is_default === true`.
   Otherwise omit `isDefault` entirely (matches the editor's `submitForm`
   compaction: it strips `null`-valued fields). Include each optional
   field only when the caller supplied it, mirroring the editor's
   "value !== null → keep" rule. The optional pass-through fields are
   inserted with the names the editor uses: `preview`, `min`, `max`,
   `percentile`, `biomes`, `states`, `cultures`, `religions`,
   `features`.
7. If `is_default === true`, walk the existing array and set
   `isDefault: false` on every group whose `isDefault` is currently
   truthy. (Same semantic as `set_burg_group_default`: exactly one
   default after the call.)
8. Append the new group to the array (mutating in place, like the
   editor).
9. Persist via `localStorage.setItem("burg-groups",
   JSON.stringify(options.burgs.groups))`. Best-effort: on persist
   failure, return success with `persisted: false` and a `note` field
   describing the soft-fail.

### Divergence from editor (documented)

The editor's `validateForm` blocks Apply when no row has `isDefault:
true`. Our tool is a primitive — it does NOT auto-promote a group to
default just because no group is currently default. If the caller adds
the very first group with `is_default: false` (or in any case where no
existing group was default), we still succeed and emit a `note`:

> "No group is currently set as default. Call set_burg_group_default
> to set one."

Callers can chain `set_burg_group_default` if they need the editor's
"at least one default" invariant to hold. Document this divergence in
the tool description and in the response note.

## Inputs/Outputs

input_schema:
```
{
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, description: "..." },
    order: { type: "integer", minimum: 1, description: "..." },
    active: { type: "boolean", description: "..." },
    preview: { type: "string", description: "..." },
    min: { type: "number", description: "..." },
    max: { type: "number", description: "..." },
    percentile: { type: "number", minimum: 0, maximum: 100, description: "..." },
    biomes: { type: "string", description: "..." },
    states: { type: "string", description: "..." },
    cultures: { type: "string", description: "..." },
    religions: { type: "string", description: "..." },
    features: { type: "object", description: "..." },
    is_default: { type: "boolean", description: "..." }
  },
  required: ["name"]
}
```

Successful append:
```
{
  "ok": true,
  "group": { name, order, active, ...optional fields },
  "persisted": true
}
```

Successful append where no group was default and `is_default !== true`:
```
{
  "ok": true,
  "group": { ... },
  "persisted": true,
  "note": "No group is currently set as default. Call set_burg_group_default to set one."
}
```

Soft-fail persist (localStorage unavailable):
```
{
  "ok": true,
  "group": { ... },
  "persisted": false,
  "note": "Persist failed: <error message>"
}
```

If both the no-default note AND a persist note apply, prefer the
persist note (persistence is the more pressing failure).

## Validation / error catalog

- `name` missing / not string / empty / whitespace-only after trim →
  `"name must be a non-empty string."`.
- Sanitized `name` empty (e.g. input `"!!!"` → `""` after sanitize) →
  `"name sanitizes to an empty string."`.
- `name` collides with existing group → `"Burg group <JSON.stringify(name)>
  already exists."`.
- `options.burgs.groups` missing or not array →
  `"options.burgs.groups is missing or not an array."`.
- `order` supplied but not a positive integer (NaN, ≤0, non-integer,
  non-number) → `"order must be a positive integer."`.
- `active` supplied but not boolean → `"active must be a boolean."`.
- `preview` supplied but not string → `"preview must be a string."`.
- `min` supplied but not finite number → `"min must be a finite number."`.
- `max` supplied but not finite number → `"max must be a finite number."`.
- `percentile` supplied but not finite number → `"percentile must be a
  finite number."`.
- `percentile` out of [0, 100] → `"percentile must be between 0 and 100."`.
- `biomes`/`states`/`cultures`/`religions` supplied but not string →
  `"<field> must be a string."`.
- `features` supplied but not a plain object →
  `"features must be an object."`.
- `is_default` supplied but not boolean →
  `"is_default must be a boolean."`.

## Files to add

- `src/ai/tools/add-burg-group.ts` — tool implementation.
- `src/ai/tools/add-burg-group.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Import alphabetically near the other `add*` imports:
    `import { addBurgGroupTool } from "./tools/add-burg-group";`
  - Add re-export block:
    `export { addBurgGroupTool, createAddBurgGroupTool } from "./tools/add-burg-group";`
  - Add `registry.register(addBurgGroupTool);` in the registration
    block (near `addBurgTool`).

## Runtime-injection seam

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { sanitizeId } from "../../utils/stringUtils";

export interface AddBurgGroupGroup {
  name?: unknown;
  order?: unknown;
  active?: unknown;
  isDefault?: unknown;
  [key: string]: unknown;
}

export interface AddBurgGroupRuntime {
  /**
   * Returns the live array reference. The tool mutates in place.
   * Returns undefined when `options.burgs.groups` is missing or not an
   * array.
   */
  getGroups(): AddBurgGroupGroup[] | undefined;
  /**
   * Persists the entire groups array to backing storage. Throws when
   * storage is unavailable; the tool catches and reports
   * `persisted: false` rather than failing.
   */
  persist(groups: AddBurgGroupGroup[]): void;
}

export const defaultAddBurgGroupRuntime: AddBurgGroupRuntime = {
  getGroups() {
    const options = getGlobal<{burgs?: {groups?: unknown}}>("options");
    const groups = options?.burgs?.groups;
    return Array.isArray(groups)
      ? (groups as AddBurgGroupGroup[])
      : undefined;
  },
  persist(groups) {
    const storage = (globalThis as {localStorage?: Storage}).localStorage;
    if (!storage) throw new Error("localStorage is not available.");
    storage.setItem("burg-groups", JSON.stringify(groups));
  },
};

export function createAddBurgGroupTool(
  runtime: AddBurgGroupRuntime = defaultAddBurgGroupRuntime,
): Tool { ... }

export const addBurgGroupTool = createAddBurgGroupTool();
```

The runtime returns the **live array reference** — mutation happens
in place, just like the editor's submit path mutates
`options.burgs.groups`.

The persist seam mirrors `set-burg-group-default.ts` (the throw-on-
unavailable variant), not `set-burg-group-active.ts` (the
return-bool variant). We choose the throw style to match plan 307,
keeping new burg-group tools consistent and testable.

## Sanitization rules

`sanitizeId` (from `src/utils/stringUtils.ts`) applies, in order:

1. lowercase
2. trim
3. drop everything that isn't `[a-z0-9-_]`
4. replace runs of whitespace with `-`
5. if leading character is a digit, prepend `_`

Examples:
- `"Marsh towns"` → `"marsh-towns"` (the trim+drop step removes the
  spaces because they aren't in `[a-z0-9-_]`; then the whitespace
  rule has nothing to do — but the underscores rule and the
  digit-prefix rule still fire. Wait — actually, the regex
  `/[^a-z0-9-_]/g` strips spaces FIRST, leaving `"marshtowns"`. The
  follow-up `/\s+/g, "-"` then has no spaces to replace. So the
  actual output is `"marshtowns"`, not `"marsh-towns"`. Test
  expectations must match this; document it in tests.
- `"42 villages"` → after lowercase/trim → `"42 villages"` → strip
  non-`[a-z0-9-_]` → `"42villages"` → replace whitespace → unchanged
  → leading digit → `"_42villages"`.
- `"!!!"` → `""` → return empty → tool errors.
- `"Test_Group-1"` → `"test_group-1"`.

These follow the actual code path; no surprises beyond the
spaces-vs-hyphens behavior in step 1.

## Default order computation

Walk `options.burgs.groups`, find the maximum finite numeric `order`,
and use `max + 1`. If no group has a finite numeric `order`, fall back
to `1`. (The editor enforces `min=1, required` on the form, but the
stored array could carry corrupt data; we don't crash.)

## localStorage persistence

After append + (optional) clear-other-defaults, call
`runtime.persist(groups)`. On throw, set `persisted: false` and
`note: "Persist failed: <message>"`.

## Tests

Unit / mocked-runtime (Vitest):

1. **Happy path minimal**: `name: "Marsh towns"` → sanitized
   `"marshtowns"` → appended; new group has `name: "marshtowns"`,
   `order = (max existing) + 1`, `active: true`, no `isDefault`,
   `persisted: true`. Existing groups untouched.
2. **Happy path full**: all optional fields supplied (preview,
   min/max/percentile, biomes/states/cultures/religions, features,
   is_default true) → all on the new group; existing defaults
   cleared.
3. **is_default=true clears existing default**: pre-existing group
   with `isDefault: true`; new group with is_default=true → old
   `isDefault: false`, new `isDefault: true`.
4. **No-default state + is_default=false → success with note**:
   start with no group flagged default; add a new one with
   is_default=false; result has `note` matching
   /No group is currently set as default/.
5. **No-default state + is_default=true → success without note**:
   note is omitted because the new group is now the default.
6. **Default-order computation**: existing groups have order [3, 7,
   1] → new group default order = 8.
7. **Default-order fallback**: groups with no numeric order → new
   default order = 1.
8. **Sanitization: leading numeric → `_` prefix**: `"42villages"` →
   `"_42villages"`.
9. **Sanitization: spaces → stripped (not hyphens)**: `"Marsh towns"`
   → `"marshtowns"` per the actual sanitizeId code path.
10. **Sanitization: special chars stripped**: `"#%! foo"` →
    `"foo"`.
11. **Sanitization: mixed case → lowercase**: `"FoO"` → `"foo"`.
12. **Empty name after sanitization → error**: `"!!!"` →
    `"name sanitizes to an empty string."`.
13. **Collision → error**: existing group named `"cities"`; add with
    `name: "Cities"` (sanitizes to `"cities"`) → collision error.
    Array NOT modified, persist NOT called.
14. **`options.burgs.groups` missing/not array → error**:
    `runtime.getGroups()` returns undefined or non-array → error
    `"options.burgs.groups is missing or not an array."`.
15. **Bad order → error**: order = 0, -1, 1.5, "5", NaN → all
    rejected with `"order must be a positive integer."`.
16. **Bad percentile → error**: percentile = -1, 101, "50" → all
    rejected.
17. **Bad active → error**: active = "true", 1 → rejected with
    `"active must be a boolean."`.
18. **Bad is_default → error**: is_default = "yes" → rejected.
19. **Bad min/max/preview/biomes/.../features → error**: each typed
    field rejects non-matching types.
20. **localStorage unavailable**: persist throws → success with
    `persisted: false` and `note: "Persist failed: ..."`.
    Mutation still applied to in-memory array.
21. **Tool name + registry round-trip**: name is `"add_burg_group"`;
    registry.run path works.
22. **Default runtime smoke**: stub `globalThis.options.burgs.groups`
    + fake `localStorage` → end-to-end through `addBurgGroupTool`.

## Self-review checklist

- [x] tool name exactly `add_burg_group`.
- [x] sanitizes via `sanitizeId` from `src/utils/stringUtils.ts`
  (NOT redefined; imported).
- [x] rejects empty post-sanitize names.
- [x] rejects collisions on the sanitized name (case-insensitive
  effectively, since sanitizeId lowercases).
- [x] always emits `name`, `order`, `active` on the new group.
- [x] omits other fields when not supplied (matches editor's
  null-stripping behaviour).
- [x] when `is_default === true`, clears existing `isDefault`.
- [x] doesn't auto-promote default when `is_default !== true` and no
  group was previously default — emits a note instead.
- [x] persists via `localStorage["burg-groups"]`.
- [x] localStorage soft-fail returns success with `persisted:
  false`.
- [x] runtime seam matches the throw-style variant from
  `set-burg-group-default.ts`.
- [x] no extra unrelated edits.
- [x] tests cover all error/success paths and the registry
  round-trip.
- [x] commit message: `feat(ai): add add_burg_group tool`.

### Self-review notes (post-edit pass)

Re-read after implementation:

- `sanitizeId` strips spaces (because `/[^a-z0-9-_]/g` removes them
  before the `/\s+/g, "-"` pass has anything to operate on). Confirmed
  via Node REPL on the actual code: `"Marsh towns"` → `"marshtowns"`,
  `"42 villages"` → `"_42villages"`, `"!!!"` → `""`. Tests assert this
  behaviour rather than the prompt's "spaces → hyphens" expectation.
- The `computeDefaultOrder` helper takes a slightly redundant form
  (`else if` after `if`) for clarity: it tracks `any` (did we see a
  finite numeric order?) separately from `max`. A more compact form
  would set `any = true` whenever the typeguard passes; the result is
  identical. Tests verify the empty-array, non-numeric, and
  finite-numeric paths.
- `clearAllDefaults` uses strict-`=== true` so anomalous values like
  `isDefault: "yes"` are left untouched. This matches the
  `set_burg_group_default` `applyDefault` semantics — strict-equal
  comparison normalizes-or-skips rather than guessing truthiness.
- The collision check is on the **sanitized** name. Because
  `sanitizeId` lowercases, this means callers can't sneak in
  `"Cities"` when `"cities"` exists. Test asserts both that exact
  duplicate sanitized name and that `"My Village!!!"` collides with
  the existing `"myvillage"`.
- Persist-failure note takes precedence over the
  no-default advisory note. The test `persist note takes precedence
  over no-default note` pins that ordering.
- The optional fields use `if (input.<field> !== undefined && input.<field> !== null)`
  so callers can pass `null` to mean "use default" (mirrors the
  editor's submit form, which produces `null` for empty inputs and
  the `submitForm` then strips them).
- Biome auto-formatted the source on lint (sorted imports, collapsed
  ternary, etc.) — no behaviour change. Three unused
  `biome-ignore noExplicitAny` suppressions in the test file
  triggered three new warnings; replaced `as any` with `as unknown as`
  casts and removed the suppressions to keep parity with the
  baseline.
- Final state:
  - 47 new tests in `add-burg-group.test.ts`, all passing.
  - Full suite: 5738 tests passing across 321 files.
  - Lint: 7 warnings + 1 info (matches baseline exactly).
  - tsc --noEmit: clean.
