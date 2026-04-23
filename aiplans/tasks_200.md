# Tasks 200 — `list_style_presets`

## 1. Runtime file

Create `src/ai/tools/list-style-presets.ts`:

- Import `STYLE_PRESETS` from `./set-style-preset` (no re-export).
- Define `StylePresetEntry` interface `{ id: string; name: string; builtin: boolean }`.
- Define `StylePresetListRuntime` interface with `readCustomPresetIds(): string[]`.
- Implement `defaultStylePresetListRuntime` — reads `globalThis.localStorage`,
  collects keys starting with `fmgStyle_`, returns them sorted alphabetically;
  returns `[]` on any throw / missing `localStorage`.
- Implement `createListStylePresetsTool(runtime)` returning a `Tool` that:
  - Takes no input (empty properties object, no required fields).
  - Returns `okResult({ presets, count })`.
  - Always includes all 12 built-ins first, then custom sorted by id.
- Export `listStylePresetsTool = createListStylePresetsTool()`.

## 2. Test file

Create `src/ai/tools/list-style-presets.test.ts`:

- `describe("list_style_presets tool", …)` covering:
  - returns 12 built-ins when no custom
  - `count` matches length
  - `builtin: true` for each of the 12
  - custom presets appended with `builtin: false`, `name` stripped of prefix,
    sorted by id
  - accepts `{}`, `null`, `undefined` as input
  - runtime throw treated as `[]`
- `describe("defaultStylePresetListRuntime (integration)", …)` that stubs
  `globalThis.localStorage` using `as unknown as { ... }` casts — mirror the
  pattern from `list-heightmap-templates.test.ts`.
  - include an unrelated key to confirm prefix filter
  - include at least two `fmgStyle_*` keys to confirm ordering

## 3. Register

Edit `src/ai/index.ts`:

- Add import for `listStylePresetsTool` alphabetically after
  `listRulersTool` / before `listStatesTool`.
- Add the `export {…}` block re-exporting `createListStylePresetsTool`,
  `defaultStylePresetListRuntime`, `listStylePresetsTool`, and the type
  `StylePresetListRuntime` / `StylePresetEntry` after the
  `list-states` / `list-zones` re-export block (alphabetical).
- Add `registry.register(listStylePresetsTool);` inside
  `buildDefaultRegistry()` right after `listStatesTool` / before
  `listZonesTool`.

## 4. README row

Edit `README_AI.md`: add a row immediately after the `set_style_preset` row
(line 27) describing `list_style_presets`, mirroring the tone of
`list_heightmap_templates` (line 183). Include the "Requires an Anthropic
API key (see 'Getting an API key' below)." suffix and 2–3 example prompts.

## 5. Verify

- `npm run build`
- `npm test`
- `npm run lint 2>&1 | tail -5` — must match baseline (7 warnings / 1 info).

## 6. Commit

Stage:

- `aiplans/plan_200.md`
- `aiplans/tasks_200.md`
- `src/ai/tools/list-style-presets.ts`
- `src/ai/tools/list-style-presets.test.ts`
- `src/ai/index.ts`
- `README_AI.md`

Commit message: `feat(ai): add list_style_presets tool` with 1–2 line body
explaining the discovery-companion purpose.
