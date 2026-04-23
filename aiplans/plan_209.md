# Plan 209 — `list_marker_types` AI tool

## Goal

Add a read-only AI tool `list_marker_types` that enumerates the distinct
`marker.type` values currently in use on the map, with a count of active
markers per type. This is the discovery companion to `set_marker_type`
and the group-level summary analog of `list_markers`.

## Motivation

`list_markers` returns every marker (paginated) and lets callers filter by
exact `type`. `set_marker_type` sets one marker's type but does not surface
which types already exist. Agents wanting to audit groupings, bulk-edit every
marker of one type, or discover type names before filtering have no compact
answer — they currently have to page through `list_markers` and de-duplicate
client side. A dedicated summary tool keeps token usage low and mirrors the
"list the buckets in use" pattern used elsewhere.

Scope contrast vs. `list_marker_pins` — `list_marker_pins` returns the fixed
catalogue of 13 pin shape identifiers accepted by `set_marker_pin` (the
universe of inputs). `list_marker_types` instead surveys the *current* map's
markers and reports only the types actually assigned — so the output is
data-dependent, requires a generated pack, and includes a noteworthy
`"untyped"` bucket for markers with no `type` field set.

## API

No input parameters — calling `{}` / `null` / `undefined` all produce the
same response.

## Output shape

Happy path:

```
{
  ok: true,
  types: [
    { type: "castle",      count: 12 },
    { type: "battlefield", count:  7 },
    { type: "volcano",     count:  3 },
    { type: "untyped",     count:  2 }
  ],
  total: 24
}
```

- `types` is sorted by `count` descending. Ties break by `type` ascending
  (case-sensitive compare) so the ordering is deterministic across calls.
- `total` is the total count of active markers scanned (sum of per-type
  counts). Useful because a caller can distinguish "no markers yet" from
  "markers exist but I filtered them all out" without a second call.
- `type` is the raw string value from `marker.type`. The sentinel string
  `"untyped"` is used when `marker.type` is missing / null / an empty string
  (matches the `list_markers.type` field, which surfaces `null` for the same
  case — but here we need a deterministic string key).

Error path — when the pack isn't ready:

```
{
  ok: false,
  error: "Map is not ready yet; cannot list marker types. Wait for the 'map:generated' event on window."
}
```

(Parallels the `list_markers` "not ready" message wording.)

## Core scanner

`readMarkerTypesFromPack(pack)`:

- Returns `null` when `pack` or `pack.markers` is missing.
- Iterates `pack.markers`, skipping `removed === true`. Markers use `i = 0`
  as a valid index in practice (no index-0 placeholder — unlike burgs). But
  the plan's use-case brief says "skip removed/i=0"; we honour that by
  skipping entries with `i === 0` as well so removed / placeholder-like
  entries never contribute. Defensive, low-risk — no legitimate user marker
  is created with `i === 0` today (marker generator assigns fresh `i`).
- Treats `marker.type` as the grouping key:
  - Non-empty string (trimmed) → used verbatim (trimmed on the outside only;
    preserves case).
  - `null` / `undefined` / not a string / empty string → bucket `"untyped"`.
- Increments counts in a `Map<string, number>`.
- Produces a sorted array (desc count, asc key tiebreak) and the total.

## Runtime seam

```ts
export interface MarkerTypesSummary {
  types: { type: string; count: number }[];
  total: number;
}

export interface MarkerTypesRuntime {
  readMarkerTypes(): MarkerTypesSummary | null;
}
```

`defaultMarkerTypesRuntime.readMarkerTypes()` reads `window.pack` via the
shared `getPack<{ markers?: RawMarker[] }>()` helper and delegates to the
pure `readMarkerTypesFromPack()`. Tests inject a fake runtime via
`createListMarkerTypesTool(customRuntime)`; integration describe stubs
`globalThis.pack` via `as unknown as { pack?: unknown }`.

## Registration

- `src/ai/tools/list-marker-types.ts` — runtime-seam tool.
- `src/ai/tools/list-marker-types.test.ts` — unit + integration describe.
- `src/ai/index.ts` — import, re-export create-fn / default runtime /
  types / pure-scanner in the alphabetical block; register in
  `buildDefaultRegistry` directly after `listMarkersTool`.
- `README_AI.md` — add a row directly after `list_markers`.

## Tests

Pure scanner / runtime seam:

- returns empty `types` + `total: 0` when `pack.markers` is `[]`
- groups a mix of typed markers and returns counts descending
- breaks ties by ascending type name
- preserves original casing of `type` strings
- buckets `undefined` / empty-string / whitespace-only / non-string `type` as
  `"untyped"`
- skips `removed: true` markers
- skips markers with `i === 0`
- returns `null` for missing pack and for pack without `markers`
- total matches the sum of per-type counts

Tool surface:

- accepts no-args / `{}` / `null` / `undefined` uniformly
- rejects unknown keys? — no (we intentionally ignore extra input, matching
  other no-param list tools like `list_marker_pins`)
- surfaces `"not-ready"` (null runtime result) as a structured error
- happy-path returns `ok: true`, correctly-shaped `types` + `total`
- `listMarkerTypesTool` export has `name === "list_marker_types"` and the
  expected no-params `input_schema`

Integration (`defaultMarkerTypesRuntime`):

- stubs `globalThis.pack` (beforeEach / afterEach) with a small marker set,
  asserts the live tool produces the expected sorted counts
- asserts tool execution surfaces the not-ready error when pack is cleared

## Non-goals

- Distinguishing `null` vs. `""` vs. missing `type` — all bucketed as
  `"untyped"` for simplicity. Callers needing the raw values can reach
  `list_markers`.
- Pagination — the type universe is small (usually < 20 distinct buckets on
  a generated map).
- Counting removed markers — consistent with `list_markers` semantics.
- Returning sample ids per type — out of scope; callers can follow up with
  `list_markers?type=…`.
- Sorting by name — callers wanting a-z can sort client-side; count-desc is
  the overwhelmingly useful default.
