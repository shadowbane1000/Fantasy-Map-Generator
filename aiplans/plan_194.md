# Plan 194 — add `list_rulers` AI tool

## Goal
Add a read-only AI tool that lists every ruler / opisometer /
planimeter / RouteOpisometer currently placed on the map, i.e. every
entry in `window.rulers.data` from `public/modules/ui/measurers.js`.

## Why
We already have `add_ruler`, `clear_rulers`, and `remove_ruler` as the
create / bulk-clear / single-remove counterparts. The agent currently
has no way to *inspect* the ruler collection — it can't answer "what
rulers are on the map?" or pick an id for `remove_ruler`. This tool is
the list counterpart of the cluster, matching the Rulers Overview
surface in the Units Editor.

## Shape

Tool name: `list_rulers`

Input (all optional):
- `limit` (integer, 1-500, default 100) — pagination cap.
- `offset` (integer, >= 0, default 0) — pagination skip.

Behavior:
- Read-only.
- Iterate `window.rulers.data`.
- For each measurer instance report:
  - `i` — `ruler.id` (numeric, assigned by `Measurer` base ctor as
    `rulers.data.length` at creation time).
  - `type` — class name: `"Ruler"` / `"Opisometer"` / `"Planimeter"`
    / `"RouteOpisometer"` (via `instance.constructor.name`).
  - `points` — deep copy of `[x, y]` pairs from `ruler.points`.
  - `length` — straight-line length (same formula as `Ruler.getLength`
    in measurers.js — sum of segment `Math.hypot`s). Applies to
    `Ruler`, `Opisometer`, `RouteOpisometer`. For `Planimeter` this is
    the closed polygon perimeter (we include the first-point return
    segment). For degenerate single-point polylines it's 0.
  - `unit` — distance unit label pulled from
    `document.getElementById("distanceUnitInput").value` (same source
    `measurers.js:208` uses for the on-map label). Null when the input
    element is absent.
- Returns the standard `createPaginatedListTool` response shape:
  `{ total, limit, offset, rulers: [...] }`.

## Files

- `src/ai/tools/list-rulers.ts` — runtime-seam tool.
- `src/ai/tools/list-rulers.test.ts` — pure / seam tests plus
  `defaultRulersRuntime` integration block seeding `globalThis.rulers`.
- `src/ai/index.ts` — import, register in `buildDefaultRegistry()`,
  re-export public surface.
- `README_AI.md` — add row in the `list_*` cluster near `list_markers`
  / `list_notes` describing pagination + returned fields.

## Architecture

Mirror `list-markers.ts` + `list-zones.ts`:

- `export interface RulerSummary { i, type, points, length, unit }`
- `export interface RulerPackLike` — ducktype of `window.rulers`.
- `export function readRulersFromCollection(rulers, unit)` — pure.
- `export interface RulersRuntime { readRulers(): RulerSummary[] | null }`
- `export const defaultRulersRuntime` — reads from `getGlobal("rulers")`
  and the DOM `distanceUnitInput`.
- `export function createListRulersTool(runtime = default): Tool`
  delegates to `createPaginatedListTool`.
- `export const listRulersTool = createListRulersTool()`.

No filters beyond pagination — the ruler count is usually low (< 20),
so filters (type, min_length, …) are overkill; keep v1 minimal and
consistent with `list_notes`.

## Validation / edge cases

- `rulers` missing / `rulers.data` not an array → `null` →
  `notReadyError` ("Map is not ready yet; cannot list rulers…").
- Empty data → `{ total: 0, rulers: [] }`. Not an error.
- `instance.constructor?.name` is used for `type`; falls back to
  `"Measurer"` when constructor is unavailable (should never happen
  for real classes, but defensive for test stubs).
- `points` coerced to `[x, y]` pairs: skips malformed entries; maps
  finite numbers through; non-finite → 0.
- `length` computed from coerced points. A single-point ruler → 0.
- `unit` sourced once per read from the DOM; trimmed; null if
  element or `.value` is unavailable.

## Tests

Pure / seam:
- 3-ruler fixture (Ruler, Opisometer, Planimeter) → full list.
- pagination honors `limit` / `offset`.
- invalid paging (`limit` 0 / 501 / 1.5; `offset` -1 / 1.5) → error.
- `RouteOpisometer` still reports `type: "RouteOpisometer"`.
- Planimeter length is the closed-polygon perimeter.
- ruler with missing / malformed `points` → tolerated; `points: []`,
  `length: 0`.
- `readRulersFromCollection(undefined, …)` → null.
- `readRulersFromCollection({ data: "nope" }, …)` → null.
- runtime returning null → "not ready" error from the tool.
- `listRulersTool` schema spot-check (name, properties).

Integration (`defaultRulersRuntime`):
- seed `globalThis.rulers` with a stub `data` array of fake measurer
  instances (stub classes so `constructor.name` works), seed the DOM
  `distanceUnitInput` via `document.createElement("input")`, assert
  end-to-end read-through via `listRulersTool.execute({})`.
- remove `globalThis.rulers` → tool returns "not ready" error.
- missing DOM input → `unit: null`.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Filters beyond pagination (type / min_length / …).
- Returning the SVG element handle.
- Mutating rulers — that's `add_ruler` / `clear_rulers` / `remove_ruler`.
- Returning opisometer path length via `el.getTotalLength()` — only
  reliable once drawn; straight-line `Math.hypot` length is good
  enough for the overview.
