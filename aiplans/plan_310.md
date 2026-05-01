# Plan 310 — `add_iceberg` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ 46075ec` (plan-310 branch base):

```
Checked 720 files in 565ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info are pre-existing
`lint/performance/noDynamicNamespaceImportAccess` in
`src/renderers/draw-heightmap.ts:34, 64`, plus a couple of pre-existing
warnings/info in `src/modules/provinces-generator.ts` and the emblem
generator. None are in any file we touch. This is the baseline that the
post-implementation lint must match.

## Use case

The Ice Editor (`public/modules/ui/ice-editor.js`) wires an "Add
Iceberg" button. When the user clicks the button and then clicks the
map, this fires:

```js
function addIcebergOnClick() {
  const [x, y] = d3.mouse(this);
  const i = findGridCell(x, y, grid);
  const size = +document.getElementById("iceSize")?.value || 1;
  Ice.addIceberg(i, size);
  if (d3.event.shiftKey === false) toggleAdd();
}
```

The user-visible flow is "open Edit Ice → click Add Iceberg → click on
the map → an iceberg appears at that point". The AI side has no
existing ice tools at all. This plan adds `add_iceberg` — the AI
equivalent of the Add+click flow, parameterized by `(x, y, size)`.

## Tool name

`add_iceberg`

## Inputs

- `x` (number, **required**) — map-space x coordinate. Must be a finite
  number.
- `y` (number, **required**) — map-space y coordinate. Must be a finite
  number.
- `size` (number, optional) — iceberg size multiplier; default `1`
  (matches the UI's `iceSize` fallback). Must be a finite number,
  strictly greater than 0, and at most 5. Sizes much larger than 5
  start to overlap the cell polygon and produce visual artefacts.

## Behavior

1. Validate `x`, `y` are finite numbers.
2. Validate `size` (when supplied): finite, `> 0`, `<= 5`. If not
   supplied, default `1`.
3. Resolve the runtime dependencies — `findGridCell`, `Ice.addIceberg`,
   `pack`, `pack.ice`, `grid`. Each missing dep produces an actionable
   error.
4. Compute `cellId = runtime.findGridCell(x, y)`.
5. Reject if `cellId` is not a non-negative integer or is out of range
   (`>= grid.cells.i.length`). Error: `"no grid cell at (x, y)"`.
6. Capture `pack.ice.length` before the call.
7. Call `runtime.addIceberg(cellId, size)`. If it throws, surface the
   error.
8. Re-read `pack.ice`. If it didn't grow by exactly one entry, error
   (`"Ice.addIceberg did not push a new ice element."`).
9. Read the last entry. Verify `type === "iceberg"` (otherwise error
   — `add_iceberg` must add icebergs, not glaciers) and `cellId`
   matches.
10. Return `okResult({ id, cell_id, size })`.

`Ice.addIceberg` itself calls `redrawIceberg(id)`, so we don't need a
separate render step.

## Inputs/Outputs

input_schema:

```json
{
  "type": "object",
  "properties": {
    "x": { "type": "number", "description": "X map-space coordinate." },
    "y": { "type": "number", "description": "Y map-space coordinate." },
    "size": {
      "type": "number",
      "minimum": 0,
      "maximum": 5,
      "exclusiveMinimum": 0,
      "description": "Size multiplier; default 1. Range: (0, 5]."
    }
  },
  "required": ["x", "y"]
}
```

Successful insertion:

```
{
  "ok": true,
  "id": <number>,
  "cell_id": <number>,
  "size": <number>
}
```

## Validation / error catalog

- `x` missing / not a finite number → `"x must be a finite number."`.
- `y` missing / not a finite number → `"y must be a finite number."`.
- `size` supplied but not a finite number / NaN / Infinity →
  `"size must be a finite number in (0, 5]."`.
- `size` ≤ 0 or > 5 → `"size must be a finite number in (0, 5]."`.
- `findGridCell` not on `globalThis` → `"findGridCell is not available
  yet."`.
- `Ice` / `Ice.addIceberg` not on `globalThis` → `"Ice.addIceberg is
  not available yet."`.
- `grid` missing on `globalThis` → `"grid is not available yet."`.
- `pack` / `pack.ice` missing → `"pack.ice is not available."`.
- `findGridCell` returns NaN, undefined, null, negative, or out of
  range → `"no grid cell at (x, y)."`.
- `addIceberg` throws → surface message verbatim.
- `addIceberg` doesn't push (length unchanged) → `"Ice.addIceberg did
  not push a new ice element."`.
- Last pushed entry isn't an iceberg (e.g. type === "glacier") →
  `"Ice.addIceberg pushed an entry of unexpected type."`.

## Files to add

- `src/ai/tools/add-iceberg.ts` — tool implementation.
- `src/ai/tools/add-iceberg.test.ts` — Vitest tests.

## Files to edit

- `src/ai/index.ts`:
  - Import alphabetically (between `addHillTool` and
    `addLabelGroupTool`):
    `import { addIcebergTool } from "./tools/add-iceberg";`
  - Re-export block.
  - `registry.register(addIcebergTool);` near the other `add*`
    registrations (e.g., before `addMarkerTool`).

## Runtime-injection seam

```ts
import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface AddIcebergIceEntry {
  i: number;
  type: string;
  cellId?: number;
  size?: number;
  // points, etc., are present but not part of this tool's contract.
  [key: string]: unknown;
}

export interface AddIcebergRuntime {
  /** Look up the grid-cell index at the given map-space coordinates. */
  findGridCell(x: number, y: number): number;
  /** Total number of grid cells (for range validation). */
  getGridCellCount(): number;
  /** Append a new iceberg via Ice.addIceberg(cellId, size). */
  addIceberg(cellId: number, size: number): void;
  /** Return the live pack.ice array reference; throws when missing. */
  getIceArray(): AddIcebergIceEntry[];
}
```

The default runtime resolves each dep through `globalThis`:

- `findGridCell` — `globalThis.findGridCell(x, y, globalThis.grid)`.
  Throws when either is missing.
- `getGridCellCount` — `globalThis.grid.cells.i.length`. Throws when
  missing.
- `addIceberg` — `globalThis.Ice.addIceberg(cellId, size)`. Throws
  when `Ice` or its method is missing.
- `getIceArray` — `globalThis.pack.ice`. Throws when missing.

This way each missing dep is its own actionable error. Tests inject a
fake runtime to avoid touching real DOM/pack.

## Tests

Unit / mocked-runtime (Vitest):

1. **Happy path** — runtime stubs return cellId=42; `addIceberg`
   pushes `{ i: 7, type: "iceberg", cellId: 42, size: 1 }` →
   result `{ id: 7, cell_id: 42, size: 1 }`. `runtime.addIceberg`
   called with `(42, 1)`.
2. **Custom size** — `size: 2` → propagates to `addIceberg` and
   shows up in result.
3. **Default size** — size omitted → `addIceberg` called with `1`.
4. **`findGridCell` returns -1** → error `"no grid cell at (x, y)."`,
   `addIceberg` not called.
5. **`findGridCell` returns undefined** → same error.
6. **`findGridCell` returns null** → same error.
7. **`findGridCell` returns NaN** → same error.
8. **`findGridCell` returns out-of-range index** (>= grid cell count)
   → same error.
9. **`addIceberg` throws** → tool returns the error;
   `pack.ice` length unchanged after the call (verified via the
   `getIceArray` snapshot).
10. **`addIceberg` pushes nothing** (length unchanged) →
    `"Ice.addIceberg did not push a new ice element."`.
11. **`addIceberg` pushes a glacier** (last entry has type "glacier")
    → `"Ice.addIceberg pushed an entry of unexpected type."`.
12. **`x` non-finite** → for each of `NaN`, `Infinity`, `-Infinity`,
    `"5"`, `null`, `undefined` → error.
13. **`y` non-finite** — same coverage as x.
14. **`size` 0 / negative / 5.0001 / NaN / Infinity / "1"** → all
    rejected with the in-(0,5] error.
15. **`size` exactly 5** — accepted (boundary).
16. **`size` exactly 0.0001** — accepted (boundary).
17. **Default runtime: happy path** — stubbed
    `globalThis.findGridCell`, `globalThis.grid`, `globalThis.Ice`,
    `globalThis.pack` → end-to-end returns ok with the right id.
18. **Default runtime: missing `findGridCell`** → error mentioning
    `findGridCell`.
19. **Default runtime: missing `grid`** → error mentioning `grid`.
20. **Default runtime: missing `Ice`** → error mentioning `Ice`.
21. **Default runtime: missing `pack` / `pack.ice`** → error mentioning
    `pack.ice`.
22. **Tool name + registry round-trip**: name is `"add_iceberg"`;
    `registry.run("add_iceberg", ...)` works (with a stubbed
    runtime via `createAddIcebergTool`).

## Self-review checklist

- [ ] tool name exactly `add_iceberg`.
- [ ] inputs `x`, `y` required; `size` optional with default 1.
- [ ] size range (0, 5] enforced.
- [ ] grid-cell index validated against `grid.cells.i.length`.
- [ ] verifies the new entry exists, is an iceberg, and matches the
  cellId we asked for.
- [ ] each missing dep yields a clear, actionable error.
- [ ] runtime seam cleanly testable; `defaultAddIcebergRuntime`
  resolves each dep at call time (so tests can stub between calls).
- [ ] no pack mutation outside `Ice.addIceberg` (which itself
  redraws).
- [ ] commit `feat(ai): add add_iceberg tool`.

### Self-review notes (post-edit pass)

Re-read pass before implementation:

- The size upper bound of 5 is a defensive cap. The legacy
  `iceSize` UI input has no documented max — it's an unconstrained
  `<input type="number">` plus the `+...||1` coercion. `Ice.addIceberg`
  uses `lerp(cx, vx, size)` to push the polygon corners outward from
  the centroid by a factor of `size`; sizes well above 1 produce
  icebergs that visibly extend beyond their cell. We pick 5 as a
  generous-but-bounded ceiling consistent with what a human would
  ever type. Tests pin both boundary cases.
- The "did the runtime push exactly one new entry" check is required
  because `Ice.addIceberg` is async-ish in spirit (the redraw can
  fail without throwing, and a misconfigured cell could have it
  push nothing). Without the check we'd return success while
  `pack.ice` is unchanged. The "is it actually an iceberg" check
  protects against the case where a future caller mutates the
  module to push glaciers via the same code path.
- We expose `getGridCellCount()` rather than letting tests inspect
  `grid` directly. This keeps the runtime seam purely
  function-shaped and avoids the runtime needing to expose a fake
  grid object.
- The default runtime calls `getGlobal` lazily inside each method so
  that tests can swap globals in/out between invocations (matches
  the pattern in `add-marker.ts`'s `defaultMarkerAddRuntime.add`).
