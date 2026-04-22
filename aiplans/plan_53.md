# Plan 53 — list_notes AI tool

## Use case

`window.notes` is a flat `{id, name, legend}[]` array containing the
lore / description text for every annotated entity — burgs, states,
provinces, cultures, religions, markers, regiments, rivers, routes,
lakes, battles, labels. The Notes Editor
(`public/modules/ui/notes-editor.js`) lets the user scroll through
them all and edit.

The chat currently reaches notes only through narrow marker-scoped
tools (`set_marker_note`). It cannot enumerate notes attached to
*other* entity types, which makes prompts like "read me the lore of
Rookholm", "list any notes about the War of Ashes", or "which states
have custom notes?" impossible.

## Scope

Add one tool: `list_notes`. Paginated read-only surface over
`window.notes`. Per entry reports:
- `id` (raw, e.g. "burg12", "regiment1-2"),
- `type` (derived prefix — "burg", "regiment", "state", etc.),
- `name`,
- `legend`: text preview (HTML stripped, collapsed whitespace,
  truncated to a sensible length),
- `legend_truncated`: true when the preview was shorter than the
  full legend,
- `legend_length`: original character count of the raw legend.

Optional filters:
- `type` — case-insensitive prefix match (e.g. "burg", "regiment",
  "state"). Recognises the known prefixes and a catch-all "other".
- `search` — substring match (case-insensitive) in name or legend.
- `full_legend` (boolean) — skip the preview truncation when set,
  returning the raw legend HTML. Default false so large notes don't
  blow up context.
- `max_legend_length` — override the default preview length (default
  300, min 1, max 5000).

## Implementation

1. **New file `src/ai/tools/list-notes.ts`**:
   - Imports: `createPaginatedListTool`, `getNotes`, `type RawNote`
     from `_shared`.
   - `NoteSummary { id, type, name, legend, legend_truncated,
     legend_length }`.
   - `classifyNoteId(id)` helper: look at the id prefix and return
     one of: "burg", "marker", "regiment", "state", "province",
     "culture", "religion", "river", "route", "lake", "battle",
     "label", "other". Use a small regex / startsWith switch.
   - `stripHtml(s)`: remove tags via regex (`<[^>]+>`), collapse
     whitespace, trim.
   - `NotesRuntime { readNotes(): RawNote[] | null }`.
   - `defaultNotesRuntime.readNotes`: `getNotes<RawNote>() ?? null`.
     Return `null` when window.notes is missing so the paginated
     tool's notReadyError fires.
   - Paginated tool via `createPaginatedListTool`:
     - `limit` 1–500 default 100, `offset` ≥ 0.
     - `parseFilters` validates `type`, `search`, `full_legend`,
       `max_legend_length`.
     - `applyFilters`:
       - Classify each note and filter by type when provided.
       - Substring match on name+legend when `search` provided.
       - Render `legend` as full-raw (when `full_legend` true) or
         HTML-stripped + truncated to `max_legend_length` characters
         (default 300). Populate `legend_truncated` and
         `legend_length`.
     - Echo `{ filters: { type, search, full_legend,
       max_legend_length } }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/list-notes.test.ts`**:
   - `classifyNoteId` covers each prefix:
     - "burg1" → "burg", "marker5" → "marker", "regiment1-2" →
       "regiment", "state3" → "state", "province7" → "province",
       "culture2" → "culture", "religion4" → "religion", "river9" →
       "river", "route3" → "route", "lake1" → "lake", "battle1" →
       "battle", "label1" → "label", "custom-thing" → "other".
   - Empty / malformed ids fall into "other" (or similar). Decide:
     empty string → "other".
   - `stripHtml`: drops tags, collapses whitespace.
   - Tool: returns paginated list by default.
   - Tool: legend preview truncates + reports `legend_truncated` and
     `legend_length`.
   - Tool: `full_legend: true` returns raw legend; `legend_truncated:
     false`.
   - Tool: `max_legend_length` override respected.
   - Tool: `type` filter with various prefix values.
   - Tool: `search` substring match in name; in legend (after HTML
     strip).
   - Tool: rejects invalid filters (non-string type, non-string
     search, non-boolean full_legend, non-integer or out-of-range
     max_legend_length).
   - Tool: not-ready error when `window.notes` missing.

4. **Default-runtime smoke test** — set `globalThis.notes` to a few
   entries, call the tool, verify the live pipeline.

5. **README_AI.md** — add row (near `list_markers` or at the end of
   list tools; I'll place under `list_regiments`).

## Verification

- `npm test -- --run src/ai/tools/list-notes` green.
- `npm test -- --run` — full suite (652 before).
- `npm run lint` — 7/1 baseline.
- `npm run build` succeeds (no unused imports).

## Success criteria

- Tool registered and callable.
- AI can run `list_notes({ type: "burg", search: "castle" })` and
  get only burg-attached notes whose text mentions "castle".
- Large legend HTML is sanitized and truncated so it doesn't blow
  up the chat context by default.
- All known note-id prefixes are classified correctly; unknown ids
  land in "other" rather than breaking the tool.
