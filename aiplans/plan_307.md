# Plan 307 — `set_burg_group_default` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ 0c81858` (plan-307 branch base):

```
Checked 712 files in 555ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info come from pre-existing
`lint/performance/noDynamicNamespaceImportAccess` notices in
`src/renderers/draw-heightmap.ts` (lines 34 and 64). They are not in
any file we will touch. This is the baseline that the
post-implementation lint must match.

## Use case

The Burg Groups Editor (`public/modules/ui/burg-group-editor.js`)
renders one `<input type="radio" name="isDefault">` per row. Because
all radios in the form share the same `name`, browser semantics
guarantee "exactly one is checked" within the form — flipping one
radio on automatically clears the others. The legacy submit path
relies on this and validates "at least one default" on the form:

```js
// createLine HTML:
<td><input type="radio" name="isDefault" ${group.isDefault && "checked"}></td>

// validateForm():
const checked = Array.from(form.isDefault).map(input => input.checked);
form.isDefault[0].setCustomValidity(checked.includes(true) ? "" : "At least one group should be default");
```

After Apply, the editor writes the entire array back to localStorage
under the key `"burg-groups"`:

```js
localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups));
```

Today the AI has `list_burg_groups` (plan 289) and `set_burg_group_active`
(plan 306, parallel work). It has no way to set the default fallback
group. This plan adds `set_burg_group_default`, which:

1. Sets `isDefault: true` on a named group, and
2. Sets `isDefault: false` on every other group in the array
   (replicating the radio-button "exactly one checked" semantic).

It also self-heals anomalous input where multiple groups had
`isDefault: true` — it always leaves exactly one `true` after the
call, regardless of starting state.

## Tool name

`set_burg_group_default`

## Inputs

- `name` (string, required) — the burg group's `name` field. Exact,
  case-sensitive match. Mirrors `list_burg_groups`'s `name` output.

## Behavior

1. Validate `name`:
   - Missing or `undefined` → error.
   - Not a string → error.
   - Empty after trim → error.
   - We DO NOT trim before lookup; the editor stores names as-is, and
     the rest of the AI surface (e.g. `set_burg_group`) treats group
     names as case-insensitive but here we choose **case-sensitive
     exact match** because:
     - The legacy editor's radio is keyed by row, not name; the AI
       contract is "exact name", same as `list_burg_groups`'s output.
     - Case-insensitive matching could surprise callers if two groups
       differ only in casing.

2. Read the groups array via `runtime.getGroups()`:
   - If absent or not an array → error
     `"options.burgs.groups is missing or not an array."`.

3. Find the named group:
   - If not found → error `"Burg group <name> not found."`. Array
     not modified.

4. Detect previous default state:
   - Scan the array, collect names where `isDefault === true`.
   - `previous_default` =
     - `null` if zero,
     - the single name if exactly one,
     - the array of names if more than one (anomalous input — we
       still self-heal).

5. Detect strict no-op:
   - If the named group is already `isDefault === true` AND every
     other group is `isDefault === false` (i.e. the input is in the
     desired exactly-one state already), return `changed: false`,
     `persisted` omitted, no `runtime.persist()` call.

6. Otherwise mutate in place:
   - For every group in the array:
     - If `group.name === name` → set `group.isDefault = true`.
     - Else → set `group.isDefault = false`.
   - Note: we use strict-equal name comparison; groups whose `name`
     field is missing or non-string just have their `isDefault`
     forced to `false` (correct — they aren't the named group).

7. Persist via `runtime.persist(groups)`:
   - On success → `persisted: true`.
   - If `runtime.persist` throws (e.g. localStorage unavailable in
     SSR / private mode) → `persisted: false` and a `note` field
     explaining the soft-fail. The mutation has already happened in
     memory, so the in-process state is correct.

8. Return ok with `{ ok, name, previous_default, changed, persisted?,
   note? }`.

## Inputs/Outputs

```
input_schema:
{
  type: "object",
  properties: {
    name: { type: "string", description: "..." }
  },
  required: ["name"]
}
```

Successful mutation:
```
{
  "ok": true,
  "name": "<name>",
  "previous_default": "<name>" | null | ["<n1>","<n2>",...],
  "changed": true,
  "persisted": true
}
```

Strict no-op:
```
{
  "ok": true,
  "name": "<name>",
  "previous_default": "<name>",
  "changed": false
}
```

Soft-fail persist (localStorage unavailable):
```
{
  "ok": true,
  "name": "<name>",
  "previous_default": ...,
  "changed": true,
  "persisted": false,
  "note": "localStorage unavailable; in-memory groups updated but not persisted."
}
```

## Validation / error catalog

- `name` missing / not string / empty after trim →
  `"name must be a non-empty string."` (singular message; we don't
  distinguish missing vs empty vs wrong type — same as the
  burg-population convention).
- `options.burgs.groups` missing or non-array →
  `"options.burgs.groups is missing or not an array."` (matches the
  list-burg-groups error verbatim).
- Group not found → `"Burg group <JSON.stringify(name)> not found."`.

## Files to add

- `src/ai/tools/set-burg-group-default.ts` — tool implementation.
- `src/ai/tools/set-burg-group-default.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Add
    `import { setBurgGroupDefaultTool } from "./tools/set-burg-group-default";`
    in the alphabetical `setBurg*` import block.
  - Add an export block
    `export { createSetBurgGroupDefaultTool, setBurgGroupDefaultTool, ... } from "./tools/set-burg-group-default";`
    near the `setBurgGroupTool` export block.
  - Add `registry.register(setBurgGroupDefaultTool);` in the
    registration list.

## Runtime-injection seam

```ts
import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SetBurgGroupDefaultGroup {
  name?: unknown;
  isDefault?: unknown;
  // Other fields exist (active, order, etc.) but we don't read them.
  [key: string]: unknown;
}

export interface SetBurgGroupDefaultRuntime {
  getGroups(): SetBurgGroupDefaultGroup[] | undefined;
  persist(groups: SetBurgGroupDefaultGroup[]): void;
}

interface BurgGroupsOptionsLike {
  burgs?: { groups?: unknown };
}

export const defaultSetBurgGroupDefaultRuntime: SetBurgGroupDefaultRuntime = {
  getGroups() {
    const options = getGlobal<BurgGroupsOptionsLike>("options");
    const groups = options?.burgs?.groups;
    return Array.isArray(groups) ? (groups as SetBurgGroupDefaultGroup[]) : undefined;
  },
  persist(groups) {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) {
      throw new Error("localStorage is not available.");
    }
    storage.setItem("burg-groups", JSON.stringify(groups));
  },
};

export function createSetBurgGroupDefaultTool(
  runtime: SetBurgGroupDefaultRuntime = defaultSetBurgGroupDefaultRuntime,
): Tool { ... }

export const setBurgGroupDefaultTool = createSetBurgGroupDefaultTool();
```

The runtime returns the **live array reference** — mutation happens
in place, just like the editor's submit path mutates
`options.burgs.groups[i].isDefault` directly.

## Self-heal multiple-default input — design

The exactly-one invariant is enforced by the editor's HTML radio
behaviour. But `options.burgs.groups` is just a plain array, and:
- A previous tool call that wrote `isDefault: true` without clearing
  others could leave it inconsistent.
- A loaded `.map` file from an older / hand-edited save could carry
  multiple `isDefault: true` rows.
- A buggy custom edit could leave zero rows with `isDefault: true`.

This tool **does not validate** the input invariant — it
unconditionally re-establishes "exactly one default = the named
group". The `previous_default` field in the response surfaces what we
found:
- `null` → nobody was default
- a single string → exactly one (the normal case)
- an array → multiple (anomalous, was self-healed)

In all three "multi or anomalous" cases, `changed` is true (we
modified at least one record's `isDefault` to clean up the array).

The strict no-op (`changed: false`) only fires when the array was
already in the desired exactly-one state with the correct name.

## Tests

Unit / mocked-runtime (Vitest):

1. **Happy path**: 3 groups `[A, B, C(default)]` → set "A" default →
   - A.isDefault=true, B.isDefault=false, C.isDefault=false
   - returned `previous_default: "C"`, `changed: true`, `persisted: true`
   - `persist` called once with the post-mutation array
2. **No-op**: 3 groups, only A.isDefault=true; call set_default("A")
   - no field changed
   - returned `changed: false`, `persisted` omitted
   - `persist` NOT called
3. **Self-heal multiple defaults**: A.isDefault=true, C.isDefault=true,
   call set_default("A")
   - A.isDefault=true, C.isDefault=false
   - returned `previous_default: ["A", "C"]`, `changed: true`,
     `persisted: true`
4. **No prior default**: nobody isDefault → set_default("B")
   - B.isDefault=true; A,C remain false
   - returned `previous_default: null`, `changed: true`
5. **Group not found**: groups [A, B], set_default("Z")
   - error `Burg group "Z" not found.`
   - array untouched (verified by snapshot of pre/post)
   - `persist` NOT called
6. **Groups array missing**: `getGroups()` returns undefined → error
   `options.burgs.groups is missing or not an array.`
7. **Groups array not array**: `getGroups()` returns object →
   currently the runtime's `Array.isArray` check converts that to
   undefined, so this falls under the "missing" case. We test it via
   the default runtime by setting `options.burgs.groups = {}`.
8. **Missing input**: `execute({})` → error `name must be a non-empty
   string.`
9. **Wrong-type input**: `execute({ name: 42 })` → same error.
10. **Empty-string / whitespace-only input**: `execute({ name: "" })`
    and `execute({ name: "   " })` → same error. (`name.trim()` for
    the validity check, but we still pass the original (untrimmed)
    name forward — though this only matters if we accepted it; we
    don't.)
11. **localStorage unavailable**: `runtime.persist` throws → success
    return with `persisted: false`, `note` set; the in-memory array
    is still mutated.
12. **Tool name + registry round-trip**: name is
    `set_burg_group_default`; registry.run path works end-to-end.

Default-runtime smoke (using `globalThis.options` and
`globalThis.localStorage` mocks):

13. **Default runtime reads window.options.burgs.groups**: stub
    options + a fake `localStorage` with `setItem` spy → call →
    verify `setItem("burg-groups", JSON.stringify(...))` invoked
    with the expected payload.
14. **Default runtime errors when options.burgs.groups missing**:
    set `options = {}` → error.
15. **Default runtime soft-fails when localStorage absent**:
    delete `localStorage` → mutation still happens in memory but
    `persisted: false`.

## Self-review checklist

- [ ] tool name exactly `set_burg_group_default`.
- [ ] inputs: `name` only, required, string.
- [ ] previous_default: null | string | string[].
- [ ] changed false only on strict no-op (already exactly the named
  group is default).
- [ ] self-heals multiple-default input (the "anomalous input"
  case).
- [ ] persists via `localStorage.setItem("burg-groups", JSON.stringify(...))`
  matching editor key.
- [ ] localStorage unavailable → success with `persisted: false`,
  not error.
- [ ] runtime seam is `getGroups()` + `persist()` — same shape as the
  set_burg_group_active reference (per prompt).
- [ ] `defaultSetBurgGroupDefaultRuntime` reads `globalThis.options`
  via `getGlobal`.
- [ ] no extra unrelated edits.
- [ ] tests cover all error/success paths and the registry round-trip.
- [ ] commit message: `feat(ai): add set_burg_group_default tool`.

### Self-review notes (post-edit pass)

Re-read after implementation:

- Biome reformatted the long description string from double-quoted
  with escaped inner doubles to single-quoted (the SVG snippet
  `<input type="radio" ...>` reads more naturally that way). Same
  effect, no behaviour change.
- The strict no-op condition collapses to a single check: "did the
  array's `isDefault` flags differ from desired after the rewrite?".
  `applyDefault` returns `changed: false` only when every group
  already had the right value — both for the named group (true) and
  for every other group (false). That's exactly the intended
  semantics. No separate "everyone already false" branch is needed.
- The `previous_default` field is computed BEFORE we mutate, so
  reporting "single name" / "array of names" reflects the pre-call
  state even when the named group itself was the previous default.
- Truly anomalous data (e.g. `groups[0].isDefault = "yes"`) is
  normalized to a real boolean by `applyDefault` (we use strict-equal
  checks), and `findPreviousDefault` ignores anything that isn't
  exactly `=== true`. Test coverage verifies this.
- Persist note format: `"Persist failed: <error message>"`. The test
  asserts the note matches `/localStorage/` (when localStorage was
  the cause) and `/raw string failure/` (when a non-Error throwable
  was thrown). Both pass.
- The default runtime's `localStorage` access is via
  `(globalThis as { localStorage?: Storage }).localStorage` — same
  shape as `set-onload-behavior.ts`. SSR / Node test environments
  typically don't have `globalThis.localStorage`, so the
  "soft-fail" test path validates real-world behaviour, not just a
  mocked throw.
- Final lint after biome autofix: same 7 warnings + 1 info as
  baseline. tsc clean. 29 new tests passing.
