# Plan 201 — list_cultures_sets AI tool

## Goal
Add a read-only `list_cultures_sets` tool that returns every valid
identifier accepted by `set_cultures_set`. It is the discovery
companion for `set_cultures_set`: the agent can ask "what are my
options?" before committing to a value.

## Why
`set_cultures_set` validates against the `CULTURES_SETS` tuple
(`world`, `european`, `oriental`, `english`, `antique`,
`highFantasy`, `darkFantasy`, `random`). There is no tool today that
lists these names — they only surface via the tool's rejection
message. This mirrors the pattern established by
`list_heightmap_templates` (plan 199) for `set_heightmap_template`.

## Data sources
- `src/ai/tools/set-cultures-set.ts` — already exports
  `CULTURES_SETS` (readonly tuple of 8 ids). Reuse it rather than
  redeclaring.
- The same file exports `resolveCulturesSet` and alias maps, but the
  list tool only needs the canonical ids. Aliases are advertised in
  the tool description for discoverability.

No `pack` / `grid` / DOM dependencies — the tuple is a module-level
constant so no runtime seam is required.

## Tool shape
- Name: `list_cultures_sets`.
- Description: identifies the list as the exact enum accepted by
  `set_cultures_set`. Mentions aliases for the agent's benefit.
- Input schema: no properties; no required fields (empty object is
  acceptable).
- Output:
  ```
  {
    ok: true,
    sets: [{id: "world", name: "World"}, ...],
    count: 8,
  }
  ```
  `id` is the canonical key; `name` is a friendly display label
  derived from the id (`highFantasy` → `"High Fantasy"`,
  `darkFantasy` → `"Dark Fantasy"`, others → Title-cased). Order
  matches the `CULTURES_SETS` tuple insertion order (matches the
  Options dialog's select order).

## Runtime seam
None needed — the data is a compile-time constant. A no-arg
`createListCulturesSetsTool()` factory is still provided for
parity with other tools and testability (makes it trivial to
smoke-test via `tool.execute({})`).

## Validation
Input is ignored. Unknown fields are tolerated silently (no schema
enforcement beyond the JSON-Schema definition).

## Response shape
```
{
  ok: true,
  sets: [
    {id: "world", name: "World"},
    {id: "european", name: "European"},
    {id: "oriental", name: "Oriental"},
    {id: "english", name: "English"},
    {id: "antique", name: "Antique"},
    {id: "highFantasy", name: "High Fantasy"},
    {id: "darkFantasy", name: "Dark Fantasy"},
    {id: "random", name: "Random"},
  ],
  count: 8,
}
```

## Testing
Mirror `list-heightmap-templates.test.ts` style:
- Unit:
  - Returns all 8 sets in the canonical tuple order.
  - Each entry has a string `id` and non-empty string `name`.
  - `highFantasy` → `"High Fantasy"` and `darkFantasy` →
    `"Dark Fantasy"` are split into two words; simpler ids are
    Title-cased.
  - `count === sets.length === CULTURES_SETS.length`.
  - Tolerates no-input (`tool.execute(undefined)`), empty object,
    and unknown keys.
- Integration (`defaultRuntime` block is N/A since there is no
  runtime dependency, but keep a "real default export" block that
  calls `listCulturesSetsTool.execute({})` via the `as unknown as { ... }`
  cast to mirror the project's defaultRuntime convention).

## Wiring
- Register in `src/ai/index.ts` near `setCulturesSetTool`
  registration.
- Barrel re-export `createListCulturesSetsTool` and
  `listCulturesSetsTool` (no runtime / type to re-export since
  `CULTURES_SETS` is already exported from `set-cultures-set`).
- README_AI.md row immediately before the `set_cultures_set`
  row, matching the single-line pipe-table convention (description
  + examples + API-key note).

## Out of scope
- No changes to `set_cultures_set` or its aliases.
- No new runtime seam.
- No detail about name-base contents (that's generator-internal).

## Verify
- `npm run build` — `tsc && vite build` both clean.
- `npm test` — baseline 2967 → 2967 + N new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
