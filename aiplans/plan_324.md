# Plan 324 — `add_relief_icon` AI tool

## Lint baseline (before changes)

```
Checked 748 files in 594ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

The 7 warnings/1 info come from pre-existing files (e.g.
`src/renderers/draw-heightmap.ts` `noDynamicNamespaceImportAccess`).
This tool must not regress past these counts.

## Use case

The Edit Relief Icons → Bulk Add UI lets the user select an icon type,
drag a brush over the map, and scatter icons at random positions in the
brush radius. The placement code lives in
`public/modules/ui/relief-editor.js` `dragToAdd` (around line 117). For
each icon dropped, it does:

```js
const h = rn((size / 2) * (Math.random() * 0.4 + 0.8), 2);
const x = rn(cx - h, 2);
const y = rn(cy - h, 2);
const s = rn(h * 2, 2);
terrain
  .insert("use", ":nth-child(" + nth + ")")
  .attr("href", type)
  .attr("x", x)
  .attr("y", y)
  .attr("width", s)
  .attr("height", s);
```

The AI tool collapses this to a single explicit placement: place ONE
icon of type `T` at `(cx, cy)` with size `S`. It is the creator
counterpart to the just-merged read tool `count_relief_icons` (plan 323)
and the destructive tool `clear_relief_icons` (plan 322).

## Behavior

Inputs:

- `type` (string, required) — full `href` value with leading `#`
  (e.g. `"#relief-mount-1"`). Same convention as `clear_relief_icons` /
  `count_relief_icons`.
- `x` (number, required) — center x in map space.
- `y` (number, required) — center y in map space.
- `size` (number, optional) — icon side-length in map units; default
  `5`. Range `[2, 50]`.

Computation (deterministic — no random scaling):

- `h = size / 2`.
- `x_attr = round2(x - h)`.
- `y_attr = round2(y - h)`.
- `width = round2(size)`.
- `height = round2(size)`.

(`round2(v) = Math.round(v * 100) / 100`. The legacy `dragToAdd` uses
`rn(v, 2)`, which is the same: round to 2 decimals.)

Effect: append a new `<use>` element under the terrain root with
attributes `href`, `x`, `y`, `width`, `height`.

Returns:

```json
{
  "ok": true,
  "type": "#relief-mount-1",
  "center": [100, 200],
  "size": 10,
  "attributes": { "x": 95, "y": 195, "width": 10, "height": 10 }
}
```

## Range rationale

The size range `[2, 50]` mirrors the legacy slider's `min="2"`,
`max="50"`, `value="5"` — see `src/index.html` ~line 3141:

```html
<input
  id="reliefSize"
  oninput="reliefSizeNumber.value = this.value"
  type="range"
  min="2"
  max="50"
  value="5"
/>
```

Default `5` matches the slider's default value.

## Divergence from the UI

1. **No water check.** `dragToAdd` skips cells with `pack.cells.h[...] < 20`.
   The AI/user is being explicit about placement; if they want a
   water-aware variant that's a future tool. Documented in the
   description.
2. **Deterministic size.** `dragToAdd` jitters via
   `(Math.random() * 0.4 + 0.8)` so each icon ends up between 80% and
   120% of the requested size. The AI tool drops the jitter so the
   caller always gets exactly the size they asked for.
3. **`append` instead of `insert(":nth-child(N)")`.** `dragToAdd` walks
   the existing icons by `bbox.y + bbox.height` to insert the new use
   in correct z-order. The AI tool just appends to the end — simpler,
   deterministic, and the user/AI can stack as they wish. Z-order can
   be patched later if needed.
4. **No spacing/quadtree check.** `dragToAdd` rejects placements that
   are too close to an existing icon. The AI tool trusts the caller.

## Schema

```ts
{
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "Relief icon type, with leading '#' (e.g. '#relief-mount-1').",
    },
    x: { type: "number", description: "Center x in map space." },
    y: { type: "number", description: "Center y in map space." },
    size: {
      type: "number",
      minimum: 2,
      maximum: 50,
      description: "Icon side-length in map units. Default 5. Range [2, 50].",
    },
  },
  required: ["type", "x", "y"],
}
```

## Files

- New: `src/ai/tools/add-relief-icon.ts`
  - `AddReliefIconRuntime` interface with a single
    `getTerrainRoot(): Element | null` method, mirroring
    `ClearReliefIconsRuntime` / `CountReliefIconsRuntime`.
  - `defaultAddReliefIconRuntime` — tries `window.terrain.node()` first,
    falls back to `document.getElementById("terrain")`.
  - `createAddReliefIconTool(runtime?)` — factory.
  - `addReliefIconTool` — eager default instance.
  - The tool's `execute` is responsible for the DOM append. The
    runtime's only job is to resolve the terrain root, matching the
    pattern of the sibling tools. (No need for an `appendUse` method:
    creating a child element with attributes is portable across DOM
    implementations and is what tests will verify.)

- New: `src/ai/tools/add-relief-icon.test.ts` (Vitest, node).

- Edit: `src/ai/index.ts`
  - Import `addReliefIconTool` next to `clearReliefIconsTool` /
    `countReliefIconsTool`.
  - Re-export `addReliefIconTool`, `createAddReliefIconTool`,
    `defaultAddReliefIconRuntime`, `AddReliefIconRuntime`.
  - Register in `createDefaultRegistry` near `clearReliefIconsTool` /
    `countReliefIconsTool`.

## DOM creation: SVG namespace handling

`<use>` is in the SVG namespace. Real browser code commonly relies on
the parent's namespace, but the spec way is `createElementNS`. Strategy:

- Resolve the owner document via `root.ownerDocument` (if present), else
  fall back to `globalThis.document`.
- Use `document.createElementNS("http://www.w3.org/2000/svg", "use")`
  when the document supports it; otherwise call
  `document.createElement("use")` (sufficient for the test fakes).

In tests we'll inject a minimal stub root that exposes `appendChild`
and the namespace-aware creation hooks via a tiny stub document, so the
tool's own DOM logic is exercised end-to-end.

## Error cases

- `type` missing or non-string → `"type must be a string."`
- `type` does not start with `#` →
  `"type must start with '#' (e.g. '#relief-mount-1')."`
- `x` non-finite → `"x must be a finite number."`
- `y` non-finite → `"y must be a finite number."`
- `size` non-finite or out of `[2, 50]` →
  `"size must be a finite number in [2, 50]."`
- Both `window.terrain` and `#terrain` element missing →
  `"Terrain layer is not available; the map hasn't finished loading."`
- `ownerDocument` missing AND no global `document` → cannot create the
  element → error: `"Document is not available to create <use>."`

## Test plan

Vitest tests cover:

1. Tool metadata: `name === "add_relief_icon"`, `required` includes
   `type`, `x`, `y` (and not `size`), description mentions relief and
   `<use>`.
2. `createAddReliefIconTool` produces an equivalent tool to the eager
   `addReliefIconTool` instance.
3. `ToolRegistry` round-trip — schema serializes via
   `toAnthropicSchemas()`.
4. Happy path with fake runtime: `type="#relief-mount-1"`, `x=100`,
   `y=200`, `size=10` → exactly one new `<use>` appended with
   `href="#relief-mount-1"`, `x="95"`, `y="195"`, `width="10"`,
   `height="10"`.
5. Default size: `size` omitted → uses `5`; `x_attr = x - 2.5`,
   `y_attr = y - 2.5`, `width = 5`, `height = 5`.
6. Boundary: `size = 2` and `size = 50` accepted.
7. Out-of-range size: `1.99`, `50.01`, `0`, `-1`, `100` rejected with a
   message naming `[2, 50]`.
8. Non-finite `size`/`x`/`y` rejected.
9. Decimal rounding: `x=100.123`, `size=5` → `x_attr` is `97.62`.
10. `type` without `#` → error.
11. `type` non-string → error.
12. Both `window.terrain` and `#terrain` element missing → error
    mentioning the terrain layer.
13. Default runtime end-to-end: with a minimal `globalThis.document`
    that provides `getElementById("terrain")` returning a fake root
    that supports `ownerDocument`/`createElementNS`/`appendChild`, the
    eager tool appends successfully.
14. `defaultAddReliefIconRuntime.getTerrainRoot()` returns `null` when
    nothing is present.

## Wiring

- Import alphabetically placed: `addReliefIconTool` already comes after
  `addReligionTool` and before `addRouteSegmentTool` in the tool
  imports/exports.
- Registration: register inside `createDefaultRegistry` near the other
  relief-icon tools so the cluster reads as a unit.

## Self-review checklist (run before commit)

- [ ] Plan and tasks files written.
- [ ] Implementation matches plan exactly (defaults, ranges, rounding).
- [ ] Description references the divergence from `dragToAdd` so the AI
      knows what NOT to expect.
- [ ] All listed tests are written and pass.
- [ ] `npm run lint` total counts unchanged (7 warnings, 1 info).
- [ ] `npx tsc --noEmit` is clean.
- [ ] Commit message: `feat(ai): add add_relief_icon tool`.
- [ ] Only `src/ai/tools/add-relief-icon.ts`,
      `src/ai/tools/add-relief-icon.test.ts`,
      `aiplans/plan_324.md`, `aiplans/tasks_324.md`, and the new lines
      in `src/ai/index.ts` are committed. `src/ai/chat-controller.ts`
      stays dirty and untouched.
