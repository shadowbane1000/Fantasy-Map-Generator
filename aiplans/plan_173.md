# Plan 173 — `add_ruler` tool

## Use case

Add a new AI tool `add_ruler` that places a distance-measurement ruler
on the map between two points — the same data mutation the Measurer
tool in `public/modules/ui/units-editor.js` performs when the user
clicks to drop a ruler. Parallel to the soon-to-merge `clear_rulers`
tool (it removes every ruler; this one creates one).

## Rulers API (confirmed by reading source)

`public/modules/ui/measurers.js` exports the following globals (all
loaded as `<script>` tags from `src/index.html`):

- `window.rulers` — a `Rulers` collection instance created once in
  `public/main.js:145` (`let rulers = new Rulers();`).
- `Rulers.prototype.create(Type, points)` — constructs a new measurer,
  pushes it onto `rulers.data`, and returns the instance. `Type` is a
  constructor **class** (not a string): one of `Ruler`, `Opisometer`,
  `RouteOpisometer`, or `Planimeter`. `points` is `number[][]`
  (array of `[x, y]` pairs).
- `Rulers.prototype.fromString(string)` has a `typeMap` that maps the
  lowercase-ish-but-actually-PascalCase names `"Ruler" | "Opisometer" |
  "RouteOpisometer" | "Planimeter"` to their constructors — we use the
  same map to translate a string `type` input into the correct class.
- Every measurer inherits from `Measurer`: its constructor assigns
  `this.id = rulers.data.length` at the moment of creation, so the id
  of the new ruler equals `rulers.data.length - 1` once `create` has
  pushed it.
- `ruler.draw()` renders the SVG into the `#ruler` `<g>` layer
  (the D3 selection `window.ruler`). `.draw()` is a best-effort call
  — the data is already in `rulers.data` regardless.
- The UI's click-to-place handlers all call
  `rulers.create(Ruler, [from, to]).draw();` (see
  `public/modules/ui/units-editor.js:136`). We mirror that exactly.

### Supported types

The AI tool takes a `type` **string** and maps it via the same typeMap
used by `fromString`:

| `type` input            | Resolves to        | Expected `points` shape                 |
| ----------------------- | ------------------ | --------------------------------------- |
| `"ruler"` (default)     | `Ruler`            | 2+ `[x,y]` pairs; we accept exactly 2   |
| `"opisometer"`          | `Opisometer`       | 2+ `[x,y]` pairs; we accept 2           |
| `"planimeter"`          | `Planimeter`       | 3+ `[x,y]` pairs (needs `points[2]+`)    |

`RouteOpisometer` is out of scope: its constructor calls `findCell`
for every point and its `draw()` expects a `pack.cells` snapshot, so
reproducing the cell-tracking behaviour safely is non-trivial.

## API

Inputs:
- `type?: string` — one of `"ruler"` | `"opisometer"` | `"planimeter"`
  (case-insensitive). Default `"ruler"`.
- For `ruler` / `opisometer` (straight / curved line between two
  points): `x1: number`, `y1: number`, `x2: number`, `y2: number` —
  all four required. Coordinates are validated against
  `window.graphWidth` / `graphHeight` (same pixel space as
  `add_marker`).
- For `planimeter` (closed polygon): `points: [number, number][]` —
  required, length ≥ 3. Each coordinate validated against the graph
  bounds.

Return shape: `{ ok: true, id, type, points }`.
- `id` is the numeric id assigned by `Measurer`'s constructor (equals
  `rulers.data.length - 1` post-create).
- `type` is the canonical PascalCase string (`Ruler` / `Opisometer` /
  `Planimeter`) so the consumer knows what was created.
- `points` echoes the final points array pushed to the instance.

## Design decisions

- **Runtime-seam pattern** (same idiom as `add-marker`): define a
  `RulerAddRuntime` with a single `add(input): NewRuler` method; the
  default implementation resolves the class from the global `Ruler` /
  `Opisometer` / `Planimeter` names, calls `rulers.create(Type, pts)`,
  best-effort invokes `.draw()`, and returns `{id, type, points}`.
  Tests inject a mock runtime.
- **Validation layer** (outside the runtime seam, same as
  `add_marker`): coerce + range-check inputs before invoking the
  runtime. Reject non-finite coordinates, reject coordinates outside
  `[0, graphWidth]` / `[0, graphHeight]` (when `graphWidth/Height` are
  defined — same pattern as `get-map-info`), reject wrong-shape
  `points` arrays, reject unknown types.
- **Type map**: the canonical keys are `"ruler"`, `"opisometer"`,
  `"planimeter"` (lowercase, aliases stripped). We also accept the
  PascalCase forms (`"Ruler"` etc.) for convenience. Resolved to the
  constructor via `getGlobal<...>(ClassName)` so the runtime stays
  browser-agnostic (the classes only exist on `window` at runtime).
- **Best-effort draw**: `try { instance.draw?.() } catch {}`, same as
  `drawMarkers` in `add_marker`. The measurer is already on
  `rulers.data` before the draw call, so rendering failure doesn't
  affect the return value.
- **Bounds check**: soft — if `graphWidth` / `graphHeight` are missing
  (pre-map state), we skip the range check and only check for finite
  numbers. Same fallback as `get-map-info`.

## Files

- `src/ai/tools/add-ruler.ts` — new tool.
- `src/ai/tools/add-ruler.test.ts` — unit tests + `defaultRulerAddRuntime`
  integration block.
- `src/ai/index.ts` — import, register, re-export factory + type.
- `README_AI.md` — add a row near where `clear_rulers` will land
  (below `add_zone` / near the other `add_*` rows).

## Risks / edge cases

- `window.rulers` missing (pre-bootstrap) → integration runtime throws
  `"rulers collection is not available."`. Surfaced as `errorResult`.
- Type class missing (`Ruler`, `Opisometer`, `Planimeter`) → runtime
  throws `"Ruler class not available yet."`.
- `draw()` throws because the `#ruler` layer node has not been
  mounted yet → caught + swallowed; data mutation is preserved.
- Coordinates at exactly `graphWidth` / `graphHeight` (edge) are
  accepted (the bounds are inclusive to match how the UI allows
  clicks on the svg edge).
- Planimeter with `< 3` points — rejected up-front since `Planimeter`
  needs a closed polygon (`getPointAtLength` assumes a real path).
