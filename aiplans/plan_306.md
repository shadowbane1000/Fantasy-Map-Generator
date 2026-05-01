# Plan 306 — `set_burg_group_active` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ 0c81858` (plan-306 branch base):

```
Checked 712 files in 561ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info are pre-existing
`lint/performance/noDynamicNamespaceImportAccess` notices in
`src/renderers/draw-heightmap.ts` (lines 34 and 64). Not in any file
this plan touches. Post-implementation lint must match this exactly.

## Use case

The Burg Groups Editor (`public/modules/ui/burg-group-editor.js`)
includes a per-row "Activate/deactivate group" checkbox bound to
`group.active`:

```js
// from createLine()
<td data-tip="Activate/deactivate group"><input type="checkbox" name="active" class="native" ${group.active && "checked"} /></td>
```

…and a form-level invariant that fires when the user clicks Apply:

```js
// from validateForm()
if (form.active.length) {
  const active = Array.from(form.active).map(input => input.checked);
  form.active[0].setCustomValidity(active.includes(true) ? "" : "At least one group should be active");
  form.active[0].reportValidity();
} else {
  const active = form.active.checked;
  form.active.setCustomValidity(active ? "" : "At least one group should be active");
  form.active.reportValidity();
}
```

After Apply, the editor rewrites `options.burgs.groups` and calls
`localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))`.

The AI today has `list_burg_groups` (read-only, plan 289) but no
setter for the active flag. This plan adds `set_burg_group_active`,
which mirrors the user-flow of "open Configure Burg groups → toggle the
'Activate/deactivate group' checkbox on a single row → click Apply" for
that one group.

### Why only `active` and not the whole group config?

The legacy "Apply" button rewrites the entire group config (every
column the editor exposes). Mirroring that surface in one tool would be
sprawling and error-prone. We split per-field setters so the AI can
target one column at a time. `set_burg_group_active` is the first such
setter; future plans can add `set_burg_group_default`, etc.

### Why we do NOT migrate burgs

In the legacy Apply flow, after rewriting `options.burgs.groups`, the
editor does:

```js
const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
const populations = validBurgs.map(b => b.population).sort((a, b) => a - b);
validBurgs.forEach(burg => Burgs.defineGroup(burg, populations));
```

This `Burgs.defineGroup` step re-assigns each burg to the best-fitting
*active* group based on filters (biomes/states/cultures/religions/
percentile/min/max). Toggling `active` from true→false on a group can
therefore reshuffle the membership of `pack.burgs[i].group`.

We do **not** replicate that step in `set_burg_group_active`:

1. `Burgs.defineGroup` lives in legacy JS, isn't easily callable from
   our test environment, and depends on globals we can't safely mock.
2. The AI's read-side `list_burg_groups` derives `burg_count` purely
   from the *current* `pack.burgs[i].group` strings, so a stale group
   string just means burgs stay in their current group until a future
   regenerate or burg-edit. That's the same behavior you'd get if you
   manually edited `localStorage` — no data corruption, just unexpired
   stale memberships.
3. The user-visible side-effect (re-binning) requires running renderers
   (`drawBurgIcons`, `drawBurgLabels`) which we already skip in other
   AI tools.

The tool description will note that toggling `active` does NOT migrate
burgs the way the legacy Apply button does.

## Tool name

`set_burg_group_active`

## Inputs

- `name` (string, required) — exact case-sensitive `name` of the group
  in `options.burgs.groups`.
- `active` (boolean, required) — the new value of `group.active`.

No nullable / optional / coercion behavior on either input. Wrong type
or missing → error.

## Behavior

1. Validate `name` is a non-empty string. Otherwise → error
   "name must be a non-empty string."
2. Validate `active` is a boolean. Otherwise → error
   "active must be a boolean."
3. Read `options.burgs.groups`. If missing or not an array → error
   "options.burgs.groups is missing or not an array."
4. Find the group whose `name === input.name`. If none → error
   `No burg group found with name <quoted-name>.`
5. Capture `oldActive = group.active === true` (strict comparison;
   missing/truthy-non-bool counts as `false`, matching `list_burg_groups`).
6. **No-op short-circuit**: if `oldActive === input.active`, return
   ok with `changed: false`, `old_active`, `new_active`. Do NOT
   write to `localStorage`. Do NOT mutate the group object.
7. **Last-active rule** — only when `input.active === false`: count
   how many *other* groups are currently `active === true`. If zero,
   error: "Cannot deactivate the last active group."
8. Mutate `group.active = input.active`.
9. Persist: best-effort
   `localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups))`.
   Catch any thrown error (storage quota, security exception,
   localStorage undefined). On success, `persisted: true`. On caught
   failure, `persisted: false` and a `note` describing skip reason.
10. Return ok with
    `{ ok: true, name, old_active, new_active, changed: true, persisted, note? }`.

## Inputs/Outputs

```
input_schema:
{
  type: "object",
  properties: {
    name: { type: "string", description: "Exact case-sensitive group name" },
    active: { type: "boolean", description: "New active flag value" }
  },
  required: ["name", "active"]
}
```

Successful response (JSON content, `isError` falsy):
```
{
  "ok": true,
  "name": "<name>",
  "old_active": <bool>,
  "new_active": <bool>,
  "changed": <bool>,
  "persisted": <bool>,        // omitted when changed=false
  "note": "<string>"          // optional (only when localStorage skipped)
}
```

## Validation / error catalog

- `name` not a string OR empty after String() check → "name must be a non-empty string."
- `active` not strictly boolean → "active must be a boolean."
- `options.burgs.groups` missing/non-array → "options.burgs.groups is missing or not an array."
- No matching `name` → `No burg group found with name "<name>".`
- Deactivating the last active group → "Cannot deactivate the last active group."

## Files to add

- `src/ai/tools/set-burg-group-active.ts` — tool implementation.
- `src/ai/tools/set-burg-group-active.test.ts` — Vitest unit tests.

## Files to edit

- `src/ai/index.ts`:
  - Add `import { setBurgGroupActiveTool } from "./tools/set-burg-group-active";`
    near `setBurgGroupTool`.
  - Add an `export { createSetBurgGroupActiveTool, setBurgGroupActiveTool }
    from "./tools/set-burg-group-active";` block near the other
    burg-group exports.
  - Add `registry.register(setBurgGroupActiveTool);` adjacent to
    `registry.register(setBurgGroupTool);`.

## Runtime-injection seam

```ts
export interface SetBurgGroupActiveRuntime {
  // Returns the live array (or undefined/non-array on missing).
  // Implementations mutate it in place.
  getGroups(): unknown;
  // Best-effort persistence; returns true on success, false if storage skipped.
  // Default impl swallows exceptions (returns false).
  persist(groups: unknown[]): boolean;
}

export const defaultSetBurgGroupActiveRuntime: SetBurgGroupActiveRuntime = {
  getGroups() {
    const options = getGlobal<{ burgs?: { groups?: unknown } }>("options");
    return options?.burgs?.groups;
  },
  persist(groups) {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (!ls) return false;
      ls.setItem("burg-groups", JSON.stringify(groups));
      return true;
    } catch {
      return false;
    }
  },
};

export function createSetBurgGroupActiveTool(
  runtime: SetBurgGroupActiveRuntime = defaultSetBurgGroupActiveRuntime,
): Tool { ... }

export const setBurgGroupActiveTool = createSetBurgGroupActiveTool();
```

The default `getGroups()` implementation reads from `window.options`
through the existing `getGlobal` helper — same pattern used in
`list-burg-groups.ts`.

The mutation is in-place: `getGroups()` returns the live array, the
tool finds the matching entry and writes `group.active = next`, then
the tool calls `runtime.persist(groups)` once.

## Tests (Vitest)

Mocked-runtime tests:
- Happy path (3-group fixture, all active, deactivate one) → array
  mutated in place to `[true, false, true]`; `persist` called once
  with the live array; result has `changed: true, persisted: true,
  old_active: true, new_active: false`.
- No-op true→true: `changed: false`; `persist` NOT called; group
  array unchanged; `persisted` field omitted from result.
- No-op false→false (group with `active: false` set to false):
  `changed: false`; `persist` NOT called.
- Last-active rule: single-group all-active fixture → setting that
  group inactive errors with "Cannot deactivate the last active group.";
  `persist` NOT called; group not mutated.
- Last-active rule with one already-inactive group present:
  `[active:true, active:false]`, deactivate the active one → errors;
  `persist` NOT called.
- Deactivating one of multiple active is fine:
  `[true, true, true]` → deactivate first → succeeds.
- Activating a previously-inactive group always succeeds (no rule):
  `[true, false]` → activate the false one → succeeds; new state
  `[true, true]`.
- Activating when ALL are currently inactive (degenerate state) is
  fine — last-active rule only fires on deactivation.
- `name` not found → error
  `No burg group found with name "missing".`; `persist` NOT called.
- `name` empty string → error "name must be a non-empty string."
- `name` missing → same error.
- `name` non-string (number, object, null) → same error.
- `active` missing → "active must be a boolean."
- `active` non-boolean (string "true", 1, null) → same error.
- `options.burgs.groups` missing → "options.burgs.groups is missing or not an array."
- `options.burgs.groups` not array (object, string) → same error.
- Persist failure: stub `runtime.persist` to return false →
  result has `persisted: false`, `note` mentions storage skipped;
  the group mutation still applied.
- Persist throw: stub throws → caught; treated like return-false.
- Group with missing `active` field → treated as `false`; activating
  succeeds (`old_active: false, new_active: true`).
- Group with truthy non-boolean `active` (e.g. `1`) → treated as
  `false` per the strict-equal rule used by `list_burg_groups`.

Default-runtime tests (touch `globalThis`):
- Stub `globalThis.options = { burgs: { groups: [...] } }` and
  `globalThis.localStorage = mockStorage`. Run via the default tool;
  verify the mutation lands on `globalThis.options.burgs.groups` and
  `mockStorage.getItem("burg-groups")` returns the serialized array.
- Stub `globalThis.localStorage = undefined` → tool still succeeds;
  result has `persisted: false`.
- Stub `localStorage.setItem` to throw a quota exception →
  `persisted: false`, mutation still applied.

Tool registration:
- `setBurgGroupActiveTool.name === "set_burg_group_active"`.
- `ToolRegistry` round-trip via `registry.run("set_burg_group_active",
  { name, active })`.

## Self-review checklist

- [ ] use case mirrors the burg-group editor: rewrite
  `options.burgs.groups`, persist to `localStorage`.
- [ ] last-active validation matches editor's
  `setCustomValidity("At least one group should be active")` rule.
- [ ] runtime seam separates `getGroups` (read live array) from
  `persist` (best-effort write); both mockable.
- [ ] persist is BEST-EFFORT: never throws back to the caller; surfaces
  via `persisted: false` + `note`.
- [ ] no-op (current === requested) returns ok with `changed: false`
  and skips persistence.
- [ ] error catalog covers every input/state failure mode.
- [ ] tests cover happy paths, no-op, last-active rule (both edge
  cases), every input validation error, persist failure modes,
  default-runtime via globalThis, registry round-trip.
- [ ] only adds the two new files and edits `src/ai/index.ts`.

### Self-review notes (post-edit pass)

Re-read after writing:

- **No-op precedes last-active check.** Step 6 short-circuits before
  step 7. Concretely: if a caller asks to set an already-inactive
  group inactive (false→false), we return `changed: false` even if
  that group is the only inactive group, or in the degenerate case
  where the whole array has zero active groups. The last-active rule
  protects against the user *changing* state from active→inactive
  when no other active group exists; it does NOT police existing
  invariants. (The legacy editor's `setCustomValidity` likewise only
  fires on the user trying to Apply with all-unchecked.)
- **"Other groups" is what counts in step 7.** When the requested
  change is `active=false` for a currently-active group, a remaining
  active group must exist among the *other* entries. Implementation:
  iterate the array and count groups where `g !== target &&
  g?.active === true`. Equivalent: total active count > 1.
- **Strict-bool semantics on `group.active`.** Reading uses the same
  `g?.active === true` as `list_burg_groups`. So a stored
  `active: 1` (truthy non-bool) reads as `false`, and we never write
  that back — only canonical boolean values from the input.
- **`name` non-empty check** uses `.trim() !== ""` (or equivalent) so
  whitespace-only strings error. Comparison against `group.name` uses
  raw equality (`===`), case-sensitive — matching the legacy editor's
  uniqueness check (`names.has(name)` is set-based, also
  case-sensitive).
- **No-op result shape.** Per the prompt's contract, the no-op return
  has `changed: false` and omits the `persisted` field (we never
  attempted to write). This is documented in the output shape table.
- **Persistence catches Errors only at the boundary.** The default
  `persist()` wraps `localStorage.setItem` plus the JSON.stringify
  in a try/catch — `JSON.stringify` itself can throw (cycles), and
  `setItem` can throw (quota, security). Both produce
  `persisted: false`.
- **Mutation timing.** We mutate `group.active = next` BEFORE calling
  `persist()`, so the array passed to `JSON.stringify` already
  reflects the new state. If persist fails, the in-memory mutation
  remains — that matches the editor's "the in-memory `options.burgs.
  groups` is the source of truth; localStorage is best-effort
  cache".
