# Plan 2 — Use Case: Show / hide a map layer

## Status

Iteration 2 of the Ralph loop. Iteration 1 added the chat window
infrastructure, the Anthropic client with tool-use loop, and the
`set_map_name` tool. Baseline lint: 7 warnings / 1 info / 0 errors. All 80
unit tests pass.

## Use Case

**"Show or hide a named map layer via the AI chat."**

The Fantasy Map Generator's left-rail `#mapLayers` list has a toggle button
per layer (rivers, borders, states, provinces, ice, labels, routes,
burg icons, markers, religions, cultures, heightmap, biomes, relief icons,
emblems, military, zones, grid, coordinates, compass, texture, vignette,
scale bar, rulers, cells, temperature, precipitation, population). Clicking
a toggle runs the matching `toggle<Name>` function in
`public/modules/ui/layers.js`, which adds/removes SVG elements and toggles
the `buttonoff` class on the element.

A user would say things like:
- *"Turn off the rivers"*
- *"Show religions"*
- *"Hide the state borders"*

### Success criteria

1. A user with an API key can type `turn off rivers` in the chat and the
   `#toggleRivers` button element gains the `buttonoff` class, the rivers
   SVG `<g>` is cleared.
2. `show rivers` (when hidden) calls `toggleRivers()` to turn them back on.
3. If the layer is already in the requested state, the tool succeeds as a
   no-op and says so (idempotent).
4. Unknown layer names return a structured error listing supported layers
   so the model can re-prompt or clarify.

## Scope (this iteration)

In-scope:
- New tool `set_layer_visibility` with input `{layer: string, visible: boolean}`.
- Layer alias map: accepts friendly names (e.g. `"rivers"`, `"state borders"`)
  and normalizes to the `toggle<Name>` function name + the DOM button id.
- Register the tool in `buildDefaultRegistry` (`src/ai/index.ts`).
- Unit tests covering success, no-op, unknown layer, missing toggle function.
- README_AI.md: add to the tool table with example prompts.

Out-of-scope (future iterations):
- Bulk toggling / applying a named preset (political, cultural, etc.).
- Layer style edits (the Ctrl-click "edit style" behavior of the toggle).
- Queries about layer state ("what layers are on?").

## Design

New file: `src/ai/tools/set-layer-visibility.ts`.

```ts
interface LayerSpec { toggleFn: string; buttonId: string; aliases: string[]; }
const LAYERS: Record<string, LayerSpec> = {
  rivers: { toggleFn: "toggleRivers", buttonId: "toggleRivers",
            aliases: ["rivers", "river"] },
  borders: { toggleFn: "toggleBorders", buttonId: "toggleBorders",
             aliases: ["borders", "border", "state borders"] },
  states: { toggleFn: "toggleStates", buttonId: "toggleStates",
            aliases: ["states", "state"] },
  ...
};
```

The `layer` input is lowercased / trimmed and matched against a lookup map
built from the aliases. If found:

1. Read the current state via `window.layerIsOn(buttonId)` (or, if that
   helper isn't present, by inspecting
   `document.getElementById(buttonId).classList.contains("buttonoff")`).
2. If already in requested state, return `{ok: true, layer, visible,
   noop: true}`.
3. Otherwise call `window[toggleFn]()` (no event argument → regular toggle).
4. Return `{ok: true, layer, visible}`.

### Why not call the toggle blindly?

The real toggle functions flip state. Calling them when the layer is
already on/off would produce the wrong side-effect. Reading current state
first makes the tool idempotent, which matches LLM retry behavior and
makes the unit test deterministic.

### Injection seam

For testability the executor consults a thin `layerRuntime` interface:

```ts
interface LayerRuntime {
  isOn(buttonId: string): boolean;
  toggle(toggleFn: string): void;
}
```

The default runtime reads `window.layerIsOn` / `window[toggleFn]` from the
browser. Tests pass in a fake runtime with spies.

## Files

Create:
- `plan_2.md`, `tasks_2.md`
- `src/ai/tools/set-layer-visibility.ts`
- `src/ai/tools/set-layer-visibility.test.ts`

Modify:
- `src/ai/index.ts` (register tool)
- `README_AI.md` (tool table + example prompts)

## Testing plan

Unit (`src/ai/tools/set-layer-visibility.test.ts`):

1. `"rivers" visible=false` when layer is on → calls `toggleRivers`,
   returns `{ok: true, noop: false}`.
2. `"rivers" visible=true` when layer is already on → does NOT call
   `toggleRivers`, returns `{ok: true, noop: true}`.
3. Alias `"state borders"` maps to `toggleBorders`.
4. Unknown layer `"shadows"` → `{isError: true}`, content contains the list
   of supported layers.
5. `visible` must be boolean — non-boolean returns an error.
6. Case-insensitive matching: `"RIVERS"` works.
7. Empty / missing layer → error.

### Lint & build gates

`npm run lint` must end at the same baseline (7 warnings / 1 info / 0
errors). `npm run build` must succeed. All previous tests plus the new ones
must pass.

## Plan ↔ tasks ↔ tests verification

| Success criterion | Implementation | Test |
| ----------------- | -------------- | ---- |
| #1 turn off on   | Executor calls `toggleRivers` | Test 1 |
| #2 turn on       | Same, opposite direction     | inverse of Test 2 + Test 1 |
| #3 idempotent    | Runtime state check before toggle | Test 2 |
| #4 unknown error | Lookup returns null → structured error | Test 4 |

No additional infrastructure work is needed; the chat controller and
registry handle arbitrary new tools without modification.
