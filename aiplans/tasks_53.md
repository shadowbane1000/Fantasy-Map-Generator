# Tasks 53 — list_notes AI tool

## Task 1 — Implement helpers

- [ ] `classifyNoteId(id: string)`: export. Return the prefix tag
  from the ordered list below, matching on `id.startsWith(prefix)`
  where the rest of the id looks numeric (or, for regiments, matches
  `${stateId}-${i}`). Known prefixes (match order: longer first):
  "regiment", "religion", "province", "culture", "marker", "battle",
  "label", "route", "state", "river", "lake", "burg", "zone". If
  none matches → `"other"`. Empty/non-string input → `"other"`.
- [ ] `stripHtml(s: string)`: export. Remove tags via
  `s.replace(/<[^>]+>/g, " ")`, collapse runs of whitespace to a
  single space, trim. Safe on non-string input (return empty).

## Task 2 — Implement the tool

- [ ] Create `src/ai/tools/list-notes.ts`:
  - Imports: `createPaginatedListTool`, `getNotes`, `type RawNote`
    from `_shared`.
  - `NoteSummary { id, type, name, legend, legend_truncated,
    legend_length }`.
  - `NotesRuntime { readNotes(): RawNote[] | null }` +
    `defaultNotesRuntime` using `getNotes<RawNote>() ?? null`.
  - `createListNotesTool(runtime)` factory via
    `createPaginatedListTool<NoteSummary, NoteFilters>`.
  - Input schema: `limit`, `offset`, `type` (string), `search`
    (string), `full_legend` (bool), `max_legend_length` (int 1-5000).
- [ ] `NoteFilters { typeFilter, searchNeedle, fullLegend,
  maxLegendLength }`.
- [ ] `read`: map each RawNote → preliminary `NoteSummary` — at this
  point still carrying the RAW legend; preview transformation
  happens in `applyFilters` where we know the filter options.
  Alternative: do it at render time (after pagination slice).
  Simpler: `applyFilters` transforms items and returns them.
- [ ] Since `createPaginatedListTool`'s response JSON is built by
  the factory, and it serializes whatever `items` the `applyFilters`
  return — so we can freely rewrite `legend` etc. there.
- [ ] Echo the applied filters including normalized values.

## Task 3 — Register

- [ ] Import, barrel re-export, `registry.register(listNotesTool)`.

## Task 4 — Tests

- [ ] `classifyNoteId` — every known prefix + an unknown prefix +
  empty string + non-string input.
- [ ] `stripHtml` — empty, plain, nested tags, whitespace collapse.
- [ ] Tool:
  - Returns all notes by default.
  - Default `max_legend_length` 300.
  - `full_legend: true` returns raw HTML.
  - `max_legend_length` override respected.
  - `type: "burg"` filter.
  - `type: "regiment"` filter matches `regiment1-2` etc.
  - `search` matches name case-insensitively.
  - `search` matches legend (after HTML strip).
  - Invalid `type` (non-string) rejected.
  - Invalid `search` (non-string) rejected.
  - Invalid `full_legend` (non-bool) rejected.
  - Invalid `max_legend_length` (<1, >5000, non-integer) rejected.
  - Not-ready error when `getNotes()` returns undefined.
- [ ] Default-runtime smoke test: set `globalThis.notes` to a small
  fixture; call `listNotesTool.execute({})`; verify the live
  pipeline.

## Task 5 — README

- [ ] Under `list_regiments` add:
  ```
  | `list_notes`            | List every note attached to any entity in `window.notes` (burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels). Each entry reports id, derived `type`, name, and an HTML-stripped legend preview (default 300 chars; pass `full_legend: true` for raw HTML). Optional filters: `type` (prefix), `search` (substring in name or legend), `max_legend_length`. | "Read the burg notes", "What notes mention the Ashwater?", "Show me all regiment notes" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/list-notes` passes.
- [ ] `npm test -- --run` — full suite.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add list_notes tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new tool + helpers) → Tasks 1, 2.
- Plan step 2 (register) → Task 3.
- Plan step 3 (tests) → Task 4.
- Plan step 4 (smoke test) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: AI has no way to see notes beyond markers.
- Plan exposes the entire `window.notes` collection with enough
  type classification that follow-up questions can reason about
  which entity each note belongs to ("burg12" → type "burg").
- Safe default: legend previews are HTML-stripped + truncated, so
  lore-heavy maps don't fill the model's context with raw HTML.

## Verification that tests prove the use case

- `classifyNoteId` unit tests cover every known prefix + the fallback.
- `stripHtml` tests cover HTML sanitization and whitespace collapse
  so the preview is readable.
- Tool tests cover every filter branch + truncation logic + validation.
- Default-runtime smoke test ensures the live pipeline is wired to
  `globalThis.notes`, not just an injected fake.
