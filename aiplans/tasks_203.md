# Tasks 203 — list_regiment_units AI tool

- [ ] Create `src/ai/tools/list-regiment-units.ts`:
  - Imports: `getGlobal`, `okResult` from `./_shared`; `Tool`,
    `ToolResult` from `./index`.
  - Exports:
    - `RegimentUnit` interface — `{ id, name, type, rural,
      urban, crew, power, icon, separate }`.
    - `RegimentUnitsRuntime` — `{ readUnits(): RegimentUnit[] | null }`.
    - `defaultRegimentUnitsRuntime` — reads
      `getGlobal<{military?: unknown}>("options")?.military`,
      normalises entries via a local `normaliseUnit` helper,
      returns `null` when `options` / `military` absent or not an
      array.
    - `createListRegimentUnitsTool(runtime = defaultRegimentUnitsRuntime)`.
    - `listRegimentUnitsTool` — instance.
  - Tool name: `list_regiment_units`.
  - Description: explains this lists the military unit catalogue
    that `set_regiment_unit` keys against, source
    (`window.options.military`), and notes unit names are case-
    sensitive when written to `regiment.u`. Mentions API-key
    requirement.
  - Input schema: `{ type: "object", properties: {} }` — no
    required fields.
  - Behaviour: call `runtime.readUnits()`; if null → return
    `okResult({units: [], count: 0})`. Otherwise return
    `okResult({units: normalised, count: normalised.length})`.
  - Normalisation rules:
    - Entries must be objects with a non-empty string `name`.
    - `id = name = entry.name`.
    - `type = typeof entry.type === "string" ? entry.type : ""`.
    - numeric fields (`rural`, `urban`, `crew`, `power`,
      `separate`) → `Number.isFinite(v) ? v : 0`.
    - `icon = non-empty string ? string : null`.
    - Preserves source order.

- [ ] Register in `src/ai/index.ts`:
  - Import alongside `setRegimentUnitTool`:
    `import { listRegimentUnitsTool } from "./tools/list-regiment-units";`.
  - Barrel re-export:
    ```
    export {
      createListRegimentUnitsTool,
      defaultRegimentUnitsRuntime,
      listRegimentUnitsTool,
      type RegimentUnit,
      type RegimentUnitsRuntime,
    } from "./tools/list-regiment-units";
    ```
  - `registry.register(listRegimentUnitsTool)` near
    `registry.register(setRegimentUnitTool)` in
    `buildDefaultRegistry`.

- [ ] Write `src/ai/tools/list-regiment-units.test.ts`:
  - Factory unit tests:
    - Returns every entry from the injected runtime, in source
      order, with types normalised.
    - Returns `{units: [], count: 0}` when runtime returns `null`.
    - Returns `{units: [], count: 0}` when runtime returns `[]`.
    - Skips entries with no `name` / non-string `name` / empty
      `name`.
    - Coerces missing numeric fields (rural / urban / crew /
      power / separate) to `0`; non-finite / non-number inputs
      become `0`.
    - `icon` — non-empty string preserved; missing / empty /
      non-string → `null`.
    - Tolerates no-input / empty object / unknown keys — output
      identical.
  - `defaultRegimentUnitsRuntime` integration (using
    `as unknown as { options: unknown }` cast):
    - Seeds `globalThis.options = { military: [...5 defaults] }`,
      calls `listRegimentUnitsTool.execute({})`, asserts
      `body.ok === true`, `body.count === 5`, unit types match
      (melee / ranged / mounted / machinery / naval).
    - Absent `options` → `{units: [], count: 0}`.
    - `options` without `military` → `{units: [], count: 0}`.
    - `options.military` not an array → `{units: [], count: 0}`.
  - Restore `globalThis.options` in `afterEach`.

- [ ] Update `README_AI.md`:
  - Add row immediately before `set_regiment_unit` in the pipe
    table. Single-line row with description (source = Military
    Options, id/name/type/rural/urban/crew/power/icon/separate
    shape, read-only, companion to `set_regiment_unit`, API-key
    note) + example prompts.

- [ ] Verify:
  - `npm run lint` baseline 7 warnings / 1 info / 0 errors
    before the edit; confirm unchanged after.
  - `npm run build` clean.
  - `npm test` — baseline 2986 passing, expected 2986 + new
    cases (unit + integration).

- [ ] Commit: `feat(ai): add list_regiment_units tool` with a
  1-2-line body explaining the discovery role relative to
  `set_regiment_unit`. Stage specific files only.
