# Tasks 201 — list_cultures_sets AI tool

- [ ] Create `src/ai/tools/list-cultures-sets.ts`:
  - Imports: `okResult` from `./_shared`; `Tool`, `ToolResult`
    from `./index`; `CULTURES_SETS`, type `CulturesSet` from
    `./set-cultures-set`.
  - Do NOT redeclare `CULTURES_SETS`. Reuse the existing export.
  - Exports:
    - `CulturesSetEntry { id: CulturesSet; name: string }`.
    - Helper `cultureSetDisplayName(id)` — returns the display
      label: `"highFantasy"` → `"High Fantasy"`,
      `"darkFantasy"` → `"Dark Fantasy"`, otherwise capitalise
      first letter.
    - `listCulturesSetsEntries()` — returns
      `CulturesSetEntry[]` by mapping `CULTURES_SETS`.
    - `createListCulturesSetsTool()` factory (no runtime
      argument; keep parity with other tools by exposing a
      factory for tests).
    - `listCulturesSetsTool` (instance).
  - Tool name: `list_cultures_sets`.
  - Description: explains this lists every valid identifier the
    `set_cultures_set` tool accepts (8 canonical keys) plus notes
    that aliases like "all-world", "high fantasy", "dark-fantasy"
    are accepted by `set_cultures_set` but not reported here
    (canonical only). Mentions the order mirrors the Options
    dialog's Cultures Set selector. Mentions API-key requirement.
  - Input schema: `{ type: "object", properties: {} }` — no
    required fields. (No enforcement in `execute`.)
  - Behavior: always return
    `okResult({ sets: listCulturesSetsEntries(), count: CULTURES_SETS.length })`.

- [ ] Register in `src/ai/index.ts`:
  - Import alongside `setCulturesSetTool`:
    `import { listCulturesSetsTool } from "./tools/list-cultures-sets";`.
  - Barrel re-export near the existing cultures-set export:
    ```
    export {
      createListCulturesSetsTool,
      cultureSetDisplayName,
      type CulturesSetEntry,
      listCulturesSetsEntries,
      listCulturesSetsTool,
    } from "./tools/list-cultures-sets";
    ```
  - `registry.register(listCulturesSetsTool)` near
    `registry.register(setCulturesSetTool)`.

- [ ] Write `src/ai/tools/list-cultures-sets.test.ts`:
  - Unit (factory tool):
    - Returns all 8 sets in tuple order (`world`, `european`,
      `oriental`, `english`, `antique`, `highFantasy`,
      `darkFantasy`, `random`).
    - Each entry has string id and string name; `count` equals
      `sets.length`.
    - Verifies the human-friendly names — in particular
      `highFantasy` → `"High Fantasy"` and `darkFantasy` →
      `"Dark Fantasy"`.
    - Tolerates no-input (`execute(undefined)`), empty
      object, and unknown input keys — payload identical in
      every case.
  - Unit on `listCulturesSetsEntries`:
    - Length equals `CULTURES_SETS.length`.
    - Order matches `CULTURES_SETS` positional order.
  - Unit on `cultureSetDisplayName`:
    - `"highFantasy"` → `"High Fantasy"`.
    - `"darkFantasy"` → `"Dark Fantasy"`.
    - `"world"` → `"World"`, `"european"` → `"European"`, etc.
  - Integration ("default tool" block, using
    `as unknown as { ... }` cast pattern for parity with
    `list-heightmap-templates.test.ts`):
    - Invokes `listCulturesSetsTool.execute({})` directly.
    - Asserts `body.ok === true`, `body.count === 8`,
      `body.sets.length === 8`, ids match `CULTURES_SETS`.

- [ ] Update `README_AI.md`:
  - Add row immediately before `set_cultures_set` in the pipe
    table. Single line row:
    ```
    | `list_cultures_sets` | List every valid Cultures Set
      identifier accepted by `set_cultures_set` (8: `world`,
      `european`, `oriental`, `english`, `antique`,
      `highFantasy`, `darkFantasy`, `random`). Entries are
      `{id, name}`; `name` is the human-friendly label
      (`highFantasy` → "High Fantasy"). Order matches the
      Options dialog's Cultures Set selector. Read-only — the
      companion to `set_cultures_set`. Requires an Anthropic
      API key (see "Getting an API key" below). | "List the
      cultures sets", "What culture pools are available?",
      "Show me the cultures-set options" |
    ```

- [ ] Verify:
  - `npm run lint` baseline captured at 7 warnings / 1 info /
    0 errors before the edit; confirm unchanged after.
  - `npm run build` clean.
  - `npm test` — baseline 2967 passing, expected 2967 + new
    cases (unit + integration).

- [ ] Commit: `feat(ai): add list_cultures_sets tool` with a
  1-2-line body explaining the discovery role relative to
  `set_cultures_set`.
