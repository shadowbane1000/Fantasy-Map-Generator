# Plan 316: `list_namesbases` AI tool

## Lint baseline (pre-change)

`npm run lint` (Biome): **Found 7 warnings. Found 1 info.** No errors. Warnings live in
`src/renderers/draw-heightmap.ts` (`noDynamicNamespaceImportAccess`) and unrelated files —
none from `src/ai/tools/`. Status target after this plan: same counts (no regression).

## Use case

Mirror the Namesbase Editor dropdown (`public/modules/ui/namesbase-editor.js`):

```js
function createBasesList() {
  const select = document.getElementById("namesbaseSelect");
  select.innerHTML = "";
  nameBases.forEach((b, i) => select.options.add(new Option(b.name, i)));
}
```

The AI currently has zero namesbase tools. This adds the listing primitive — the entry
point for any future namesbase-domain operations.

## Tool surface

- **Name**: `list_namesbases`
- **Inputs**: none — `input_schema = { type: "object", properties: {} }` (matches
  `list_lake_groups`, `list_route_groups`, `list_marker_types`).
- **Effect**: read-only.
- **Source of truth**: `window.nameBases` (declared in `src/types/global.ts` as
  `NameBase[]`, populated in `public/main.js:166` via `Names.getNameBases()`).

## Per-entry schema

For each entry of `window.nameBases`, the tool returns:

| field            | type     | source                                      |
| ---------------- | -------- | ------------------------------------------- |
| `index`          | number   | array index (= editor `+select.value`)      |
| `name`           | string   | `entry.name`                                |
| `min`            | number   | `entry.min`                                 |
| `max`            | number   | `entry.max`                                 |
| `duplicate_chars`| string   | `entry.d` (may be empty string)             |
| `multiword_rate` | number   | `entry.m` if a finite number, else `0`      |
| `name_count`     | number   | `entry.b.split(",").length` if `b` is a non-empty string; `0` if `b === ""`. (Mirror the legacy editor's `analyzeNamesbase` which uses `namesArray.length` after `b.toLowerCase().split(",")`. Note: `"".split(",").length === 1` would be misleading — we special-case empty.) |
| `sample_names`   | string[] | first up to 5 entries from `entry.b.split(",")` after `.trim()`, filtering out empties. |

Order is preserved (the index field is the array index — same as the editor uses).

The full `b` string is **not** returned (corpora can be hundreds of names long).

### Edge-case decisions (documented for tests)

- **`b: ""`** → `name_count = 0`, `sample_names = []`. (Special case: don't return 1 for the
  empty split.)
- **`b: "Foo,,Bar,"`** → `name_count = 4` (matches `"Foo,,Bar,".split(",").length` = 4),
  `sample_names = ["Foo", "Bar"]` (trim, drop empties).
- **`b` has > 5 names** → `sample_names` length is exactly 5.
- **Missing `m`** → `multiword_rate = 0` (use `Number.isFinite(entry.m) ? entry.m : 0`).
- **Missing `d`** → `duplicate_chars = ""`.
- **Missing `name`** → coerce to empty string (defensive; legacy data shouldn't hit this).
- **Missing/non-number `min`/`max`** → coerce via `Number(...)`; `NaN` falls through (we
  don't validate further — listing tool is best-effort).
- **`entry === null` / non-object** → skipped (don't crash on a sparse array).

## Return shape

`okResult({ count, items })` where `count = items.length`. (Filtering out null
entries means `count` may be < `nameBases.length`. Arguably `count = nameBases.length`
is more honest — but matching the convention of `list_lake_groups` / `list_route_groups`,
we return the **emitted** count and leave the user to check `index` jumps if any. Given
real data this is purely defensive — go with `count = items.length`.)

JSON wire format (via `okResult`): `{ ok: true, count: N, items: [...] }`.

## Errors

- `window.nameBases` missing or not an array → `errorResult(...)`. Message wording
  similar to other "not ready" tools: e.g. `"Namesbases are unavailable; cannot list namesbases. Wait for the map to finish loading."`.

## Files

### New

- `src/ai/tools/list-namesbases.ts` — implementation. Exports:
  - `interface NamesbaseEntry` — the wire-format per-entry record.
  - `interface ListNamesbasesRuntime { getNameBases(): unknown[] | null }` — the
    injection seam.
  - `defaultListNamesbasesRuntime` — reads `window.nameBases` via `getGlobal`.
  - `createListNamesbasesTool(runtime?)` — factory.
  - `listNamesbasesTool` — default-runtime instance.
- `src/ai/tools/list-namesbases.test.ts` — tests below.

### Edited

- `src/ai/index.ts`: import the tool, add to the exported barrel block (between
  `list-marker-types` and `list-notes` to keep the alphabetical-ish run), and
  `registry.register(listNamesbasesTool)` near the other `list-*` registrations.

## Wiring

Match the existing pattern: import alphabetically, add to the exports block, register
inside the `registerDefaultTools(...)` block beside the other `list-*` calls.

## Implementation notes

- The runtime returns `unknown[] | null` (not a typed `NameBase[]`) so the tool can
  defend against malformed entries without depending on the legacy generator types.
- Internal helper `summarizeEntry(entry: unknown, index: number): NamesbaseEntry | null`
  performs all the field extraction + edge-case handling. Returning `null` skips the
  entry. (We won't actually return `null` for any entry produced by `Names.getNameBases()`,
  but it keeps tests for malformed inputs simple.)
- No `_shared/paginated-list-tool` dependency; this is a small, ungrouped list (the real
  game ships ~30 entries).

## Tests

Vitest, in `src/ai/tools/list-namesbases.test.ts`:

1. **Happy path (3 namesbases: German, Elvish, Empty)** — 3 items in order with correct
   `index`, `name`, `min`, `max`, `duplicate_chars`, `multiword_rate`, `name_count`,
   `sample_names`. Verify `sample_names.length <= 5`. Verify `name_count` matches the
   `split(",").length` rule.
2. **Empty corpus (`b: ""`)** — `name_count: 0`, `sample_names: []`.
3. **Whitespace + empty splits (`b: "Foo,,Bar,"`)** — `name_count: 4` (matches
   `"Foo,,Bar,".split(",").length`); `sample_names: ["Foo", "Bar"]` (trimmed, no
   empties).
4. **Corpus > 5 names** — `sample_names.length === 5`, in original order.
5. **Missing `m` (entry without that field)** — `multiword_rate: 0`.
6. **Missing `d`** — `duplicate_chars: ""`.
7. **Names with extra whitespace** — sample_names are trimmed.
8. **`window.nameBases` undefined** → error result, `isError: true`,
   message matches `/namesbases/i`.
9. **`window.nameBases = null`** → error result.
10. **`window.nameBases = "not-an-array"`** → error result.
11. **Tool surface** — `name === "list_namesbases"`, `input_schema = { type: "object", properties: {} }`.
12. **Registry round-trip** — when registered to a fresh registry, `tools.find(...)`
    returns this tool by name. (Optional — see if other list-* tests do this; if not,
    skip.)
13. **No-args / `{}` / `null` / `undefined` inputs all succeed** — match
    `list_marker_types` test pattern.

## Out of scope

- No mutations (no add/remove/rename namesbases — those are separate plans, e.g. 317).
- No corpus dumping — keep response compact via `sample_names`.
- Not using the legacy `Names.calculateChain` — that's analysis, not listing.

## Self-review (step 4)

Re-read pass:

- **`name_count` for non-string `b`** — if `entry.b` is missing or non-string, plan should
  treat it as `0`, not crash. Implementation: `typeof entry.b === "string" && entry.b.length > 0`
  is the gate. Documented here.
- **`sample_names` filter** — `trim()` first, then drop empties. Order is preserved
  (no sorting). Cap at 5.
- **Registry round-trip test** — checked `list-marker-types.test.ts`; it doesn't do
  one, so skip in this plan to stay consistent.
- **Description string length** — keeping it descriptive but bounded; not appending the
  `Requires an Anthropic API key` boilerplate since `list_lake_groups` /
  `list_route_groups` (the closest read-only no-arg analogues) don't.
- **`count` semantics** — `count = items.length` (post-skip). Real data won't have
  null entries so the distinction is moot, but documented for tests.
- **`description` mentions** — call out `Names.getNameBases()` as the populator and
  `nameBases` as the global; future namesbase tools (rename / etc.) will reference
  `index` from this tool.
- **Lint baseline** — confirmed: 7 warnings + 1 info, no errors. Targets unchanged.

No structural changes after review.
