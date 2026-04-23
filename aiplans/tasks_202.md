# Tasks 202 — `list_marker_pins`

## 1. Runtime file

Create `src/ai/tools/list-marker-pins.ts`:

- Import `MARKER_PIN_SHAPES` from `./set-marker-pin` (no re-export).
- Define `MarkerPinEntry` interface `{ id: string; name: string }`.
- Define `MarkerPinListRuntime` interface with
  `readPinIds(): readonly string[]`.
- Implement `defaultMarkerPinListRuntime` — returns `MARKER_PIN_SHAPES`.
- Implement `createListMarkerPinsTool(runtime)` returning a `Tool` that:
  - Takes no input (empty `properties`, no `required`).
  - Returns `okResult({ pins, count })`.
  - Preserves the order supplied by `runtime.readPinIds()`.
- Export `listMarkerPinsTool = createListMarkerPinsTool()`.

## 2. Test file

Create `src/ai/tools/list-marker-pins.test.ts`:

- `describe("list_marker_pins tool", …)` covering:
  - returns the 13 canonical pins in canonical order with `builtin`-style
    defaults (`id === name`).
  - `count` matches `pins.length`.
  - accepts `{}`, `null`, `undefined` as input.
  - respects a stubbed runtime (custom order / subset).
  - throwing runtime propagates (ToolRegistry wraps at a higher level).
- `describe("defaultMarkerPinListRuntime (integration)", …)` that exercises
  the real `listMarkerPinsTool` — no globals to stub. Use
  `as unknown as { ... }` casts only if parsing the result body requires
  them (match `list-style-presets.test.ts` style).

## 3. Register

Edit `src/ai/index.ts`:

- Add import for `listMarkerPinsTool` alphabetically between
  `listHeightmapTemplatesTool` and `listMarkersTool`.
- Add an `export {…}` block re-exporting `createListMarkerPinsTool`,
  `defaultMarkerPinListRuntime`, `listMarkerPinsTool`, and the types
  `MarkerPinEntry` / `MarkerPinListRuntime` — placed alphabetically between
  the `list-heightmap-templates` and `list-markers` re-export blocks.
- Add `registry.register(listMarkerPinsTool);` inside
  `buildDefaultRegistry()` near `listStylePresetsTool` (other discovery
  tools) OR next to `setMarkerPinTool` (for proximity); prefer right after
  `setMarkerPinTool` to keep marker-related tools grouped.

## 4. README row

Edit `README_AI.md`: add a row immediately after the `set_marker_pin` row
describing `list_marker_pins`, mirroring the tone of `list_style_presets`.
Include the "Requires an Anthropic API key (see 'Getting an API key'
below)." suffix and 2–3 example prompts.

## 5. Verify

- `npm run build`
- `npm test`
- `npm run lint 2>&1 | tail -5` — must match baseline (7 warnings / 1 info
  / 0 errors).

## 6. Commit

Stage:

- `aiplans/plan_202.md`
- `aiplans/tasks_202.md`
- `src/ai/tools/list-marker-pins.ts`
- `src/ai/tools/list-marker-pins.test.ts`
- `src/ai/index.ts`
- `README_AI.md`

Commit message: `feat(ai): add list_marker_pins tool` with 1–2 line body
explaining the discovery-companion purpose for `set_marker_pin`.
