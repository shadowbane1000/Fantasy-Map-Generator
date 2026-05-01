# Plan 313 — `list_ice` AI tool

## Lint baseline (master / pre-change)

```
$ npm run lint 2>&1 | tail -40
Checked 724 files in 564ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

7 pre-existing warnings (all in `src/renderers/draw-heightmap.ts` — dynamic
namespace import access on `d3`) and 1 info note. **0 errors.** This is the
baseline; the new tool must not regress it.

## Use case

There is no single dropdown in the UI for "all ice elements" — the user
discovers ice by clicking on glaciers or icebergs on the map. The AI today has
`add_iceberg`, `remove_ice`, and the in-flight `set_iceberg_size` (plan 312),
but no way to list what already exists. Without a listing tool the AI can't
discuss the world's ice or identify candidates for those mutating tools.

`list_ice` provides that synthesis: read `pack.ice`, optionally filter by
`type`, and return a small per-entry summary. Once it exists, the AI can list
then act, mirroring the natural workflow for every other entity class
(states, burgs, routes, etc.).

## Exact behaviour

1. Read `pack.ice`. If `pack` is missing, error. If `pack.ice` is not an
   array, error.
2. Validate the optional `type` argument:
   - `undefined` / `null` / absent → no filter (return all).
   - `"glacier"` or `"iceberg"` (case-sensitive — matches the values used in
     `pack.ice[*].type` per `src/modules/ice.ts`) → filter to that type.
   - Anything else (e.g. `"snow"`, numbers, objects) → error.
3. Compute `total = pack.ice.length` BEFORE filtering.
4. Filter by `type` if provided.
5. Map each remaining entry to a small summary:
   - `id` = `entry.i`
   - `type` = `entry.type` (`"glacier"` or `"iceberg"`)
   - `cell_id` = `entry.cellId` if it's a finite number, else `null`
   - `size` = `entry.size` if it's a finite number, else `null`
   - `has_offset` = `true` iff `entry.offset` is an array (don't expose raw
     values to keep the schema small; treat malformed shapes as missing —
     never crash on them)
6. Preserve array order (don't re-sort).
7. Return `okResult({ count, total, items })` where `count = items.length`.

## Files

- **New**: `src/ai/tools/list-ice.ts`
- **New**: `src/ai/tools/list-ice.test.ts`
- **Modified**: `src/ai/index.ts` — three line additions:
  - import alphabetically near other `list-*` imports (between
    `list-heightmap-templates` and `list-label-groups`)
  - re-export block (between the `list-heightmap-templates` and
    `list-label-groups` re-export blocks)
  - `registry.register(listIceTool);` near other registrations

## Schema

```jsonc
{
  "name": "list_ice",
  "description": "List the ice elements (glaciers and icebergs) in pack.ice — there is no single dropdown for this in the UI, so this is how the AI discovers what ice exists for use with add_iceberg, remove_ice, and set_iceberg_size. Each entry reports id (matches pack.ice[*].i, not array index), type ('glacier' or 'iceberg'), cell_id (icebergs only; glaciers report null since IceModule.generate doesn't set one), size (iceberg multiplier; null for glaciers), and has_offset (true iff the user dragged the element so an offset is set). Entries are returned in pack.ice order. Optional type filter ('glacier' | 'iceberg'); omitted = both. Returns { count, total, items }, where total is the unfiltered pack.ice length.",
  "input_schema": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["glacier", "iceberg"],
        "description": "Optional filter: only return glaciers or only icebergs. Omit to return both."
      }
    }
  }
}
```

## Validation rules and error cases

| Condition | Error message |
| --- | --- |
| `pack` missing | `"pack is not available."` |
| `pack.ice` missing / not an array | `"pack.ice is not available."` |
| `type` provided but not `"glacier"` / `"iceberg"` | `"type must be 'glacier' or 'iceberg'."` |

## Return shape

```ts
{
  ok: true,
  count: number,    // number of items returned (after filter)
  total: number,    // pack.ice.length, BEFORE filter
  items: Array<{
    id: number,
    type: "glacier" | "iceberg",
    cell_id: number | null,
    size: number | null,
    has_offset: boolean,
  }>
}
```

## Runtime-injection seam

```ts
export interface ListIceEntry {
  i: number;
  type: "glacier" | "iceberg";
  cellId?: number | null;
  size?: number | null;
  offset?: unknown;
}

export interface ListIceRuntime {
  /** Return the live pack.ice array, or null when pack/pack.ice is missing. */
  getIceArray(): readonly ListIceEntry[] | null;
}

export const defaultListIceRuntime: ListIceRuntime;
export function createListIceTool(runtime?: ListIceRuntime): Tool;
export const listIceTool: Tool;
```

`defaultListIceRuntime.getIceArray()` reads `pack` via `getPack()`. If
`pack` is `undefined` or `pack.ice` is not an array, returns `null`. The tool
turns that into the appropriate error message based on which is missing.

To distinguish "pack missing" vs "pack.ice missing" in the default error, the
tool's `execute` will call `getPack()` directly to check, then call
`runtime.getIceArray()` for the data. This keeps the runtime seam minimal
while preserving the differentiated error.

Actually — to keep tests clean and the runtime seam load-bearing, the runtime
will throw with the specific message for missing pack vs missing pack.ice,
matching the convention in `remove-ice.ts`. The default tool's execute then
catches and forwards.

Final shape:

```ts
export const defaultListIceRuntime: ListIceRuntime = {
  getIceArray() {
    const pack = getPack<IcePackLike>();
    if (!pack) {
      throw new Error("pack is not available.");
    }
    if (!Array.isArray(pack.ice)) {
      throw new Error("pack.ice is not available.");
    }
    return pack.ice;
  },
};
```

The tool's execute wraps it in try/catch and forwards the message via
`errorResult`.

## Wiring (`src/ai/index.ts`)

Add three lines, all near the existing `list-*` neighbours:

```ts
// Imports block (alphabetical, between list-heightmap-templates and list-label-groups):
import { listIceTool } from "./tools/list-ice";

// Re-export block (between list-heightmap-templates and list-label-groups):
export {
  createListIceTool,
  defaultListIceRuntime,
  type ListIceEntry,
  type ListIceRuntime,
  listIceTool,
} from "./tools/list-ice";

// Registration block (near other list-* registrations):
registry.register(listIceTool);
```

## Tests (Vitest)

Tests live in `src/ai/tools/list-ice.test.ts`. They drive an
injected-runtime path for most cases plus a default-runtime block that
stubs `globalThis.pack`.

1. **Happy path no filter**: pack.ice = [glacier, iceberg, iceberg] →
   count=3, total=3, items in pack.ice order.
2. **Filter type=glacier**: count=1, total=3, items contains only the
   glacier.
3. **Filter type=iceberg**: count=2, total=3, items contains the two
   icebergs.
4. **Empty pack.ice**: count=0, total=0, items=[].
5. **Glacier missing cellId / size**: cell_id and size are null in the
   result.
6. **Iceberg with offset present** (`offset = [1, 2]`): has_offset=true.
7. **Iceberg without offset**: has_offset=false.
8. **Iceberg with malformed offset** (`offset = "nope"`, `offset = 5`,
   `offset = {}`): has_offset=false. Tool does not crash.
9. **Invalid type filter** (e.g. `"snow"`, `42`, `{}`, empty string,
   uppercase `"Glacier"`): error.
10. **pack missing in default runtime**: error mentions `pack`.
11. **pack.ice not an array in default runtime**: error mentions `pack.ice`.
12. **Default runtime happy path** with stubbed `globalThis.pack = {ice: [...]}`:
    round-trips correctly.
13. **Tool name + registry round-trip**: the exported `listIceTool.name` is
    `"list_ice"` and the registry exposes it after registration.

Tests stash and restore `globalThis.pack` in `beforeEach` / `afterEach`.

## Self-review

Re-read plan and tasks. Notes:

1. **Why `total` is the unfiltered length, not array index range**: matches
   the spec. The AI can use `total` to know how many ice elements exist
   overall vs how many matched the filter.

2. **`has_offset` instead of raw offset**: spec mandates this for schema
   compactness. Treating "malformed offset" as `has_offset = false`
   guarantees no crashes if a `.map` file ever stores something unexpected.
   Per spec: "treat as missing".

3. **`cell_id` / `size` null for glaciers**: glaciers are generated without
   `cellId` or `size` (see `src/modules/ice.ts` lines 59-64). We coerce to
   `null` for stable JSON shape (undefined would drop the key).

4. **`cell_id` defensiveness**: only treat as a number when it's a finite
   number. If a `.map` file stored `cellId: "42"` for some reason, we
   report `null` rather than the raw string.

5. **`size` defensiveness**: same as `cell_id` — finite-number check, else
   `null`.

6. **`type` filter is case-sensitive**: matches the source-of-truth values
   used in `IceModule.generate` and `IceModule.addIceberg`. Unlike route
   groups, ice types are an internal data-model field; we don't need an
   alias resolver. The schema uses `enum` so the AI sees the exact values.

7. **No pagination**: the spec asks for `{ count, total, items }`, not
   pagination. Worlds rarely contain hundreds of ice elements (typically
   single digits to dozens); the response stays small.

8. **Error precedence**: `type` validation runs before reading `pack.ice`,
   so `list_ice {type: "snow"}` returns the type error even if pack is
   missing. This is consistent with how other tools order arg validation
   before runtime calls.

9. **Description references all three companion tools** (`add_iceberg`,
   `remove_ice`, `set_iceberg_size`) so the AI sees the full ice toolkit
   from any one of them.

10. **Module path / global**: nothing new — the tool only reads
    `window.pack`, going through `getPack()`. No `Ice` module dependency.

11. **No regression risk to lint**: file follows the same patterns as
    `remove-ice.ts`. 2-space indent, double quotes, kebab-case filename,
    typed runtime seam.
