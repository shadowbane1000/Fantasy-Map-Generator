# Plan 322 — `clear_relief_icons` AI tool

## Use case

The user wants the AI to be able to bulk-remove relief icons (the `<use>`
elements that render mountains, hills, trees, etc on the map),
matching the bulk-remove path in `removeIcon` in
`public/modules/ui/relief-editor.js`:

```js
const type = reliefIconsDiv.querySelector("svg.pressed")?.dataset.type;
selection = type
  ? terrain.selectAll("use[href='" + type + "']")
  : terrain.selectAll("use");
selection.remove();
```

User flow (legacy UI): open Edit Relief Icons → enter Bulk Remove mode →
choose a type or "any" → click Remove → all matching icons are gone.
The AI currently has no relief tools, so this is the first.

## Lint baseline (master @ 5c7fe25, before plan-322 changes)

```
npm run lint 2>&1 | tail -40
```

Result: clean apart from 7 pre-existing warnings + 1 info, all in
unrelated files (`src/renderers/draw-heightmap.ts`,
`src/modules/provinces-generator.ts`,
`src/modules/emblem/generator.ts`,
`src/modules/military-generator.ts`). No `clear-relief-icons.ts`
exists yet. Goal: do not regress this — i.e. don't add new warnings.

## Behavior (exact)

- Tool name: `clear_relief_icons`.
- Input: optional `type` string. Format: include the leading `#`
  (e.g. `"#relief-mount-1"`) to match the `href` attribute exactly,
  matching the legacy code's selector form. If omitted, removes ALL
  relief icons.
- Effect:
  1. Validate input.
  2. Locate the terrain root: try `window.terrain.node()` first (the
     D3 selection's underlying `<g>` element); fall back to
     `document.getElementById("terrain")`.
  3. If neither, error.
  4. Query all matching `<use>` elements:
     - With `type`: `Array.from(root.querySelectorAll('use[href="#..."]'))`
       (mirrors the legacy `terrain.selectAll("use[href='" + type + "']")`).
     - Without `type`: `Array.from(root.querySelectorAll('use'))`.
  5. Capture `removed_count = matches.length` BEFORE removing.
  6. Call `.remove()` on each match.
- Return: `okResult({ type, removed_count })` where
  `type` is the string passed in, or `null` if omitted.

## Validation / errors

- `type` provided but not a string → error: "type must be a string."
- `type` provided but does not start with `#` → error:
  "type must start with '#' (e.g. '#relief-mount-1')."
- Both `window.terrain` and `#terrain` missing → error: "Terrain layer
  is not available; the map hasn't finished loading."
- (Whitespace-only `type` after the `#` is allowed — the legacy editor
  doesn't validate the hash content; if the selector matches nothing,
  we just return `removed_count: 0`. We don't try to be cleverer than
  the legacy UI here.)

Non-destructive cases (empty terrain, type matching nothing) are NOT
errors; they return `{ ok: true, type, removed_count: 0 }`.

## Why the leading `#` constraint

The legacy editor stores the type with a leading `#` in
`data-type="#relief-mount-1"` and slots it into the selector
unmodified: `terrain.selectAll("use[href='" + type + "']")`. So the AI
receives the same form the legacy UI uses. Documenting and enforcing
the constraint avoids a silent "no match" when the model passes
`"relief-mount-1"` instead.

## Why DOM-only

Verified in `src/types/PackedGraph.ts`: there is no
`pack.cells.icons`, `pack.icons`, or similar — relief icons are placed
at render time and dragged from there, so they live entirely in the
SVG. Removing them is a DOM-only operation and does NOT need to touch
`pack`.

## Files

- `src/ai/tools/clear-relief-icons.ts` (new)
- `src/ai/tools/clear-relief-icons.test.ts` (new)
- `src/ai/index.ts` — wire registration & re-export.

## Wiring

- Import `clearReliefIconsTool` near `clearRulersTool`.
- Re-export `{ clearReliefIconsTool, createClearReliefIconsTool }` near
  the existing `clear-rulers` re-export block.
- Register via `registry.register(clearReliefIconsTool)` near the
  existing `registry.register(clearRulersTool)` line.

## Runtime-injection seam (per task spec)

```ts
export interface ClearReliefIconsRuntime {
  /**
   * Returns the SVG `<g id="terrain">` element (or any
   * `Element`-like object exposing `querySelectorAll`) — the root
   * under which relief icons are placed. Returns null when the layer
   * isn't available yet.
   */
  getTerrainRoot(): Element | null;
}

export const defaultClearReliefIconsRuntime: ClearReliefIconsRuntime;
export function createClearReliefIconsTool(
  runtime?: ClearReliefIconsRuntime,
): Tool;
export const clearReliefIconsTool: Tool;
```

The default runtime tries `window.terrain.node()` first (D3 selection
exposes its underlying DOM node via `.node()`), then falls back to
`document.getElementById("terrain")`.

## Test cases (Vitest)

1. Happy path no filter: `<g id="terrain">` with 5 `<use>` children
   (3 mountain, 2 hill) → `clear` → all 5 removed; result reports
   `type: null, removed_count: 5`.
2. Happy path with filter: `type: "#relief-mount-1"` → only the 3
   mountain `<use>` removed; non-matching icons untouched; result
   `type: "#relief-mount-1", removed_count: 3`.
3. Empty terrain: 0 matches; success; `removed_count: 0`.
4. Type matches no icons: success; `removed_count: 0`.
5. `type` provided without leading `#` → error mentions `'#'`.
6. `type` non-string (number, boolean, object) → error.
7. Both `window.terrain` and `#terrain` missing → error.
8. Default runtime end-to-end: stub `<g id="terrain">` with `<use>`
   children in a fake DOM (or use `globalThis.document`/`window`
   stubs the same way `clear-rulers.test.ts` does), invoke
   `clearReliefIconsTool.execute({})`, verify children are gone.
9. Default runtime when `window.terrain` is missing but `#terrain`
   exists → still works (falls back via `document.getElementById`).
10. Default runtime when neither exists → error.
11. Tool name + registry round-trip (`tool.name === "clear_relief_icons"`,
    `createClearReliefIconsTool()` round-trip).

## Description copy (for the LLM)

Mention:
- "Permanently removes relief icons from the map" (destructive).
- Optional `type` filter (with `#` prefix).
- Returns `{ ok, type, removed_count }`.
- This is DOM-only — does not touch `pack`.

## Self-review

- Plan + tasks consistent: both name the tool `clear_relief_icons`,
  both list the same files, both list the same test cases.
- Validation order in `execute`: check `type !== undefined` first,
  then `typeof !== "string"` → error, then `!startsWith("#")` →
  error. This avoids passing non-string values into `startsWith`.
- Runtime seam matches the task spec: `getTerrainRoot(): Element | null`,
  default tries `window.terrain.node()` first, falls back to
  `document.getElementById("terrain")`. Errors only when both fail.
- DOM operations: since `getTerrainRoot()` returns an `Element`, the
  tool uses `root.querySelectorAll('use[href="#..."]')` and
  `root.querySelectorAll('use')`, then `.remove()` per node. This is
  the semantic equivalent of the legacy `terrain.selectAll(...).remove()`.
- Idempotent / non-destructive cases (empty terrain, filter matches
  nothing) are NOT errors — return `removed_count: 0`. Aligns with
  the task spec (`removed_count: 0; success`).
- `type: null` in the response when the input was omitted — captured
  in plan and in test #1.
- Registry round-trip test will assert `tool.name === "clear_relief_icons"`
  and that the registered tool instance is the same as the exported
  singleton (consistent with how plan 287 did it for
  `remove_route_group`).
- No `pack` mutation needed (verified relief icons are pure SVG state
  per `src/types/PackedGraph.ts`). Documented in plan.
- Description copy will mention "permanently removes", matching the
  task spec's note about destructive operations.
- No regressions expected to lint baseline (no new files touch the
  warning sites listed above).
- Commit hygiene: stage only the three source files + two plan docs.
  Skip `.claude/`, `current-ralph-loop.prompt`, and the pre-existing
  dirty `src/ai/chat-controller.ts`.
