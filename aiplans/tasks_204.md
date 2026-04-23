# Tasks 204 — list_emblem_shapes AI tool

- [ ] Create `src/ai/tools/list-emblem-shapes.ts`:
  - Imports: `okResult` from `./_shared`; `Tool`, `ToolResult` from
    `./index`; `CULTURE_SHIELDS` from `./set-culture-shield`.
  - Exports:
    - `EmblemShapeEntry` interface — `{ id: string; name: string }`.
    - `EmblemShapesListRuntime` — `{ readShapeIds(): readonly string[] }`.
    - `defaultEmblemShapesListRuntime` — `readShapeIds` returns
      `CULTURE_SHIELDS` verbatim.
    - `createListEmblemShapesTool(runtime = defaultEmblemShapesListRuntime)`.
    - `listEmblemShapesTool` — instance.
  - Tool name: `list_emblem_shapes`.
  - Description: identifies the list as the shield pool accepted by
    `set_culture_shield`, `regenerate_burg_coa({shield})`,
    `regenerate_state_coa({shield})`,
    `regenerate_province_coa({shield})`, and (together with
    `culture` / `state` / `random`) `set_default_emblem_shape`.
    Mentions source (`src/modules/emblem/shields.ts`), case-
    insensitive ids, and API-key requirement.
  - Input schema: `{ type: "object", properties: {} }` — no required
    fields.
  - Behaviour: call `runtime.readShapeIds()`, map each id to
    `{id, name: id}`, return `okResult({shapes, count: shapes.length})`.

- [ ] Register in `src/ai/index.ts`:
  - Import alongside `setCultureShieldTool` /
    `setDefaultEmblemShapeTool`:
    `import { listEmblemShapesTool } from "./tools/list-emblem-shapes";`
    keeping imports alphabetised.
  - Barrel re-export (in the sorted `export { … } from …` section):
    ```
    export {
      createListEmblemShapesTool,
      defaultEmblemShapesListRuntime,
      type EmblemShapeEntry,
      type EmblemShapesListRuntime,
      listEmblemShapesTool,
    } from "./tools/list-emblem-shapes";
    ```
  - `registry.register(listEmblemShapesTool)` near the
    `setDefaultEmblemShapeTool` / `setCultureShieldTool` registrations
    in `buildDefaultRegistry`.

- [ ] Write `src/ai/tools/list-emblem-shapes.test.ts`:
  - Factory unit tests:
    - Default (shipped `CULTURE_SHIELDS`) runtime returns every entry
      in the same order; count matches length; every entry is
      `{id: x, name: x}`.
    - Custom runtime returns exactly the supplied subset preserving
      order (e.g. `["heater", "swiss"]` round-trips).
    - `count` always equals `shapes.length`.
    - Accepts `{}` / `null` / `undefined` input uniformly.
    - Throwing runtime propagates (ToolRegistry wraps errors
      upstream).
  - `defaultEmblemShapesListRuntime` integration block:
    - Shipped `listEmblemShapesTool` returns `shapes.length ===
      CULTURE_SHIELDS.length`.
    - Ids array (in order) deep-equals `[...CULTURE_SHIELDS]`.
    - Every id is a non-empty string; every entry has `name === id`.
    - Contains `heater`, `swiss`, `wedged`, `noldor`, `round`,
      `fantasy1`.
    - Does NOT contain the meta `types` key.
    - All ids are unique.

- [ ] Update `README_AI.md`:
  - Add row near `set_culture_shield` / `set_default_emblem_shape` in
    the pipe table. Single line with description (source: the
    `shields` map in `src/modules/emblem/shields.ts`, minus the meta
    `types` key; discovery companion of `set_culture_shield` and the
    regenerators; combined with `culture` / `state` / `random` drives
    `set_default_emblem_shape`; entries `{id, name}`; read-only;
    API-key note) plus example prompts.

- [ ] Verify:
  - `npm run lint` baseline 7 warnings / 1 info / 0 errors before
    the edit; confirm unchanged after.
  - `npm run build` clean.
  - `npm test` — baseline 3008 passing, expected 3008 + new cases
    (unit + integration).

- [ ] Commit: `feat(ai): add list_emblem_shapes tool` with a 1-2-line
  body explaining the discovery role relative to
  `set_culture_shield` / `set_default_emblem_shape`. Stage specific
  files only.
