# Plan 295: `remove_lake_group` AI chat tool

## Use case

Add a new write-side AI chat tool, `remove_lake_group`, that deletes a
custom lake group and reassigns every lake in it back to `freshwater` —
mirroring the user-facing `removeLakeGroup` function in
`public/modules/ui/lakes-editor.js`.

The Edit Lake dialog lets the user delete a custom lake group with one
click; the AI chat currently has no equivalent. This is the lake
equivalent of the just-merged `remove_route_group` tool (plan 287).

## Behaviour to mirror

From `public/modules/ui/lakes-editor.js`:

```js
function removeLakeGroup() {
  const group = elSelected.node().parentNode.id;
  if (["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"].includes(group)) {
    tip("This is one of the default groups, it cannot be removed", false, "error");
    return;
  }

  // ... confirmation dialog ...
  const freshwater = byId("freshwater");
  const groupEl = byId(group);
  while (groupEl.childNodes.length) {
    freshwater.appendChild(groupEl.childNodes[0]);
  }
  groupEl.remove();
  byId("lakeGroup").selectedOptions[0].remove();
  byId("lakeGroup").value = "freshwater";
}
```

The tool must:

1. Take a single input: `group` (string) — the lake-group SVG id.
2. Reject default group ids (the literal list in the UI) — see
   "Default groups" below.
3. Validate that a `<g>` element with that id exists as a direct child
   of `#lakes`, and that `<g id="freshwater">` also exists. If either is
   missing, return an error result without mutating anything.
4. **Update `pack.features` first**: for every entry whose
   `feature.type === "lake"`, `feature.group === group`, and that is
   NOT removed (`feature.removed !== true`), set
   `feature.group = "freshwater"`. This is the **legacy-bug fix**: the
   UI only re-parents the SVG nodes and never updates `pack.features`,
   so after a UI-driven removal the data and DOM disagree. The tool
   keeps them in sync.
5. Move every direct child of `<g id={group}>` to `<g id="freshwater">`
   via `appendChild` (DOM `appendChild` moves nodes — the legacy
   `while (groupEl.childNodes.length) freshwater.appendChild(...)`
   pattern is preserved 1:1).
6. Remove the now-empty `<g id={group}>` element.
7. Best-effort dropdown cleanup: if the editor's `<select id="lakeGroup">`
   exists in the DOM, remove the matching `<option value={group}>` from
   it. Absence does NOT fail the call (the dropdown only exists while
   the editor dialog is open, and tools run non-interactively).
8. Return `okResult({ group, reassigned_count, svg_children_moved })`.

The UI's `confirmationDialog` is skipped — every other AI write tool
runs non-interactively (`remove_route`, `remove_route_group`,
`remove_state`, etc.).

### Legacy bug

`removeLakeGroup` only re-parents the SVG `<use>` nodes; it does NOT
update `pack.features[i].group` to `"freshwater"` for the moved lakes.
Our tool fixes this by updating `pack.features` before the DOM move,
so subsequent reads (e.g. via `list_lake_groups`, `set_lake_group`,
serialization) see the correct group. The legacy UI bug is documented
here and not addressed in `lakes-editor.js` (out of scope).

## Default groups

Hard-coded in the UI as
`["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"]`.

`list-lake-groups.ts` already exports this exact constant as
`DEFAULT_LAKE_GROUPS` (re-exported from `src/ai/index.ts`). We **import
that constant** rather than redefining it. Single source of truth.

## Files

- `src/ai/tools/remove-lake-group.ts` — new tool. Modelled after
  `remove-route-group.ts` (the route-side analogue) and
  `set-lake-group.ts` (which touches both `pack.features` lake entries
  and the `#lakes` SVG sub-tree).
- `src/ai/tools/remove-lake-group.test.ts` — new tests (see below).
- `src/ai/index.ts` — alphabetical import, barrel re-export, registry
  registration (insert next to `removeRouteGroupTool` /
  `setLakeGroupTool` / `listLakeGroupsTool`).

## Runtime injection seam

To stay consistent with `set-lake-group.ts` and `remove-route-group.ts`:

```ts
export interface RemoveLakeGroupRuntime {
  /** Returns true when an SVG <g id={group}> exists as a direct child of #lakes. */
  groupExists(group: string): boolean;
  /** Returns true when an SVG <g id="freshwater"> exists as a direct child of #lakes. */
  freshwaterExists(): boolean;
  /**
   * Walk pack.features and set feature.group = "freshwater" for every
   * lake whose feature.group === group and feature.removed !== true.
   * Returns the count of features changed. When pack.features is
   * unavailable, throws (the tool errors out).
   */
  reassignFeaturesToFreshwater(group: string): number;
  /**
   * Move every direct child of <g id={group}> into <g id="freshwater">
   * and then remove the now-empty <g id={group}>. Returns the count of
   * DOM nodes moved. Throws when either group element is missing.
   */
  moveChildrenAndRemoveGroup(group: string): number;
  /**
   * Best-effort: remove the <option value={group}> entry from the
   * editor's <select id="lakeGroup"> if the dropdown exists. Returns
   * true when an option was removed; false when the dropdown or option
   * is absent. Never throws.
   */
  removeDropdownOption(group: string): boolean;
}

export const defaultRemoveLakeGroupRuntime: RemoveLakeGroupRuntime = { ... };
export function createRemoveLakeGroupTool(runtime?): Tool { ... }
export const removeLakeGroupTool = createRemoveLakeGroupTool();
```

`defaultRemoveLakeGroupRuntime`:

- `groupExists(group)`: walks `document.getElementById("lakes")`'s
  direct children and returns `true` when one is a `<g>` with
  `id === group`. Falls back to `null`-safe checks; treats missing
  `document` as "no".
- `freshwaterExists()`: same shape, but checks for the `freshwater` id.
- `reassignFeaturesToFreshwater(group)`: reads `window.pack`, iterates
  `pack.features` from index 1 (slot 0 is the placeholder), changes
  `feature.group` to `"freshwater"` for matching lakes, returns the
  changed count. Throws `Error("pack.features is not available.")`
  when `pack` or `pack.features` is missing — the tool surfaces this
  as an error (we choose error-out over best-effort to keep data and
  DOM in sync; documented in this plan).
- `moveChildrenAndRemoveGroup(group)`: looks up `#lakes`,
  `#{group}`, `#freshwater`, repeatedly `appendChild`-moves
  `groupEl.firstChild` (more correct than `childNodes[0]` — but the
  UI uses the latter; both produce identical results in this DOM
  context, so we use `firstChild` for clarity). Counts moves, removes
  the empty group. Throws when either element is missing.
- `removeDropdownOption(group)`: looks up `<select id="lakeGroup">`;
  if absent, returns `false`. Otherwise iterates its `options` and
  removes the first whose `value === group`. Catches and swallows any
  unexpected throw — best-effort only.

## Validation rules

- `input.group` must be a non-empty trimmed string. `null`, `undefined`,
  numbers, empty / whitespace-only strings → `errorResult`.
- `input.group` must NOT be in `DEFAULT_LAKE_GROUPS`. If it is, return
  `errorResult("Default lake group ... cannot be removed.")` without
  mutating anything.
- `runtime.groupExists(group)` must be `true`. Else error.
- `runtime.freshwaterExists()` must be `true`. Else error.
- `runtime.reassignFeaturesToFreshwater` may throw if pack data is
  unavailable; that's surfaced as `errorResult`. **Decision**: we
  error out rather than best-effort-with-note, per the prompt's
  recommendation. Rationale: the legacy bug was caused by the data
  layer being skipped, so the AI tool keeps the data path mandatory.

## Result shape

```
okResult({
  group: <string>,                  // group id, echoed back (trimmed)
  reassigned_count: <number>,       // pack.features entries changed
  svg_children_moved: <number>,     // DOM nodes moved into <g id="freshwater">
})
```

## Order of operations

1. Validate input.
2. Reject default groups.
3. Confirm `#${group}` and `#freshwater` exist (read-only checks).
4. Re-parent + reassign:
   1. Update `pack.features`. (Fail closed if missing.)
   2. Move SVG children + remove empty group.
   3. Best-effort drop the dropdown option.
5. Return counts.

If step 4.1 throws, no DOM mutation has happened yet — pack and DOM
remain consistent (both unchanged). If step 4.2 throws after 4.1
succeeds, pack data has been changed but the DOM hasn't moved; this is
the same partial-failure window as `set_lake_group` and is acceptable
because both `groupExists` checks have already passed in step 3.

## Test strategy

`src/ai/tools/remove-lake-group.test.ts` mirrors
`remove-route-group.test.ts` / `set-lake-group.test.ts`:

Tool-level (with a fake runtime):

- **Tool metadata**: name `remove_lake_group`, schema requires `group`.
  `createRemoveLakeGroupTool()` produces an equivalent `Tool`.
- **Default-list constant**: imported from `./list-lake-groups`; sanity
  check that all six entries are rejected.
- **Happy path** (custom group `"acidic"` with two lakes):
  `reassignFeaturesToFreshwater` returns 2 and is called with `"acidic"`;
  `moveChildrenAndRemoveGroup` returns 2; `removeDropdownOption` is
  called; result `ok` with `reassigned_count: 2,
  svg_children_moved: 2`.
- **Each default group** (`freshwater`, `salt`, `sinkhole`, `frozen`,
  `lava`, `dry`) → error; nothing else on the runtime is called.
- **Unknown custom group**: `groupExists` returns `false` → error;
  `freshwaterExists`, `reassignFeaturesToFreshwater`,
  `moveChildrenAndRemoveGroup`, `removeDropdownOption` are NOT called.
- **`#freshwater` missing**: `freshwaterExists` returns `false` → error;
  no mutations.
- **Empty custom group**: counts are both 0; SVG element still removed;
  result `ok`.
- **Invalid input**: `null`, `undefined`, numbers, empty / whitespace
  strings → error, no runtime calls.
- **`reassignFeaturesToFreshwater` throws**: surfaced as error;
  `moveChildrenAndRemoveGroup` and `removeDropdownOption` are NOT
  called.
- **Trims surrounding whitespace** before comparing against defaults
  and forwarding to runtime.
- **Dropdown option is best-effort**: when `removeDropdownOption`
  returns `false` (e.g. dropdown not open), the result is still `ok`.
- **Tool name + registry round-trip**: confirm
  `removeLakeGroupTool.name === "remove_lake_group"`.

`defaultRemoveLakeGroupRuntime` (integration with `globalThis.pack` and
`globalThis.document` patched):

- Builds a real `<svg>` tree using `jsdom`-ish stubs (`document` is
  available in the test env). The structure:
  ```
  <svg>
    <g id="lakes">
      <g id="freshwater"><use id="lake_5" data-f="5"/></g>
      <g id="acidic">
        <use id="lake_7" data-f="7"/>
        <use id="lake_9" data-f="9"/>
      </g>
    </g>
    <select id="lakeGroup">
      <option value="freshwater">Freshwater</option>
      <option value="acidic" selected>Acidic</option>
    </select>
  </svg>
  ```
- Patches `globalThis.pack = { features: [0, ..., {i:7, type:"lake",
  group:"acidic"}, ..., {i:9, type:"lake", group:"acidic"},
  {i:11, type:"lake", group:"acidic", removed:true}, ...] }`.
- After invocation:
  - `pack.features[7].group === "freshwater"`
  - `pack.features[9].group === "freshwater"`
  - `pack.features[11].group === "acidic"` (removed lakes are skipped).
  - `<g id="acidic">` is gone.
  - `<g id="freshwater">` now contains all three `<use>` elements.
  - `<option value="acidic">` is gone from the `<select>`.
  - Result: `reassigned_count: 2`, `svg_children_moved: 2`.
- Verifies error path when `<g id="freshwater">` is missing
  (`freshwaterExists` returns false).
- Verifies error path when `pack.features` is missing.
- Verifies absence of `<select id="lakeGroup">` does NOT fail the call.

## Lint baseline

`npm run lint` BEFORE any changes:

```
Checked 688 files in 527ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(0 errors, 7 warnings, 1 info — pre-existing in `src/renderers/draw-heightmap.ts` and a few other legacy-shape files.)

## Review

- **Tasks → Plan**: tasks 1–8 cover (1) re-confirming sibling patterns,
  (2) creating the tool, (3) creating tests, (4) wiring into
  `src/ai/index.ts`, (5) verifying tsc/tests/lint, (6) committing.
  Each maps directly to a section of this plan.
- **Plan → Use case**: the use case requires (a) reassigning lakes in a
  group to `freshwater` in BOTH the data and the DOM, (b) refusing
  defaults, (c) refusing unknown groups, (d) refusing when freshwater
  is missing, (e) reporting structured counts, (f) cleaning the
  dropdown best-effort. The plan's runtime seam (`groupExists` /
  `freshwaterExists` / `reassignFeaturesToFreshwater` /
  `moveChildrenAndRemoveGroup` / `removeDropdownOption`) and
  `okResult({ group, reassigned_count, svg_children_moved })` directly
  cover all of those.
- **Tests → Use case**: each clause maps to a test —
  default-rejection → "default group rejection", reassign + DOM move →
  "happy path", unknown-id → "no `<g>` ⇒ error", missing freshwater →
  "freshwaterExists false ⇒ error", structured counts → asserted in
  every happy-path case, dropdown cleanup → "absence doesn't fail",
  legacy-bug fix → "pack.features[i].group becomes 'freshwater'" in
  the integration block.
- **Legacy-bug-fix decision**: documented above. We chose error-out
  (not best-effort-with-note) for missing `pack.features`, so we never
  end up with the same UI-only mutation the legacy bug produced.
- **`DEFAULT_LAKE_GROUPS` source**: imported from `./list-lake-groups`
  (already a single-source-of-truth constant). No redefinition.
- **Order of operations**: confirmed pack-update → DOM move → dropdown.
  Pre-flight checks (`groupExists` + `freshwaterExists`) make
  partial-failure unlikely; documented above.
