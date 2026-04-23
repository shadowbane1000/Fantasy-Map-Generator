# Plan 199 — list_heightmap_templates AI tool

## Goal
Add a read-only `list_heightmap_templates` tool that exposes the set of
template names and precreated heightmap names recognised by the Fantasy
Map Generator. It serves as the discovery partner for
`set_heightmap_template` and `regenerate_map`: the agent can ask "what
can I pass?" before committing to a name.

## Why
`set_heightmap_template` only accepts a fixed set of 14 template keys /
display names. There is no tool today that lists them. Similarly, the
generator supports ~23 "precreated" fixed heightmaps (defined in
`public/config/precreated-heightmaps.js`) but these aren't surfaced
anywhere the agent can see. This tool gives the model both lists in a
single call.

## Data sources
- `public/config/heightmap-templates.js` — procedural templates.
  Exposes `const heightmapTemplates = {...}` at script scope; the file
  is loaded as a non-module script so the binding is accessible as a
  global. `src/types/global.ts` already declares
  `var heightmapTemplates: any`. Each entry shape:
  `{id: number, name: string, template: string, probability: number}`.
  Keys are the canonical ids used by `set_heightmap_template` (e.g.
  `oldWorld`, `highIsland`).
- `public/config/precreated-heightmaps.js` — fixed PNG-backed maps.
  Exposes `const precreatedHeightmaps = {...}` at script scope. Each
  entry shape: `{id: number, name: string}`. Keys like `world`,
  `east-asia`, `us-centric`.

Both are plain objects — no async work, no `pack` dependency.

## Tool shape
- Name: `list_heightmap_templates`.
- Description: explains both lists, notes the link to
  `set_heightmap_template` (procedural templates only) and
  `regenerate_map`. Mentions that precreated maps can't be passed to
  `set_heightmap_template` today; they're informational.
- Input schema: one optional field `type` — either `"template"` or
  `"precreated"`. When omitted, both lists are returned.
- Output: `{ ok: true, templates: [{id, name}, ...], precreated: [{id, name}, ...] }`.
  When filtered, the omitted list is still present but empty, so the
  response shape is stable.

## Runtime seam
- `HeightmapListRuntime { readTemplates(): ... ; readPrecreated(): ... }`.
- `defaultHeightmapListRuntime` pulls from `getGlobal<...>("heightmapTemplates")`
  and `getGlobal<...>("precreatedHeightmaps")`.
- Read helper `readHeightmapListFromGlobals(templatesObj, precreatedObj)`
  normalises to `[{id, name}]` arrays, sorting by numeric `id` for
  deterministic output. Skips entries where id is not a finite number
  or name is not a non-empty string (defensive).
- If both globals are missing, the tool still returns ok with empty
  arrays (the data is baked into the repo, so "not ready" is a
  weaker error than for `pack`-dependent tools; but we surface a note
  via echoed `counts`).

## Validation
- `type`, if provided, must be the string `"template"` or
  `"precreated"` (case-insensitive). Anything else → errorResult with
  the supported list.

## Response shape
```
{
  ok: true,
  templates: [{id, name}, ...],   // empty when type === "precreated"
  precreated: [{id, name}, ...],  // empty when type === "template"
}
```

## Testing
Mirror `set-heightmap-template.test.ts` and `list-biomes.test.ts`:
- Unit: stubbed runtime — returns both lists, respects the type
  filter, rejects invalid type strings, sorts by id, skips malformed
  entries (non-number id, empty name).
- Integration: `defaultRuntime` block that stubs
  `(globalThis as unknown as { heightmapTemplates: ... }).heightmapTemplates = {...}` and
  the parallel `precreatedHeightmaps`, invokes `listHeightmapTemplatesTool.execute({})`,
  confirms the real default path reads them and produces the expected
  payload. Restores originals in `afterEach`.

## Wiring
- Register in `src/ai/index.ts` near `setHeightmapTemplateTool`.
- Export alongside existing heightmap tool exports.
- README_AI.md row immediately before / after
  `set_heightmap_template`, matching the single-line pipe-table
  convention (description + examples + API-key note).

## Out of scope
- No new heightmap generation logic.
- No changes to `set_heightmap_template`.
- No dumping the full `template` DSL string — that's the private
  procedural script.

## Verify
- `npm run build` — `tsc && vite build` both clean.
- `npm test` — baseline 2927 → 2927 + N new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
