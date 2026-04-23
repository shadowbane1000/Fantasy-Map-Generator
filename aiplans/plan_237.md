# Plan 237: `find_notes_by_prefix` AI tool

## Goal
Add a read-only AI tool that enumerates notes in `window.notes` whose id starts with a caller-supplied prefix (case-insensitive). This is the opposite of `list_notes` (which lists them all) and a prefix-scoped companion to `get_note_info` (which reads a single note by exact id).

## Motivation
Notes have stringly-typed ids like `burg5`, `state3`, `marker12`, `province7`. `list_notes` paginates over every note and filters by a coarse `type` (from a fixed KNOWN_PREFIXES list). Users sometimes want "every note id starting with `state`" or more specific slices like `"burg1"` (→ `burg1`, `burg10`, `burg11`, …). A prefix filter lets the AI enumerate a prefix slice efficiently and return a flat `{notes, count}` shape that is straightforward to feed into subsequent `get_note_info` / `set_note` / `remove_note` calls.

## Reference tools studied
- `src/ai/tools/list-notes.ts` + test — note enumeration via the paginated-list-tool helper. Confirms the `RawNote` shape, HTML-stripping / truncation conventions, and the `NotesRuntime { readNotes(): RawNote[] | null }` seam.
- `src/ai/tools/get-note-info.ts` + test — per-note lookup. Confirms the runtime-seam `Tool` shape (name, description, input_schema, execute) and full-legend return policy.
- `src/ai/tools/set-note.ts` + test — confirms the note id / name / legend write shape.
- `src/ai/tools/_shared/index.ts` — `errorResult`, `okResult`, `getNotes`, `RawNote`.

## Shape

### Input
```
{
  prefix: string (required, non-empty after trim),
  limit?: integer in [1, 10000] (default 1000)
}
```
Matching is case-insensitive: `id.toLowerCase().startsWith(prefix.toLowerCase())` after trimming the prefix.

### Output
```
{
  ok: true,
  prefix: string (the lowercased trimmed prefix actually used),
  notes: [{ id, name, legend, legend_truncated }],
  count: number
}
```
- `legend` is truncated to 200 chars with trailing `…` when the raw legend is longer; `legend_truncated` is a boolean flag on each entry. No HTML stripping — we echo the raw legend (or its first 200 chars).
- `notes` is capped at `limit`; `count` is the full unlimited total matching the prefix.

### Errors
- `prefix` missing / non-string / empty-after-trim → `"prefix must be a non-empty string."`
- invalid `limit` → `"limit must be an integer in [1, 10000]."`
- `window.notes` not initialized → `"Notes are not available yet; cannot find notes. Wait for window.notes to be initialized."`

## Files
- NEW `src/ai/tools/find-notes-by-prefix.ts` — runtime-seam implementation. Exports:
  - `NoteMatch` (the per-entry output shape).
  - `FindNotesByPrefixPayload` (the full result `{notes, count}`).
  - `FindNotesByPrefixRuntime` with `readNotes(): RawNote[] | null`.
  - `defaultFindNotesByPrefixRuntime` wrapping `getNotes<RawNote>()`.
  - `DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT` (1000), `MAX_FIND_NOTES_BY_PREFIX_LIMIT` (10000), `NOTE_LEGEND_PREVIEW_MAX` (200).
  - `findNotesByPrefixInNotes(notes, prefix, limit)` — pure collector used both by the tool and testable directly.
  - `createFindNotesByPrefixTool(runtime?)` factory → `Tool`.
  - `findNotesByPrefixTool` — default instance.
- NEW `src/ai/tools/find-notes-by-prefix.test.ts` — covers the pure collector, tool surface, and a `defaultFindNotesByPrefixRuntime` integration block (seeds `globalThis.notes`).
- EDIT `src/ai/index.ts` — import, re-export, register.
- EDIT `README_AI.md` — add row near `list_notes` / `get_note_info`.

## Registration
- `import { findNotesByPrefixTool } from "./tools/find-notes-by-prefix";`
- Add a re-export block (factory, constants, types, default runtime, pure collector, tool instance).
- `registry.register(findNotesByPrefixTool);` next to `listNotesTool` / `getNoteInfoTool`.

## README_AI.md row
Insert next to the `list_notes` / `get_note_info` cluster (after `remove_note` or immediately after `get_note_info`). Include full description (contrasts with `list_notes` / `get_note_info`), the three example prompts, and the "Requires an Anthropic API key" boilerplate.

## Validation gates
- Baseline lint: 7 warnings / 1 info / 0 errors.
- Baseline tests: 248 files / 3933 tests.
- `npm run build` succeeds.
- `npm test` — all previously-passing tests still pass, plus new tests.
- Post-lint matches baseline.
