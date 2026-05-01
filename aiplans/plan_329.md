# Plan 329 — `regenerate_relief_icons` AI tool

## Use case

Add an AI chat tool `regenerate_relief_icons` that wipes the existing
relief icon overlay (mountains, hills, trees, swamps, cacti, etc.) and
re-procedurally-places them based on the current heightmap and biome
data. This mirrors the legacy `regenerateIcons` function in
`public/modules/ui/biomes-editor.js` (line 325):

```js
function regenerateIcons() {
  drawReliefIcons();
  if (!layerIsOn("toggleRelief")) toggleRelief();
}
```

The same operation is also bound to the "Regenerate Relief Icons"
button in `public/modules/ui/tools.js` (lines 81-83):

```js
} else if (button === "regenerateReliefIcons") {
  drawReliefIcons();
  if (!layerIsOn("toggleRelief")) toggleRelief();
}
```

`window.drawReliefIcons` is defined in
`src/renderers/draw-relief-icons.ts` (line 164:
`window.drawReliefIcons = reliefIconsRenderer`). It clears the
`<g id="terrain">` SVG group, then iterates every land cell, places
relief icons procedurally based on biome density and Poisson-disc
sampling, and writes them as `<use>` elements into `terrain`.

We already have the relief-icon family:
- `add_relief_icon` (plan 324) — adds a single icon at a position
- `count_relief_icons` (plan 323)
- `clear_relief_icons` (plan 322)

This plan adds the missing **regenerate** action — wipes and re-rolls
all of them at once. Useful for the AI to refresh the relief overlay
after biome / heightmap edits.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-329 && npm run lint 2>&1 | tail
-50` on the worktree base (master @ ecc699a,
`plan-329-regenerate-relief-icons` branch, working tree clean) reports
a clean baseline:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 761 files in 611ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** We must not regress this — any new
warning is a fail.

## Behavior

- Tool name: `regenerate_relief_icons`.
- Input: none. The schema is `{ type: "object", properties: {} }`
  (no `required` field).
- Effect:
  1. Locate the terrain SVG root (D3 selection's `.node()`, fall back
     to `document.getElementById("terrain")`).
  2. If terrain is missing → error.
  3. Locate `window.drawReliefIcons`. If missing → error.
  4. Count `<use>` elements currently under terrain → `previous_count`.
  5. Call `drawReliefIcons()`. The renderer wipes terrain (`terrain.selectAll("*").remove()`)
     and re-populates it.
  6. Count `<use>` elements after regeneration → `count`.
  7. Return `okResult({ ok: true, previous_count, count })`.
- We do **NOT** auto-toggle the relief layer. The two legacy entry
  points (`regenerateIcons` in biomes-editor + `regenerateReliefIcons`
  branch in tools.js) both call `if (!layerIsOn("toggleRelief"))
  toggleRelief()` after `drawReliefIcons()`. This tool deliberately
  does not — it keeps the side-effect narrow and predictable. The AI
  can call `set_layer_visibility` separately if it wants the layer on.
  Documented in the description.

## Why count BEFORE wipe

The `previous_count` field reads the number of `<use>` elements the
moment we enter the tool. We must capture this BEFORE calling
`drawReliefIcons` (which begins with `terrain.selectAll("*").remove()`
— see `src/renderers/draw-relief-icons.ts` line 19). Capturing after
would always report 0. The post-call `count` reports the freshly
generated number. The delta lets the LLM see whether the regeneration
materially changed the overlay (e.g. it ran on an empty map, or the
biome/heightmap state means very few icons get placed).

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No fields, no `required`.

## Validation / errors

- `terrain` global / `#terrain` element both missing → error:
  `"terrain SVG layer is not available."`
- `window.drawReliefIcons` missing or not a function → error:
  `"window.drawReliefIcons is not available."`
- `drawReliefIcons` throws at runtime → propagated via
  `errorResult(err instanceof Error ? err.message : String(err))`.

## Success result

```json
{
  "ok": true,
  "count": 1234,
  "previous_count": 856
}
```

- `previous_count` — number of `<use>` elements under terrain BEFORE
  `drawReliefIcons()` was called.
- `count` — number of `<use>` elements AFTER the call.

## Files

- **New** `src/ai/tools/regenerate-relief-icons.ts` — the tool.
  Exports:
  - `interface RegenerateReliefIconsRuntime` — two methods:
    - `getTerrainRoot(): Element | null` — same shape as the sibling
      relief tools (`AddReliefIconRuntime`, `ClearReliefIconsRuntime`,
      `CountReliefIconsRuntime`). Returns `null` when the terrain
      isn't available.
    - `regenerate(): void` — invoke `window.drawReliefIcons()`. May
      throw if the global is missing or the renderer itself errors.
  - `defaultRegenerateReliefIconsRuntime` — `getTerrainRoot` mirrors
    the sibling tools (try `window.terrain.node()` then
    `document.getElementById("terrain")`); `regenerate` looks up
    `globalThis.drawReliefIcons` and throws
    `"window.drawReliefIcons is not available."` if it isn't a
    function.
  - `createRegenerateReliefIconsTool(runtime?)` — factory.
  - `regenerateReliefIconsTool` — eager default instance.

  The tool's `execute`:
  1. Resolves `runtime.getTerrainRoot()`. If `null`, returns
     `errorResult("terrain SVG layer is not available.")`.
  2. Counts `<use>` elements under root → `previous_count`.
  3. Wraps `runtime.regenerate()` in try/catch — on throw, returns
     `errorResult(err.message)`.
  4. Resolves the terrain root again (to be defensive against the
     renderer recreating the node) — falls back to the original root
     if the post-call resolution returns `null`.
  5. Counts `<use>` elements again → `count`.
  6. Returns `okResult({ count, previous_count })`.

- **New** `src/ai/tools/regenerate-relief-icons.test.ts` — Vitest
  spec (see Tests below).

- **Modify** `src/ai/index.ts`:
  - Add `import { regenerateReliefIconsTool } from
    "./tools/regenerate-relief-icons";` alphabetically between
    `regenerateRegimentNamesTool` and `regenerateReligionNamesTool`
    (i.e. between lines 190-191).
  - Add a re-export block exporting `createRegenerateReliefIconsTool`,
    `defaultRegenerateReliefIconsRuntime`,
    `RegenerateReliefIconsRuntime`, `regenerateReliefIconsTool`,
    placed alphabetically between `regenerate-regiment-names` and
    `regenerate-religion-names`.
  - Add `registry.register(regenerateReliefIconsTool);` in
    `createDefaultRegistry()` adjacent to the existing
    `registerReliefIconsTool`/`registerZonesTool` cluster — placed
    after `registry.register(regenerateZonesTool);` (line 2924) and
    before `registry.register(clearReliefIconsTool);` (line 2925), so
    the relief-family registrations stay grouped.

## Tests (Vitest)

Mirror the layout of `regenerate-zones.test.ts` and
`regenerate-emblems.test.ts`:

### Tool metadata

1. **Name + schema**: `tool.name === "regenerate_relief_icons"`;
   `input_schema.type === "object"`; `input_schema.properties` is an
   empty object; `input_schema.required` is undefined.
2. **Description mentions key concepts**: "regenerate", "relief",
   `drawReliefIcons`.
3. **`createRegenerateReliefIconsTool` round-trip**: produces an
   equivalent tool to the eager `regenerateReliefIconsTool`.
4. **Registry round-trip**: register → `toAnthropicSchemas()`
   includes a schema with name `"regenerate_relief_icons"`.

### Stub-runtime tests (factory + injected runtime)

5. **Happy path**: stub runtime exposes a fake terrain root with 5
   `<use>` children initially. `regenerate()` mutates the root in
   place: removes the existing 5 and adds 8 new `<use>` children.
   Tool returns `{ ok: true, previous_count: 5, count: 8 }`.
   Verifies `regenerate()` was called exactly once, AND that
   `previous_count` was captured BEFORE the regenerate side-effect
   ran (this is the load-bearing assertion: we test that
   `previous_count` is 5, not 0).
6. **Empty terrain → empty regenerate**: stub root starts with 0
   `<use>`; `regenerate()` adds 0. Result: `previous_count: 0,
   count: 0`. (Not an error — a freshly cleared map regenerated
   into nothing is valid.)
7. **Empty terrain → non-empty regenerate**: previous_count 0,
   regenerate adds 12. Result: `previous_count: 0, count: 12`.
8. **Non-empty terrain → empty regenerate**: previous_count 4,
   regenerate clears all and adds none. Result: `previous_count:
   4, count: 0`.
9. **Errors when getTerrainRoot returns null**: error message
   matches `/terrain SVG layer is not available/`. Verifies
   `regenerate()` was NOT called.
10. **Surfaces runtime errors thrown by `regenerate()`**: stub
    `regenerate` throws `Error("window.drawReliefIcons is not
    available.")`. Tool returns `isError: true`, message contains
    `drawReliefIcons`.
11. **Surfaces non-Error throws**: stub `regenerate` throws the
    string `"boom"`. Tool returns `isError: true`, error
    `=== "boom"`.

### Default-runtime integration (`globalThis`)

12. **Happy path through `globalThis.terrain` (D3-selection
    shape)**: stub `terrain.node()` returns a fake root with 3
    `<use>` children. Stub `globalThis.drawReliefIcons` mutates the
    fake root: clears existing children and adds 7 new ones. Result:
    `previous_count: 3, count: 7`. Verifies `drawReliefIcons` was
    called once.
13. **Falls back to `document.getElementById("terrain")` when
    `globalThis.terrain` is missing**.
14. **Errors when `globalThis.drawReliefIcons` is missing**:
    `globalThis.drawReliefIcons = undefined`; tool returns error
    matching `/drawReliefIcons/`.
15. **Errors when `globalThis.drawReliefIcons` is not a function**:
    e.g. set to `"hello"`; tool returns error matching
    `/drawReliefIcons/`.
16. **Errors when neither `globalThis.terrain` nor `#terrain`
    element exists**: error matches `/terrain/`.
17. **`defaultRegenerateReliefIconsRuntime.getTerrainRoot()` returns
    null when nothing is present** (parity with neighbouring
    `defaultClearReliefIconsRuntime`/`defaultCountReliefIconsRuntime`
    coverage).

## Verification

- `npm test` — all green.
- `npm run lint 2>&1 | tail -50` — still 0 warnings, 0 info, 0
  errors. No new noise.
- `npx tsc --noEmit` — clean.

## Self-review

Reviewed the plan + tasks against the use case after writing both:

- **Use case alignment**: the only side-effect of the legacy
  `regenerateIcons` (biomes-editor) and the
  `regenerateReliefIcons` button (tools.js) that this tool reproduces
  is `drawReliefIcons()`. The toggleRelief side-effect is
  intentionally omitted — documented in §Behavior with rationale
  ("keep the side-effect narrow and predictable; AI can call
  `set_layer_visibility` if it wants the layer on"). This matches
  the user's recommendation in the brief.
- **`previous_count` captured before regenerate**: spelled out
  TWICE — in §Behavior step 4-6 and in §Why count BEFORE wipe. Test
  §5 has a load-bearing assertion (`previous_count` is the
  pre-regenerate count, not the post-regenerate count which would
  be 8 — different number, so a buggy implementation would fail).
- **Error message tone**: `"terrain SVG layer is not available."`
  is shorter than the sibling `clear_relief_icons` /
  `count_relief_icons` error
  (`"Terrain layer is not available; the map hasn't finished loading."`).
  The brief's stated requirement is the terse form, so we keep it
  terse — consistent with the brief's spec, slightly diverging from
  the verbose siblings. Justified per the brief: "Keep error
  messages terse and consistent with existing relief-icon tools" —
  the brief itself prescribes the exact short-form text.
- **Field naming**: `previous_count` / `count` (snake_case) matches
  the JSON-schema convention. `count_relief_icons` returns
  `total` / `by_type` (snake_case-ish), `clear_relief_icons` returns
  `removed_count` (snake_case). Snake_case matches.
- **Runtime seam**: two methods (`getTerrainRoot`, `regenerate`).
  The sibling read/write tools (`clear_relief_icons`,
  `count_relief_icons`, `add_relief_icon`) all use a
  `getTerrainRoot()` runtime. We match this. The `regenerate()`
  method abstracts `window.drawReliefIcons()` so tests can inject a
  fake that mutates the same fake terrain root → `previous_count`
  vs. `count` are observable end-to-end via the same root that
  `getTerrainRoot()` returns. This is what makes the
  load-bearing-order test (§5) actually meaningful.
- **Re-resolving terrain root after regenerate**: §Files step 4
  notes that we re-call `getTerrainRoot()` after `regenerate()` and
  fall back to the original root if the new resolution returns
  null. This is defensive — the legacy renderer doesn't recreate
  the `<g id="terrain">` node, so in practice the same root will be
  returned. But re-resolving is cheap and means a future renderer
  change wouldn't silently break the count.
- **Wiring (alphabetical)**: `regenerate-relief-icons` slots between
  `regenerate-regiment-names` and `regenerate-religion-names`. (The
  letter sequence: `reg`enerate-`re`g..., `reg`enerate-`re`l...,
  `reg`enerate-`re`l-i, `reg`enerate-`re`l-n. So
  `regiment` < `relief-icons` < `religion-names`. Confirmed.)
  Registration is grouped with the relief-family in
  `createDefaultRegistry()` immediately after
  `regenerateZonesTool` and before `clearReliefIconsTool`.
- **`getTerrainRoot` typing**: returns `Element | null`. We rely on
  `Element.querySelectorAll`, which is universal. Tests provide
  a minimal fake exposing only `querySelectorAll(selector)`, like
  the sibling tests.
- **No `pack` mutation**: relief icons are pure SVG state (verified
  in `src/types/PackedGraph.ts` per plan 322's notes). This tool
  triggers a renderer that touches only the SVG; `pack` is read by
  `drawReliefIcons` but not written. No save-format implications.
