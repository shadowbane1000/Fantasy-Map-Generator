# Plan 314 — `randomize_iceberg_shape` AI tool

## Lint baseline (master / pre-change)

```
$ npm run lint 2>&1 | tail -40
Checked 728 files in 576ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

7 pre-existing warnings (mostly in `src/renderers/draw-heightmap.ts` and a
few in legacy emblem/military/provinces TS) and 1 info note. **0 errors.**
This is the baseline; the new tool must not regress it.

## Use case

Mirror the legacy `randomizeShape()` editor handler from
`public/modules/ui/ice-editor.js` (lines 38–42):

```js
function randomizeShape() {
  const selectedId = +elSelected.attr("data-id");
  Ice.randomizeIcebergShape(selectedId);
  redrawIceberg(selectedId);
}
```

User flow today: open the **Edit Ice** dialog on an iceberg → click the
**Randomize** button → the iceberg gets a fresh random polygon shape (same
size, same cell location, different vertex layout).

**Glaciers cannot be randomized.** The editor hides the Randomize button
when `type === "glacier"`, so the AI tool must reject glacier ids with a
clear error.

The AI got `add_iceberg` (plan 310), `remove_ice` (plan 311),
`set_iceberg_size` (plan 312), and `list_ice` (plan 313) recently merged,
but no shape randomizer. We add `randomize_iceberg_shape` to fill that gap.

## Exact behaviour

1. Validate `id` (required): number, finite, integer, `>= 0`.
2. Look up the matching ice element via `runtime.findIce(id)`. If not found
   → error `"No ice element found with id {id}."`.
3. If `entry.type === "glacier"` → error
   `"Glaciers cannot be randomized; only icebergs."`.
4. Call `runtime.randomizeIcebergShape(id)` (default impl:
   `window.Ice.randomizeIcebergShape`). This re-rolls `entry.points` in
   place — picks a different random grid cell, rescales by the iceberg's
   `size` around its `cellId` center.
5. Call `runtime.redrawIceberg(id)` (default impl: `window.redrawIceberg`).
   The editor's `randomizeShape()` calls both, and
   `Ice.randomizeIcebergShape` does *not* invoke `redrawIceberg` itself
   (see `src/modules/ice.ts` lines ~127–148), so we must call it.
6. Re-look-up the entry (or read from the same runtime helper) and return
   `okResult({ id, point_count })` where `point_count` is the new vertex
   count of `iceberg.points`.

## Why report `point_count`

The randomization is non-deterministic and uses a different random grid
cell as a polygon template, so the new polygon may have a different number
of vertices than before. The editor permits the user to click Randomize
repeatedly — reporting the count gives the AI a verifiable signal that the
mutation succeeded (something changed) without dumping the full point
array.

## Files

- **New**: `src/ai/tools/randomize-iceberg-shape.ts`
- **New**: `src/ai/tools/randomize-iceberg-shape.test.ts`
- **Modified**: `src/ai/index.ts` — three line additions:
  - import alphabetically near other tool imports (e.g. between
    `pingTool` and `regenerateZonesTool`, or wherever alphabetical
    ordering puts `randomize-iceberg-shape`)
  - re-export block
  - `registry.register(randomizeIcebergShapeTool);` near other ice-related
    registrations (`addIcebergTool`, `setIcebergSizeTool`, `removeIceTool`)

## Schema

```jsonc
{
  "name": "randomize_iceberg_shape",
  "description": "Re-roll an iceberg's polygon vertices, mirroring the Edit Ice dialog's Randomize button (public/modules/ui/ice-editor.js#randomizeShape). Delegates to Ice.randomizeIcebergShape, which picks a different random grid cell as a polygon template, rescales it by the iceberg's size around its cell center, and replaces iceberg.points in place. Same size, same cell, different shape. Then triggers redrawIceberg(id) so the new polygon shows up on the map. Glaciers cannot be randomized — pass an iceberg id only.",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "integer",
        "minimum": 0,
        "description": "Iceberg id (matches pack.ice[*].i, not array index)."
      }
    },
    "required": ["id"]
  }
}
```

## Validation rules and error cases

| Condition | Error message |
| --- | --- |
| `id` missing / undefined / null | `"id is required."` |
| `id` not a number / NaN / ±Infinity / float / negative | `"id must be a non-negative integer."` |
| `pack` missing | `"pack is not available."` |
| `pack.ice` missing / not an array | `"pack.ice is not available."` |
| No matching ice element | `"No ice element found with id {id}."` |
| Element exists, `type === "glacier"` | `"Glaciers cannot be randomized; only icebergs."` |
| `Ice.randomizeIcebergShape` not a function | `"Ice.randomizeIcebergShape is not available yet; wait for the map to finish loading."` |
| `redrawIceberg` not a function | `"redrawIceberg is not available yet; wait for the map to finish loading."` |
| `Ice.randomizeIcebergShape` throws | thrown error message forwarded |
| `redrawIceberg` throws | thrown error message forwarded |

## Runtime-injection seam

```ts
export interface RandomizeIcebergShapeIceRef {
  i: number;
  type: "glacier" | "iceberg";
  point_count: number;
}

export interface RandomizeIcebergShapeRuntime {
  /** Look up an ice element by id; null if not present. Throws when pack/pack.ice missing. Returns current point_count so we can report after the mutation. */
  findIce(id: number): RandomizeIcebergShapeIceRef | null;
  /** Mirrors window.Ice.randomizeIcebergShape. */
  randomizeIcebergShape(id: number): void;
  /** Mirrors window.redrawIceberg. */
  redrawIceberg(id: number): void;
}

export const defaultRandomizeIcebergShapeRuntime: RandomizeIcebergShapeRuntime;

export function createRandomizeIcebergShapeTool(
  runtime?: RandomizeIcebergShapeRuntime,
): Tool;
export const randomizeIcebergShapeTool: Tool;
```

`defaultRandomizeIcebergShapeRuntime`:
- `findIce(id)` reads `pack.ice` via `getPack()`; returns
  `{ i, type, point_count }` (point_count = `entry.points?.length ?? 0`);
  throws when pack / pack.ice are missing.
- `randomizeIcebergShape(id)` looks up `window.Ice.randomizeIcebergShape`;
  throws if unavailable; calls it.
- `redrawIceberg(id)` looks up `window.redrawIceberg`; throws if
  unavailable; calls it.

## Order of operations and `point_count`

The result's `point_count` reflects state **after** the mutation. We call
`findIce` once before the mutation (to validate existence and check the
glacier type), then call `randomizeIcebergShape`, then call `redrawIceberg`,
then call `findIce` a second time to read the new `point_count`. If the
post-mutation lookup fails (shouldn't happen — the entry isn't removed by
randomize — but defensive), fall back to `0`.

## Wiring (`src/ai/index.ts`)

Add three lines:

```ts
// Imports block (alphabetical):
import { randomizeIcebergShapeTool } from "./tools/randomize-iceberg-shape";

// Re-export block:
export {
  createRandomizeIcebergShapeTool,
  defaultRandomizeIcebergShapeRuntime,
  type RandomizeIcebergShapeIceRef,
  type RandomizeIcebergShapeRuntime,
  randomizeIcebergShapeTool,
} from "./tools/randomize-iceberg-shape";

// Registration block:
registry.register(randomizeIcebergShapeTool);
```

## Tests (Vitest)

Tests live in `src/ai/tools/randomize-iceberg-shape.test.ts`. They cover
both an injected-runtime path and the default runtime against `globalThis`
stubs.

1. **Happy path (injected runtime)**: pack.ice has
   `{i:7, type:"iceberg", points: [[0,0],[1,0],...]}` (6 points). Stub
   `randomizeIcebergShape` mutates `points` to a 5-point polygon. Result
   `{ok:true, id:7, point_count:5}`; `randomizeIcebergShape` called once
   with `(7)`; `redrawIceberg` called once with `(7)`; the underlying
   array was mutated.
2. **Glacier id rejected**: pack.ice has `{i:0, type:"glacier"}`; tool
   rejects with `"Glaciers cannot be randomized; only icebergs."`;
   `randomizeIcebergShape` not called; `redrawIceberg` not called.
3. **Unknown id** → error `"No ice element found with id 99."`; mutators
   not called.
4. **Non-integer id** (1.5, NaN, Infinity, -Infinity, -1, "1", true, {},
   []) → error `"id must be a non-negative integer."`; mutators not
   called.
5. **Missing id** (undefined / null / absent) → error `"id is required."`.
6. **`pack.ice` missing** (runtime.findIce throws) → error forwarded;
   mutators not called.
7. **`randomizeIcebergShape` throws** → error forwarded; `redrawIceberg`
   NOT called.
8. **`redrawIceberg` throws** → error forwarded.
9. **Default runtime: happy path** with `globalThis.pack`, `globalThis.Ice`,
   `globalThis.redrawIceberg` stubs — confirms round-trip.
10. **Default runtime: missing `Ice`** → error mentions
    `Ice.randomizeIcebergShape`.
11. **Default runtime: missing `Ice.randomizeIcebergShape`** → error
    mentions same.
12. **Default runtime: missing `redrawIceberg`** → error mentions
    `redrawIceberg`.
13. **Default runtime: missing `pack.ice`** → error mentions `pack.ice`.
14. **Default runtime: missing `pack`** → error mentions `pack`.
15. **Tool name + registry round-trip**: `randomizeIcebergShapeTool.name
    === "randomize_iceberg_shape"`, reachable via `buildDefaultRegistry`.

Tests stash and restore `globalThis.pack`, `globalThis.Ice`, and
`globalThis.redrawIceberg` in `beforeEach` / `afterEach` to avoid leaking
between cases.

## Self-review

Re-read plan + tasks. Notes:

1. **Single input parameter (`id`)** — there's no size or other knob; the
   editor's Randomize button takes no arguments. That keeps the schema
   minimal.

2. **`point_count` in result, not point coordinates**: dumping the full
   point array would bloat the tool output and isn't actionable. The
   count is enough to confirm the mutation happened (and may differ
   across calls because randomize picks a different cell template).

3. **Two runtime calls, two seams**: same pattern as `set_iceberg_size`.
   Sequential try/catches so a `redrawIceberg` failure surfaces a
   different error than a `randomizeIcebergShape` failure. Even if
   redraw fails, the data is consistent (`points` already replaced) —
   we don't roll back.

4. **Glacier rejection** must happen *after* the lookup (so we know the
   element exists and what type it is) but *before* the call to
   `randomizeIcebergShape`. Tests assert that mutators were NOT called.

5. **`findIce` returns null for not-found, throws for missing pack**:
   so the tool can return `"No ice element found"` (a 404-ish error) vs
   `"pack.ice is not available"` (a setup error). Same pattern as the
   sibling ice tools.

6. **Description mentions glaciers are not supported** — agents need to
   know up front, not after a failed call.

7. **Reading `point_count` after the mutation, not before**: the spec
   asks us to report the new vertex count so the agent can confirm
   something changed. We re-look-up after `randomizeIcebergShape`
   completes. (Before-and-after diff would be nicer but the spec only
   asks for the new count.)

8. **No regression risk to lint**: new code uses only patterns already in
   use (typed `getGlobal`, kebab-case file name, double quotes, 2-space
   indent).

9. **Test #1 verifies array-mutation semantics**: stub
   `randomizeIcebergShape` to splice the points array in place, then
   assert (a) result.point_count = new length, (b) the original ice
   array entry now reflects the new shape. This catches accidental
   misuses where a tool would re-read from a stale pre-mutation copy.

10. **The post-mutation `findIce` call is intentionally separate from
    the pre-mutation one**: in real usage `Ice.randomizeIcebergShape`
    mutates `iceberg.points` directly, so a single live reference would
    show the new count too — but using `runtime.findIce` again keeps
    the tool's contract pure and lets the test substitute behaviour at
    the seam.
