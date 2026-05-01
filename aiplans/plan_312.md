# Plan 312 — `set_iceberg_size` AI tool

## Lint baseline (master / pre-change)

```
$ npm run lint 2>&1 | tail -40
Checked 724 files in 561ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

7 pre-existing warnings (all in `src/renderers/draw-heightmap.ts` — dynamic
namespace import access on `d3`) and 1 info note. **0 errors.** This is the
baseline; the new tool must not regress it.

## Use case

Mirror the legacy `changeSize()` editor handler from
`public/modules/ui/ice-editor.js`:

```js
function changeSize() {
  const newSize = +this.value;
  const selectedId = +elSelected.attr("data-id");
  Ice.changeIcebergSize(selectedId, newSize);
  redrawIceberg(selectedId);
}
```

User flow today: open the **Edit Ice** dialog on an iceberg → drag the size
slider → the iceberg expands/shrinks visibly.

The slider is defined in `src/index.html` line 3086:

```html
<input id="iceSize" data-tip="Change Iceberg size" type="range" min=".05" max="2" step=".01" />
```

**Glaciers cannot be resized.** The editor hides the size input for
`type === "glacier"`, so the AI tool must reject glacier ids with a clear
error.

The AI got `add_iceberg` (plan 310) and `remove_ice` (plan 311) just merged
but no resize. We add `set_iceberg_size` to close that gap.

## Exact behaviour

1. Validate `id` (required): number, finite, integer, `>= 0`.
2. Validate `size` (required): number, finite, `> 0`, in the slider range
   `[0.05, 2]` inclusive (matches `min=".05"` / `max="2"` in
   `src/index.html`).
3. Look up the matching ice element via `runtime.findIce(id)`. If not found
   → error `"No ice element found with id {id}."`.
4. If `entry.type === "glacier"` → error
   `"Glaciers cannot be resized; only icebergs."`.
5. Capture `old_size = entry.size`.
6. Call `runtime.changeIcebergSize(id, size)` (default impl:
   `window.Ice.changeIcebergSize`). This rescales `entry.points` and updates
   `entry.size` in place.
7. Call `runtime.redrawIceberg(id)` (default impl: `window.redrawIceberg`).
   The editor's `changeSize()` calls both, and `Ice.changeIcebergSize` does
   *not* invoke `redrawIceberg` itself (unlike `Ice.addIceberg`), so we must
   call it.
8. Return `okResult({ id, old_size, new_size: size })`.

## Range rationale

The slider in `src/index.html` line 3086 has `min=".05"` and `max="2"`. The
AI tool mirrors that range exactly so an agent cannot place an iceberg with
a size that the human-facing editor would refuse. Sizes below `0.05`
produce icebergs that are essentially invisible; sizes above `2` exceed the
cell polygon and look broken.

## Files

- **New**: `src/ai/tools/set-iceberg-size.ts`
- **New**: `src/ai/tools/set-iceberg-size.test.ts`
- **Modified**: `src/ai/index.ts` — three line additions:
  - import alphabetically near other `set-*` imports (around line 250)
  - re-export block
  - `registry.register(setIcebergSizeTool);` near other registrations

## Schema

```jsonc
{
  "name": "set_iceberg_size",
  "description": "Resize an iceberg by id, mirroring the Edit Ice dialog's size slider (public/modules/ui/ice-editor.js#changeSize). Delegates to Ice.changeIcebergSize, which rescales the iceberg's polygon points around its cell center, then triggers redrawIceberg(id) so the change shows up on the map. Glaciers cannot be resized — pass an iceberg id only. Size is the new multiplier in [0.05, 2] (matching the slider in src/index.html).",
  "input_schema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "integer",
        "minimum": 0,
        "description": "Iceberg id (matches pack.ice[*].i)."
      },
      "size": {
        "type": "number",
        "minimum": 0.05,
        "maximum": 2,
        "description": "New size multiplier. Must be in [0.05, 2]."
      }
    },
    "required": ["id", "size"]
  }
}
```

## Validation rules and error cases

| Condition | Error message |
| --- | --- |
| `id` missing / undefined / null | `"id is required."` |
| `id` not a number / NaN / ±Infinity / float / negative | `"id must be a non-negative integer."` |
| `size` missing | `"size is required."` |
| `size` not a finite number / NaN / ±Infinity / non-number / `<= 0` | `"size must be a finite number in [0.05, 2]."` |
| `size` outside [0.05, 2] | `"size must be a finite number in [0.05, 2]."` |
| `pack` missing | `"pack is not available."` |
| `pack.ice` missing / not an array | `"pack.ice is not available."` |
| No matching ice element | `"No ice element found with id {id}."` |
| Element exists, `type === "glacier"` | `"Glaciers cannot be resized; only icebergs."` |
| `Ice.changeIcebergSize` not a function | `"Ice.changeIcebergSize is not available yet; wait for the map to finish loading."` |
| `redrawIceberg` not a function | `"redrawIceberg is not available yet; wait for the map to finish loading."` |
| `Ice.changeIcebergSize` throws | thrown error message forwarded |
| `redrawIceberg` throws | thrown error message forwarded |

## Runtime-injection seam

```ts
export interface SetIcebergSizeIceRef {
  i: number;
  type: "glacier" | "iceberg";
  size: number;
}

export interface SetIcebergSizeRuntime {
  /** Look up an ice element by id; null if not present. Throws when pack/pack.ice missing. */
  findIce(id: number): SetIcebergSizeIceRef | null;
  /** Mirrors window.Ice.changeIcebergSize. */
  changeIcebergSize(id: number, size: number): void;
  /** Mirrors window.redrawIceberg. */
  redrawIceberg(id: number): void;
}

export const defaultSetIcebergSizeRuntime: SetIcebergSizeRuntime;

export function createSetIcebergSizeTool(
  runtime?: SetIcebergSizeRuntime,
): Tool;
export const setIcebergSizeTool: Tool;
```

`defaultSetIcebergSizeRuntime`:
- `findIce(id)` reads `pack.ice` via `getPack()`; returns
  `{ i, type, size }` (size coerced from `entry.size`, defaulting to `0`
  when not a number — should not happen for icebergs but guards against bad
  data); throws when pack / pack.ice are missing.
- `changeIcebergSize(id, size)` looks up `window.Ice.changeIcebergSize`;
  throws if unavailable; calls it.
- `redrawIceberg(id)` looks up `window.redrawIceberg`; throws if
  unavailable; calls it.

## Wiring (`src/ai/index.ts`)

Add three lines, all near the existing `set-*` neighbours:

```ts
// Imports block (alphabetical):
import { setIcebergSizeTool } from "./tools/set-iceberg-size";

// Re-export block:
export {
  createSetIcebergSizeTool,
  defaultSetIcebergSizeRuntime,
  type SetIcebergSizeIceRef,
  type SetIcebergSizeRuntime,
  setIcebergSizeTool,
} from "./tools/set-iceberg-size";

// Registration block:
registry.register(setIcebergSizeTool);
```

## Tests (Vitest)

Tests live in `src/ai/tools/set-iceberg-size.test.ts`. They cover both an
injected-runtime path and the default runtime against `globalThis` stubs.

1. **Happy path**: pack.ice has `{i:7, type:"iceberg", size:1}`. Resize to
   0.5 → `entry.size === 0.5`; result `{ok:true, id:7, old_size:1,
   new_size:0.5}`; `changeIcebergSize` called once with `(7, 0.5)`;
   `redrawIceberg` called once with `(7)`.
2. **Boundary 0.05** accepted.
3. **Boundary 2** accepted.
4. **Out-of-range**: 0.04, 2.01, 0, -1, 100 all rejected with allowed
   range named ("[0.05, 2]") in the error.
5. **Non-finite size**: NaN, Infinity, -Infinity, "1", null rejected.
6. **Glacier id rejected**: pack.ice has `{i:0, type:"glacier"}`; tool
   rejects with `"Glaciers cannot be resized; only icebergs."`;
   `changeIcebergSize` not called; `redrawIceberg` not called.
7. **Unknown id** → error `"No ice element found with id 99."`; not called.
8. **Non-integer id** (1.5, NaN, Infinity, string, neg) → error.
9. **Missing pack.ice** → error.
10. **`changeIcebergSize` throws** → error forwarded; `redrawIceberg` not
    called.
11. **`redrawIceberg` throws** → error forwarded.
12. **Default runtime: happy path** with `globalThis.pack`, `globalThis.Ice`,
    `globalThis.redrawIceberg` stubs — confirms round-trip and that
    `entry.size` was updated by the stub.
13. **Default runtime: missing `Ice`** → error mentions
    `Ice.changeIcebergSize`.
14. **Default runtime: missing `Ice.changeIcebergSize`** → error mentions
    same.
15. **Default runtime: missing `redrawIceberg`** → error mentions
    `redrawIceberg`.
16. **Default runtime: missing pack.ice** → error mentions `pack.ice`.
17. **Tool name + registry round-trip**: `setIcebergSizeTool.name ===
    "set_iceberg_size"`, reachable via `buildDefaultRegistry`.

Tests stash and restore `globalThis.pack`, `globalThis.Ice`, and
`globalThis.redrawIceberg` in `beforeEach` / `afterEach` to avoid leaking
between cases.

## Self-review

Re-read plan + tasks. Notes:

1. **Range chosen as `[0.05, 2]`** — exact match for the slider's
   `min=".05"` / `max="2"`. Listed in plan and the error message names the
   range so an agent gets useful feedback on misuse.

2. **Two runtime calls, two seams**: the editor's `changeSize` calls both
   `Ice.changeIcebergSize` and `redrawIceberg`. The seam mirrors that. We
   call them sequentially with separate try/catches so a `redrawIceberg`
   failure surfaces a different error than a `changeIcebergSize` failure.
   The size mutation has already happened by the time `redrawIceberg` is
   called, so even if redraw fails, the data is consistent (just unrendered).
   We don't try to roll back — it's the same behaviour as the editor.

3. **`old_size` in result**: per spec, captured before the mutation so the
   result is meaningful even if the underlying entry has been re-mutated by
   another call between `findIce` and our return.

4. **Glacier rejection**: must happen *after* the lookup (so we know the
   element exists and what type it is) but *before* the call to
   `changeIcebergSize`. Tests assert `changeIcebergSize` was NOT called.

5. **Why `findIce` returns `null` for not-found, throws for missing pack**:
   so the tool can return `"No ice element found"` (a 404-ish error) vs
   `"pack.ice is not available"` (a setup error). Same pattern as `remove-ice`.

6. **Test for `changeIcebergSize` throws**: must also assert
   `redrawIceberg` was NOT called (we don't redraw on failure).

7. **Description mentions glaciers are not supported** — agents need to
   know up front, not after a failed call.

8. **No regression risk to lint**: new code uses only patterns already in
   use (typed `getGlobal`, kebab-case file name, double quotes, 2-space
   indent).
