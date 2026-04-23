# Plan 172 — `clear_rulers` tool

## Use case

Add a new AI tool `clear_rulers` that removes every distance-measurement
ruler / opisometer / planimeter currently placed on the map — the same
side-effect as the "Remove all rulers" action in the Units & Rulers
editor (`removeAllRulers` in `public/modules/ui/units-editor.js`).

The tool takes no parameters and returns `{ ok, cleared }`, where
`cleared` is the number of ruler entries that were removed.

## Target UI

From `public/modules/ui/units-editor.js:254-272`:

```js
function removeAllRulers() {
  if (!rulers.data.length) return;
  alertMessage.innerHTML = /* html */ ` Are you sure you want to remove all placed rulers?
    <br />If you just want to hide rulers, toggle the Rulers layer off in Menu`;
  $("#alert").dialog({
    resizable: false,
    title: "Remove all rulers",
    buttons: {
      Remove: function () {
        $(this).dialog("close");
        rulers.undraw();
        rulers = new Rulers();
      },
      Cancel: function () {
        $(this).dialog("close");
      }
    }
  });
}
```

The key effect: call `rulers.undraw()` (which iterates
`this.data.forEach(ruler => ruler.undraw())` and each ruler removes
its own SVG element via `this.el?.remove()`) then reset the ruler
collection.

## Why we can't just assign `rulers = new Rulers()`

The legacy UI holds `rulers` as a module-level `let` binding in
`public/main.js:145` (`let rulers = new Rulers();`), which allows
reassignment only from within the same script context. Our AI tool
runs from a bundled TS module that only sees the `window` global, so
it can read `window.rulers` but it cannot rebind the `let` in
`main.js`.

Instead, we mutate the existing `Rulers` instance in place:

1. Call `rulers.undraw()` — removes every ruler's DOM element
   (`Measurer.undraw()` calls `this.el?.remove()`).
2. Empty `rulers.data` (splice or `length = 0`) so the collection
   reflects the cleared state and the next
   `new Ruler()/Opisometer()/Planimeter()` gets id `0`.
3. Best-effort: also clear any leftover children in the `#ruler`
   SVG group (`Rulers` tracks DOM via per-ruler `this.el` refs; any
   stray node without a tracked ref would survive otherwise).

## Count source

`cleared` is sourced from `rulers.data.length` **before** we mutate
the collection. That is the number of rulers the user placed. Source
of truth matches what the UI's "remove all" dialog gates on
(`if (!rulers.data.length) return;`).

## API

- **Input**: no parameters. The schema is `{ type: "object", properties: {} }`.
- **Output**: `{ ok: true, cleared: number }` on success; `cleared` is
  `0` when there were no rulers (not an error — the tool is
  idempotent).

## Design decisions

- **Runtime-seam pattern**: identical to `regenerate_zones` —
  define a `ClearRulersRuntime` interface with a single `clearAll()`
  method that returns `{ cleared }`. The default implementation reads
  `window.rulers`, counts the data, calls `.undraw()`, empties
  `rulers.data`, and best-effort wipes leftover children in
  `#ruler`.
- **Error surface**: when `window.rulers` is missing or its
  `.undraw()` / `.data` shape is wrong (defensive), return
  `errorResult("Rulers is not available yet; the map hasn't finished loading.")`.
- **DOM fallback**: after mutating the collection, query
  `document.getElementById("ruler")` and, if found, remove every
  child node. This is a safety net — the measurer UI always tracks
  `this.el`, so normal operation won't have orphans, but loaded maps
  can contain ruler SVG that has no JS state (`Rulers.fromString`
  rebuilds data but only draws on the next `rulers.draw()`).
- **No params** — matches the UI button; no knob.

## Placement in README_AI.md

Insert alongside other general utility tools, close to
`regenerate_zones` (line 36) so map-wide utility tools stay grouped.

## Files

- `src/ai/tools/clear-rulers.ts` — new tool (runtime seam, factory,
  default export, `createClearRulersTool`, `defaultClearRulersRuntime`).
- `src/ai/tools/clear-rulers.test.ts` — vitest unit tests + integration
  block exercising `defaultClearRulersRuntime` against a stubbed
  `globalThis.rulers` and `document`.
- `src/ai/index.ts` — import, export, register the tool.
- `README_AI.md` — documentation row near `regenerate_zones`.

## Tests

Unit tests on the factory (matching the `regenerate_zones` test style):

1. Calls runtime and returns cleared count.
2. Idempotent — reports `cleared: 0` when `rulers.data` is empty.
3. Surfaces runtime errors (e.g. "Rulers is not available").
4. Input schema rejects extra properties gracefully (ignores them).

Integration block on `defaultClearRulersRuntime`:

1. Stub `globalThis.rulers` with `{ data: [{el: ...}, ...], undraw: vi.fn() }`
   and confirm `undraw` is called and data becomes `[]`.
2. Confirm the DOM `#ruler` group is emptied.
3. Confirm an absent `globalThis.rulers` produces a descriptive error.
