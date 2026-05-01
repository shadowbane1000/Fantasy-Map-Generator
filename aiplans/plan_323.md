# Plan 323: `count_relief_icons` AI tool

## Lint baseline

`npm run lint` (run before any changes) — 7 warnings + 1 info, 0 errors. Pre-existing warnings in:

- `src/renderers/draw-heightmap.ts:34` and `:64` — `noDynamicNamespaceImportAccess` for `d3[curveType]`.
- (other pre-existing warnings)

We must not regress this. Target: still 7 warnings, 0 errors after our changes (we only add a new file under `src/ai/tools/` and a single import + register line in `src/ai/index.ts`).

## Use case

The user can't see relief icons (mountains, hills, trees, etc.) in any list — they're rendered as raw `<use>` elements under `<g id="terrain">` and the only way to discover them in the UI is to zoom around. The AI needs a read-only primitive to discover what relief-icon types exist and how many of each before mutating. Once paired with the in-flight `clear_relief_icons` tool (plan 322), the AI can compose: count → ask the user → clear-by-type.

## Where the data lives

Relief icons are SVG `<use>` elements directly under the `terrain` D3 selection (rooted at `<g id="terrain">`). They reference symbols via the `href` attribute (values like `#relief-mount-1`, `#relief-hill-1`, `#relief-mount-1-bw`). They have NO unique IDs — the only identifying state is the `href` (the type), `x`, `y`, `width`, `height`. Pure SVG state, not mirrored in `pack`.

Construction sites (read in `src/renderers/draw-relief-icons.ts`):

```
`<use href="${r.i}" x="${r.x}" y="${r.y}" width="${r.s}" height="${r.s}"/>`
```

…where `r.i` is `#relief-mount-1`, `#relief-hill-1`, `#relief-mount-1-bw`, etc. The `href` value is stored already including the leading `#` (because that's what `getIcon()` returns). So we use `getAttribute("href")` to read it back literally.

## Tool design

Tool name: `count_relief_icons`.

### Inputs

- `type` (optional) — string — filter for the breakdown.
  - If provided: the breakdown only contains the matching type (with count 0 if absent).
  - If omitted: breakdown contains every type that has at least one icon.
  - Format: leading `#` (e.g. `"#relief-mount-1"`).

### Effect

- Locate the `terrain` root: try `window.terrain.node()` first, fall back to `document.getElementById("terrain")`. Error if neither.
- Iterate all direct `<use>` descendants (`querySelectorAll("use")` from the terrain root).
- For each, read `getAttribute("href")` (legacy code stores it including the `#`). Skip entries with no `href` attribute (don't crash).
- Build:
  - `total` = total icon count (regardless of filter).
  - `by_type` = entries `{ type, count }`. Sorted by count descending; ties broken by type ascending.

### Return

`okResult` body:

```json
{
  "ok": true,
  "total": <number>,
  "by_type": [{ "type": "...", "count": <number> }, ...],
  "filtered_type": "..." // only when `type` was provided
}
```

- `total` always reflects the unfiltered grand total.
- `by_type`:
  - Without filter: every type with count >= 1, sorted by count desc / type asc.
  - With filter: a single entry `{ type: <input>, count: <matching only> }`, even if 0.
- `filtered_type` present only when `type` was provided.

### Error cases

| Condition | Error message |
|---|---|
| `type` provided but not a string (e.g. number, array, object) | `"type must be a string."` |
| `type` provided as a string but doesn't start with `#` | `"type must start with '#'."` |
| Both `window.terrain` and `#terrain` SVG element missing | `"Terrain layer is unavailable; cannot count relief icons. Wait for the map to finish loading."` |

(`null`/`undefined` inputs are treated like absent — no filter applied.)

## Files

### New
- `src/ai/tools/count-relief-icons.ts`
- `src/ai/tools/count-relief-icons.test.ts`

### Modified
- `src/ai/index.ts` — import + `registry.register(...)` next to `listRouteGroupsTool` / `listIceTool`.

## Module shape (`count-relief-icons.ts`)

- `interface CountReliefIconsRuntime { getTerrainRoot(): Element | null; }`
- `defaultCountReliefIconsRuntime` — tries `window.terrain.node()` first, falls back to `document.getElementById("terrain")`.
- `createCountReliefIconsTool(runtime?)` — produces the `Tool` object.
- `countReliefIconsTool` — default-runtime instance.

The execute step:

1. Validate `type` (if present): must be string and must start with `#`.
2. Call `runtime.getTerrainRoot()`. If `null`, return error.
3. `root.querySelectorAll("use")` — iterate, read `getAttribute("href")`, skip null/empty.
4. Tally per-type counts in a `Map<string, number>`.
5. `total` = sum of all values.
6. Build `by_type`:
   - If `type` filter set: `[{ type: <input>, count: counts.get(input) ?? 0 }]`.
   - Else: convert map entries to array, sort by count desc; ties broken by type asc.
7. Return `okResult({ total, by_type, ...(typeFilter ? { filtered_type } : {}) })`.

## Wiring

In `src/ai/index.ts`:

- Add `import { countReliefIconsTool } from "./tools/count-relief-icons";` near `listIceTool` / `listRouteGroupsTool` imports.
- Add `countReliefIconsTool,` in the exported tools array (sorted-ish neighborhood near read-only list tools).
- Add `registry.register(countReliefIconsTool);` near `registry.register(listRouteGroupsTool);`.

## Test plan (Vitest)

Tests in `count-relief-icons.test.ts`. Uses fake-runtime injection plus a default-runtime integration test using a real DOM element (vitest provides jsdom-like env via the existing test env, OR we synthesize a stub `Element`).

Cases:

1. **Metadata**: tool name == `count_relief_icons`, schema has optional `type` string.
2. **`createCountReliefIconsTool()` round-trips** equivalent name + description + schema.
3. **Tool registry round-trip**: `registry.register(tool)` and `list()` finds it.
4. **Happy path no filter**: terrain has 3× `#relief-mount-1`, 2× `#relief-hill-1`, 1× `#relief-swamp-1` `<use>` elements → `total=6`, `by_type=[{mount:3},{hill:2},{swamp:1}]`.
5. **Tie-break**: 2× `#relief-mount-1`, 2× `#relief-hill-1` → sorted by type ascending → hill first.
6. **With filter `type="#relief-mount-1"`** (same terrain as #4): `total=6`, `by_type=[{type:"#relief-mount-1", count:3}]`, `filtered_type="#relief-mount-1"`.
7. **Filter matches nothing**: `type="#relief-cactus-1"`, terrain has only mount → `by_type=[{type:"#relief-cactus-1", count:0}]`, `filtered_type` set, `total` still equal to the actual count.
8. **Empty terrain**: no `<use>` children → `total=0`, `by_type=[]`.
9. **Icon missing `href`**: include a `<use>` without href among real ones; ensure it's skipped, total reflects only real ones, no crash.
10. **`type` non-string** (number, array, object) → `errorResult("type must be a string.")`.
11. **`type` without leading `#`**: `"relief-mount-1"` → error `"type must start with '#'."`.
12. **`type=""`** (empty string) → does not start with `#`, so error.
13. **Both terrain selection and `#terrain` element missing** (runtime returns null) → error `"Terrain layer is unavailable..."`.
14. **Default runtime integration**: build a real `<g id="terrain">` with stub `<use>` children inside (using `document.createElementNS` or innerHTML in jsdom), assign `globalThis.terrain = { node: () => g }`, ensure end-to-end works.
15. **Default runtime DOM fallback**: with `globalThis.terrain` undefined, `document.getElementById("terrain")` returns the same root → still works.
16. **Default runtime errors when both missing**: `globalThis.terrain` undefined and `document.getElementById("terrain")` returns null → error.

## Self-review notes

- Did not couple to plan 322 (`clear_relief_icons`). This tool is independent and merge-safe regardless of whether 322 is merged first.
- The shared `okResult`/`errorResult` helpers are used so the JSON envelope matches the rest of the AI tool surface.
- `getAttribute("href")` is correct for the legacy `<use href="...">` style. (The DOM also exposes a `.href` SVGAnimatedString property for `<use>`; we deliberately use `getAttribute` as the spec says, matching what the issue calls out.)
- Sort order `count desc, type asc` is documented and tested.
- Filter behaviour is unambiguous: `total` always unfiltered; `by_type` filtered to a single entry when `type` is set; filter that misses still returns `count: 0`.
- Empty terrain returns `total: 0, by_type: []` with no `filtered_type` (when no filter) — distinct from "filtered to a missing type".

## Review

Read the plan top-to-bottom and verified:
- File paths match conventions (kebab-case).
- Error strings are stable and asserted in tests.
- `null`/`undefined` `type` is normalised to "no filter" — same pattern as `list-ice.ts`.
- Wiring touches only `src/ai/index.ts` (one import + one register call + one entry in the tools array).
- Lint won't regress: new code uses double quotes, 2-space indent, no `any` (already permitted), no namespace import dynamic access.
- Tests are explicit about all error strings and the sort order.
