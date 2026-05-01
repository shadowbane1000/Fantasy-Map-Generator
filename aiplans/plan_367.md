# Plan 367 — `get_selected_entity` AI tool

## Use case

The Fantasy Map Generator tracks the user's "currently open" entity in
a single global D3 selection — `let elSelected;` declared at
`public/main.js:142`. Every editor opens by overwriting `elSelected`
with a `d3.select(...)` of the underlying SVG element. The element's
`id` (and sometimes `data-id` or `data-f`) encodes both the entity
type and the entity id.

Examples (verified by reading the editor sources):

- `editBurg(id)` (`public/modules/ui/burg-editor.js:9`) → `elSelected =
  burgLabels.select("[data-id='" + burg + "']")` — a `<text
  id="burgLabel{i}" data-id="{i}">` inside `#burgLabels`.
- `editLabel()` (`public/modules/ui/labels-editor.js:10`) →
  `elSelected = d3.select(text)` — a `<text id="...">` inside
  `#labels`. State labels have id `stateLabel{i}` (verified
  `labels-editor.js:319` slices by `"stateLabel"`); free labels have
  arbitrary ids issued by `getNextId("label")` from
  `src/utils/nodeUtils.ts:21` → `label{n}`.
- `editRiver(id)` (`public/modules/ui/rivers-editor.js:11`) →
  `d3.select("#" + id)` for `id = river{i}` (rivers-editor.js:53
  `+elSelected.attr("id").slice(5)`).
- `editLake()` (`public/modules/ui/lakes-editor.js:16`) → a `<use>`
  with `data-f="{featureId}"` (lakes-editor.js:37) inside `#lakes`.
  Path id is `feature_{i}`.
- `editRoute(id)` (`public/modules/ui/routes-editor.js:12`) →
  `d3.select("#" + id)` for `id = route{i}` (routes-editor.js:54).
- `editMarker(markerI)` (`public/modules/ui/markers-editor.js:9`) → a
  `<use id="marker{i}">` inside `#markers`.
- `editRegiment(selector)` (`public/modules/ui/regiment-editor.js:9`)
  → a `<g id="regiment{state}-{i}">` (verified
  `src/renderers/draw-military.ts:50,116`).
- `editIce(element)` (`public/modules/ui/ice-editor.js:9`) → an ice
  element with `data-id` (the `pack.ice` index).
- `editReliefIcon()` (`public/modules/ui/relief-editor.js:8`) → a
  `<use>` from `#terrain` group (relief icons have no
  per-entity id; we report `type: "relief"`).
- `editCoastline()` (`public/modules/ui/coastline-editor.js:17`) → a
  `<use data-f="{i}">` referencing `#feature_{i}` inside `#coastline`.

Layer-polygon ids that aren't currently set as `elSelected` by the
existing `clicked()` dispatch but are present in the SVG and may be
selected by future flows (handled defensively):

- `state{i}` (state region polygon, `getGappedFillPaths("state", ...)`
  in `public/modules/ui/layers.js:504`).
- `province{i}` (province region polygon,
  `getGappedFillPaths("province", ...)` in
  `public/modules/ui/layers.js:554`) and
  `provinceLabel{i}` (province label, layers.js:561).
- `culture{i}` (culture region polygon, layers.js:442) and
  `cultureCenter{i}` (culture-center marker,
  `public/modules/dynamic/editors/cultures-editor.js:563`).
- `religion{i}` (religion region polygon, layers.js:471) and
  `religionCenter{i}` (religion-center marker, by analogy with
  cultureCenter; supported by pattern-match even if not present).
- `zone{i}` (zone polygon, `drawZone` in layers.js:918).

The tool inspects `elSelected` once, derives `{type, id, name}` from
its underlying DOM node and parent group, and returns that. Pure
read — no mutation, no UI side effects.

## Lint baseline (before any changes)

`npm run lint` on plan-367 base (`master @ 9118fd3`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 837 files in 687ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

## DOM-shadow fix

`public/main.js:142` declares the global as:

```js
let elSelected;
```

Top-level `let` in a classic script does NOT attach to `globalThis`,
so a module-loaded AI tool calling `getGlobal("elSelected")` gets
`undefined`. Same fix pattern as plan 349 (`coastline`), plan 352
(`scaleBar` / `scale`), plan 365: change to `var`.

```js
var elSelected;
```

Confirmed there is no HTML element with `id="elSelected"` in
`src/index.html`, so DOM shadowing is not an issue here — the `var`
fix alone is sufficient.

The seam test in `src/ai/tools/_shared/global-exposure.test.ts` uses a
static regex over source files that recognises `var <name>` as an
exposure (line 103). After the `var` fix the new
`getGlobal("elSelected")` call in the tool will be detected as
exposed automatically. **No edit to KNOWN_EXPOSED / KNOWN_BROKEN is
required.**

## Tool name

`get_selected_entity`

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {},
  "required": []
}
```

No input. Always succeeds; the result shape varies.

## Behavior

1. Read `globalThis.elSelected` via the runtime seam.
2. If it's null / undefined / has no `node()` method, OR `node()`
   returns null / undefined, return
   `{ ok: true, type: null, message: "Nothing is currently selected." }`.
3. Read the DOM node's `id` and the parent's `id` (parent's id is
   useful for ambiguous matches — e.g. distinguishing
   `<use data-f="3">` inside `#coastline` from one inside `#lakes`).
4. Read `data-id` / `data-f` / `data-state` attributes too — those
   are the load-bearing identifiers for ice (`data-id`), lake/coast
   (`data-f`), regiment (`data-state` + `data-id`), and burg
   (`data-id`) selections.
5. Match against the id-pattern table (regex-driven). For matches
   return `{ ok: true, type, id, name, raw_id, parent_id }`.
6. For unrecognized id patterns AND no useful data-attributes, return
   `{ ok: true, type: "unknown", raw_id, parent_id }` rather than
   erroring — lets the AI reason about it.

### Id-pattern → entity-type table

The matcher tries these in order. First match wins.

| SVG id pattern             | parent id (hint)     | type       | id type     |
| -------------------------- | -------------------- | ---------- | ----------- |
| `burg{N}`                  | `burgIcons` / group  | `burg`     | number      |
| `anchor{N}`                | `anchors` / group    | `burg`     | number      |
| `burgLabel{N}`             | `burgLabels` / group | `burg`     | number      |
| `stateLabel{N}`            | `states` (in labels) | `state`    | number      |
| `state-border{N}`          | `statesHalo`         | `state`    | number      |
| `state-clip{N}`            | `statePaths`         | `state`    | number      |
| `state-gap{N}`             | `statesBody`         | `state`    | number      |
| `state{N}`                 | `statesBody`         | `state`    | number      |
| `province{N}`              | `provs/provincesBody`| `province` | number      |
| `provinceLabel{N}`         | `provinceLabels`     | `province` | number      |
| `culture{N}` or `cultureCenter{N}` | various      | `culture`  | number      |
| `religion{N}` or `religionCenter{N}` | various    | `religion` | number      |
| `marker{N}`                | `markers` / group    | `marker`   | number      |
| `route{N}`                 | `routes` / group     | `route`    | number      |
| `river{N}`                 | `rivers`             | `river`    | number      |
| `feature_{N}`              | `coastline` / `lakes`| `lake` if parent is `lakes`; else `feature` | number |
| `regiment{S}-{N}`          | `armies`             | `regiment` | `{state, i}` |
| `zone{N}`                  | `zones`              | `zone`     | number      |
| `label{N}` (free label)    | `addedLabels`        | `label`    | number      |
| (any other id) where parent is `lakes` AND `data-f` present  | -    | `lake`     | number from data-f |
| (any other id) where parent is `coastline` AND `data-f` present | - | `feature`  | number from data-f |
| (any id) where parent group is `terrain` (relief icons)      | -    | `relief`   | null (no per-icon id) |
| (any id) where parent group is `ice` AND `data-id` present    | -   | `ice`      | number from data-id |
| else                                                              | -    | `unknown`  | -      |

For label entities we further inspect: if the id starts with
`stateLabel`, type is `state`; if it starts with `provinceLabel`,
type is `province`; if it starts with `burgLabel`, type is `burg`;
else `label` (free text label).

### Name resolution

Names come from `pack`:

- `burg` → `pack.burgs[id]?.name ?? ""`
- `state` → `pack.states[id]?.name ?? ""`
- `province` → `pack.provinces[id]?.name ?? ""`
- `culture` → `pack.cultures[id]?.name ?? ""`
- `religion` → `pack.religions[id]?.name ?? ""`
- `route` → `pack.routes.find(r => r.i === id)?.name ?? ""`
- `river` → `pack.rivers.find(r => r.i === id)?.name ?? ""`
- `marker` → `pack.markers.find(m => m.i === id)?.type ?? ""` (markers
  have no `name`; `type` is the closest user-facing label)
- `lake` / `feature` → `pack.features[id]?.name ?? ""`
- `regiment` → `pack.states[state]?.military?.find(r => r.i === i)?.name ?? ""`
- `zone` → `pack.zones[idx]?.name ?? ""` where `idx` is the array
  index (zones use array index as `i`)
- `label` (free) → `elSelected.text()` — the displayed string
- `ice` / `relief` → `""`
- `unknown` → omitted

## Inputs / Outputs

Successful match:

```jsonc
{
  "ok": true,
  "type": "burg",
  "id": 17,
  "name": "Bree",
  "raw_id": "burg17",
  "parent_id": "burgIcons"
}
```

Regiment (compound id):

```jsonc
{
  "ok": true,
  "type": "regiment",
  "id": 1,
  "state": 3,
  "name": "1st Cavalry",
  "raw_id": "regiment3-1",
  "parent_id": "armies"
}
```

Nothing selected:

```jsonc
{ "ok": true, "type": null, "message": "Nothing is currently selected." }
```

Unknown:

```jsonc
{
  "ok": true,
  "type": "unknown",
  "raw_id": "randomThing42",
  "parent_id": "someParent"
}
```

## Validation / error catalog

- None expected. Tool always succeeds; result shape varies.
- Runtime errors (e.g. accessing pack throws) are surfaced via the
  `ToolRegistry.run` `try/catch` wrapper as `isError: true`.

## Files to add

- `src/ai/tools/get-selected-entity.ts` — tool implementation.
- `src/ai/tools/get-selected-entity.test.ts` — Vitest tests.

## Files to edit

- `public/main.js` — `let elSelected;` → `var elSelected;` (line 142).
- `src/ai/index.ts` — alphabetical import / re-export / register.
- `src/ai/tools/_shared/global-exposure.test.ts` — no edit required;
  the static regex auto-detects `var elSelected` as exposed (verified
  by reading lines 96–105 of that test). Plan deliberately calls this
  out so reviewers don't expect a KNOWN_EXPOSED entry.

## Runtime-injection seam

```ts
import type { Tool, ToolResult } from "./index";
import { getGlobal, getPack, okResult } from "./_shared";

export interface SelectedEntityNodeView {
  id: string | null;
  parentId: string | null;
  dataId: string | null;
  dataF: string | null;
  dataState: string | null;
  text: string | null;
}

export interface SelectedEntityRuntime {
  /** Returns a snapshot of the currently selected element, or null. */
  read(): SelectedEntityNodeView | null;
  /** Returns the current pack object (or undefined if not loaded). */
  getPack(): unknown;
}

export const defaultSelectedEntityRuntime: SelectedEntityRuntime;
export function createGetSelectedEntityTool(
  runtime?: SelectedEntityRuntime,
): Tool;
export const getSelectedEntityTool: Tool;
```

The default runtime reads `globalThis.elSelected`, calls `.node()` if
present, and extracts attributes via `getAttribute`. Returns `null`
when `elSelected` is undefined / null / has no node / `.node()`
throws.

## Tests (Vitest)

Mocked-runtime unit tests cover one case per id pattern. Each test
constructs a `SelectedEntityRuntime` whose `read()` returns a
hand-rolled `SelectedEntityNodeView` and whose `getPack()` returns a
minimal `pack` shape with only the entity collection needed.

1. **Burg icon** — id `burg17`, parent `burgIcons` → `{ type: "burg",
   id: 17, name: "Bree", raw_id: "burg17", parent_id: "burgIcons" }`.
2. **Burg anchor** — id `anchor7`, parent `anchors` → `{ type: "burg",
   id: 7, name }`.
3. **Burg label** — id `burgLabel17`, parent `burgLabels` →
   `{ type: "burg", id: 17, name }`.
4. **State region polygon** — id `state3`, parent `statesBody` →
   `{ type: "state", id: 3, name }`.
5. **State label** — id `stateLabel3`, parent `states` (label group)
   → `{ type: "state", id: 3, name }`.
6. **State border halo** — id `state-border3`, parent `statesHalo`
   → `{ type: "state", id: 3, name }`.
7. **State gap** — id `state-gap3` → `{ type: "state", id: 3 }`.
8. **State clip** — id `state-clip3` → `{ type: "state", id: 3 }`.
9. **Province polygon** — id `province7`, parent `provincesBody` →
   `{ type: "province", id: 7, name }`.
10. **Province label** — id `provinceLabel7`, parent `provinceLabels`
    → `{ type: "province", id: 7, name }`.
11. **Culture polygon** — id `culture2` → `{ type: "culture", id: 2 }`.
12. **Culture center** — id `cultureCenter2`, parent `cultureCenters`
    → `{ type: "culture", id: 2 }`.
13. **Religion polygon** — id `religion1` → `{ type: "religion",
    id: 1 }`.
14. **Religion center** — id `religionCenter1` → `{ type: "religion",
    id: 1 }`.
15. **Marker** — id `marker5`, parent `markers` → `{ type: "marker",
    id: 5, name: <type field> }`.
16. **Route** — id `route12`, parent `routes` → `{ type: "route",
    id: 12, name }`.
17. **River** — id `river4`, parent `rivers` → `{ type: "river",
    id: 4, name }`.
18. **Lake (feature) via id `feature_6` + parent `lakes`** →
    `{ type: "lake", id: 6, name }`.
19. **Coastline feature via id `feature_3` + parent `coastline`** →
    `{ type: "feature", id: 3, name }` (sea / island / similar).
20. **Lake via parent=`lakes` and `data-f="6"`** (no useful id; e.g.
    a `<use>` element) → `{ type: "lake", id: 6, name }`.
21. **Regiment** — id `regiment3-1`, parent `armies` → `{ type:
    "regiment", id: 1, state: 3, name }`.
22. **Zone** — id `zone2`, parent `zones` → `{ type: "zone", id: 2,
    name }`.
23. **Free label** — id `label5`, parent `addedLabels`, text `"Far
    East"` → `{ type: "label", id: 5, name: "Far East" }`.
24. **Ice via parent=`ice` and `data-id="2"`** → `{ type: "ice",
    id: 2, name: "" }`.
25. **Relief icon via parent=`terrain`** → `{ type: "relief",
    id: null, name: "" }`.
26. **Nothing selected (read returns null)** → `{ ok: true, type:
    null, message: "Nothing is currently selected." }`.
27. **Unknown id pattern** — id `randomThing42`, parent `someParent`
    → `{ ok: true, type: "unknown", raw_id, parent_id }`.
28. **Tool shape** — name is `get_selected_entity`,
    `input_schema.required` is empty / undefined.
29. **Registry round-trip** — register and find in `registry.list()`.

Default-runtime integration tests:

30. **Reads `globalThis.elSelected`** — set a fake D3-like selection
    `{ node: () => domNode }` where `domNode` has `id`,
    `parentNode.id`, and `getAttribute`. Verify the tool returns the
    right shape end-to-end.
31. **`elSelected = null`** → returns `{ type: null }`.
32. **`elSelected = undefined`** → returns `{ type: null }`.
33. **`elSelected.node()` returns `null`** → returns `{ type: null }`.
34. **`elSelected` lacks `.node` method** → returns `{ type: null }`
    (defensive — covers `elSelected = null` after `unselect()`).

## Verification

- `npm test` — full suite green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (matches baseline).
- `src/ai/tools/_shared/global-exposure.test.ts` seam test still
  passes — `var elSelected;` is detected as an exposure by the static
  regex (line 103: `^[\\t ]*(?:var|function)\\s+${escaped}\\b`).

## Self-review

Re-read pass after drafting plan and tasks file:

- Every entity type with a corresponding `set_*` / `rename_*` /
  `regenerate_*` / `remove_*` AI tool has at least one selection
  pattern in the table:
  - **burg**: id `burg{i}`, `anchor{i}`, `burgLabel{i}`. Tested.
  - **state**: id `state{i}`, `state-border{i}`, `stateLabel{i}`.
    Tested.
  - **province**: id `province{i}`, `provinceLabel{i}`. Tested.
  - **culture**: id `culture{i}`, `cultureCenter{i}`. Tested.
  - **religion**: id `religion{i}`, `religionCenter{i}`. Tested.
  - **marker**: id `marker{i}`. Tested.
  - **route**: id `route{i}`. Tested.
  - **river**: id `river{i}`. Tested.
  - **lake** (rename_lake): id `feature_{i}` + parent `lakes`, OR
    parent `lakes` with `data-f`. Tested.
  - **feature** (coastline): id `feature_{i}` + parent `coastline`.
    Tested.
  - **regiment**: id `regiment{state}-{i}`. Tested.
  - **zone**: id `zone{i}`. Tested.
  - **label**: id `label{i}` (free) plus `stateLabel{i}` /
    `provinceLabel{i}` / `burgLabel{i}` route to their underlying
    types. Tested.
  - **ice**: parent `ice` + `data-id`. Tested.
  - **relief icon**: parent `terrain`. Tested.
- DOM-shadow fix is documented (`let elSelected` → `var elSelected`)
  with rationale referencing plans 349 / 352.
- The seam test does NOT need a new entry: the static regex on
  `var <name>` recognises the exposure automatically. Plan deliberately
  calls that out so a reviewer expecting a KNOWN_EXPOSED edit isn't
  surprised.
- Edge cases tested: `elSelected = null`, `elSelected = undefined`,
  `node()` returns null, `elSelected` lacks `.node` method, unknown
  id pattern. Each yields a graceful response, never throws.
- The tool is read-only: the runtime seam only exposes `read()` and
  `getPack()`; no setter, no DOM mutation. The tool body never
  writes to elSelected, pack, or the DOM.
- `feature_{i}` is shared by lakes and coastlines. The disambiguation
  uses parent group id (`lakes` vs `coastline`). Tested both ways
  (cases 18 + 19).
- `data-f` is the load-bearing id source for lake / coastline
  selections (see lakes-editor.js:37 `+elSelected.attr("data-f")`).
  Tested when the element id alone is insufficient (case 20).
- `data-id` is the load-bearing id source for ice. Tested (case 24).
- `regiment{state}-{i}` returns BOTH `state` and `id` in the result.
  The `name` lookup uses `pack.states[state].military.find(r => r.i
  === id)`. Tested (case 21).
- Free label name resolution uses `elSelected.text()` — captured in
  the runtime view as `text`. Tested (case 23).
- Marker `name` falls back to `type` (markers have no `name` field).
  Documented and tested (case 15).
- Zone `name` lookup uses array index (zones don't follow the typical
  index-aligned `pack.zones[i]` pattern strictly — `i` is the
  positional array index). Confirmed via `drawZone` in
  layers.js:918: zone is rendered with `id="zone${i}"` where `i` is
  the loop index from the visibleZones filter. Same `i` semantics as
  the rest of the zones pipeline (zones-editor.js:349 also uses
  `"zone" + i`). Tested.
- Description fits the convention of existing get-* tools.
- Commit message: `feat(ai): add get_selected_entity tool`.
