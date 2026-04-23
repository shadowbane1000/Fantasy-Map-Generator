# Tasks 199 — list_heightmap_templates AI tool

- [ ] Create `src/ai/tools/list-heightmap-templates.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult` from
    `./_shared`; `Tool`, `ToolResult` from `./index`.
  - Exports:
    - `HeightmapListEntry { id: number; name: string }`.
    - `HeightmapListRuntime {
        readTemplates(): Record<string, unknown> | undefined;
        readPrecreated(): Record<string, unknown> | undefined;
      }`.
    - `readHeightmapListFromGlobals(templates, precreated)` —
      returns `{templates, precreated}` where each is
      `HeightmapListEntry[]`. Coerces numeric id, non-empty string
      name; skips malformed slots; sorts by id ascending.
    - `defaultHeightmapListRuntime`:
      - readTemplates: `getGlobal<Record<string, unknown>>("heightmapTemplates")`.
      - readPrecreated: `getGlobal<Record<string, unknown>>("precreatedHeightmaps")`.
    - `createListHeightmapTemplatesTool(runtime?)`.
    - `listHeightmapTemplatesTool` (instance).
  - Tool name: `list_heightmap_templates`.
  - Description: explains dual purpose (template keys accepted by
    `set_heightmap_template` vs precreated fixed maps), notes the
    deterministic id sort.
  - Input schema:
    ```
    { type: { type: "string",
              description: "Optional filter: 'template' or 'precreated'." } }
    ```
    No required fields.
  - Validation:
    - If `type` is provided, must be non-empty string.
      Accept case-insensitive `"template"` / `"templates"` or
      `"precreated"` / `"precreated-heightmaps"` (normalised via
      `trim().toLowerCase()`); otherwise errorResult with
      `{ supported: ["template", "precreated"] }`.
  - Behavior:
    - Read both globals via runtime.
    - Run through `readHeightmapListFromGlobals`.
    - If filter `templates`: zero the precreated array. If
      `precreated`: zero the templates array.
    - Always return `okResult({ templates, precreated })`.

- [ ] Register in `src/ai/index.ts`:
  - Import alongside `setHeightmapTemplateTool`.
  - Barrel re-export:
    `export { createListHeightmapTemplatesTool,
      defaultHeightmapListRuntime,
      type HeightmapListEntry,
      type HeightmapListRuntime,
      listHeightmapTemplatesTool,
      readHeightmapListFromGlobals }
      from "./tools/list-heightmap-templates";`.
  - `registry.register(listHeightmapTemplatesTool)` near the
    other `list_*` registrations (or next to
    `setHeightmapTemplateTool`).

- [ ] Write `src/ai/tools/list-heightmap-templates.test.ts`:
  - Unit (stubbed runtime):
    - Returns both lists, sorted by id.
    - `type: "template"` filter empties precreated list.
    - `type: "precreated"` filter empties templates list.
    - Case-insensitive / whitespace-flexible type values.
    - Rejects unknown `type` string (error with supported list).
    - Rejects non-string `type` values (number, bool, object).
    - Skips malformed entries (id not a number, name empty,
      name wrong type, value is null).
    - Handles missing templates / precreated (undefined from
      runtime) — returns empty arrays, no error.
  - `readHeightmapListFromGlobals` direct tests:
    - Undefined inputs → empty arrays.
    - Sorts by id ascending regardless of object key order.
    - Skips entries missing `id` or `name`.
  - Integration (defaultRuntime):
    - Stubs `(globalThis as unknown as { heightmapTemplates: ... }).heightmapTemplates`
      and `(globalThis as unknown as { precreatedHeightmaps: ... }).precreatedHeightmaps`.
    - Invokes `listHeightmapTemplatesTool.execute({})`.
    - Expects the real default path to surface the stubbed data.
    - Restores originals in `afterEach`.
  - Use `as unknown as { ... }` casts for global access (matches
    project convention in list-biomes.test.ts).

- [ ] Update `README_AI.md`:
  - Add row immediately before `set_heightmap_template` in the
    pipe table:
    ```
    | `list_heightmap_templates` | List heightmap template ids /
      names accepted by `set_heightmap_template` (14 built-in:
      Volcano, High Island, Low Island, Continents, Archipelago,
      Atoll, Mediterranean, Peninsula, Pangea, Isthmus, Shattered,
      Taklamakan, Old World, Fractious) plus the 23 precreated
      fixed heightmaps (Africa Centric, Eurasia, World, …).
      Optional `type` filter ('template' or 'precreated'). Read-only;
      requires an Anthropic API key (see "Getting an API key"
      below). | "List the heightmap templates", "Which precreated
      maps are available?", "Show me just the templates" |
    ```
    (Single-line — the table uses one row per tool.)

- [ ] Verify:
  - `npm run lint` baseline captured at 7 warnings / 1 info /
    0 errors before the edit; confirm unchanged after.
  - `npm run build` clean.
  - `npm test` — baseline 2927 passing, expected 2927 + new
    cases.

- [ ] Commit: `feat(ai): add list_heightmap_templates tool` with
  a 1-2-line body explaining the dual-list payload.
