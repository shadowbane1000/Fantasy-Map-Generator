# Tasks — Plan 237: `find_notes_by_prefix`

## 1. Scaffolding
- [x] Merge master into worktree branch (ff-only).
- [x] Capture baseline: `npm run lint` → 7 warnings / 1 info / 0 errors. `npm test` → 248 files / 3933 tests.

## 2. Implement `src/ai/tools/find-notes-by-prefix.ts`
- Constants:
  - `DEFAULT_FIND_NOTES_BY_PREFIX_LIMIT = 1000`
  - `MAX_FIND_NOTES_BY_PREFIX_LIMIT = 10000`
  - `NOTE_LEGEND_PREVIEW_MAX = 200`
- Types:
  - `NoteMatch = { id, name, legend, legend_truncated }`.
  - `FindNotesByPrefixPayload = { notes: NoteMatch[]; count: number }`.
  - `FindNotesByPrefixRuntime = { readNotes(): RawNote[] | null }`.
- `defaultFindNotesByPrefixRuntime`: wraps `getNotes<RawNote>() ?? null`.
- Pure collector `findNotesByPrefixInNotes(notes, prefix, limit)`:
  - Lowercase `prefix`.
  - Iterate `notes`; for each with a string `id` whose lowercase starts with `prefix`, increment `count` and push (up to `limit`) `{ id, name, legend, legend_truncated }` where legend is truncated to 200 chars + "…" when longer.
  - Return `{ notes, count }`.
- `createFindNotesByPrefixTool(runtime)` factory returning `Tool`. Execute:
  1. Read rawInput as `{ prefix?: unknown; limit?: unknown }`.
  2. Validate `prefix` is a non-empty trimmed string; else error.
  3. Validate `limit` — integer in `[1, 10000]`, default `1000`.
  4. Read notes via runtime; when `null` return structured not-ready error.
  5. Call collector; `okResult({ prefix, notes, count })` (echo the trimmed lowercased prefix).
- `findNotesByPrefixTool` — default instance.

## 3. Implement `src/ai/tools/find-notes-by-prefix.test.ts`
Sections:

### Pure collector
- matches ids with the exact lowercase prefix.
- matches case-insensitively (prefix uppercase, mixed case ids).
- truncates long legends at 200 chars with `legend_truncated: true`.
- does not truncate short legends (`legend_truncated: false`).
- echoes raw HTML in legend (no stripping).
- handles missing `name` / `legend` fields (default to "").
- ignores notes whose `id` is not a string.
- caps `notes` at `limit` but preserves unlimited `count`.
- empty result when no id matches.

### Tool surface
- happy path returns `{ ok: true, prefix, notes, count }`.
- lowercases and trims the echoed `prefix`.
- default `limit = 1000` when omitted.
- accepts a non-default limit.
- rejects missing / empty / non-string prefix.
- rejects invalid limit (0, -1, 1.5, non-number, 99999).
- surfaces `not-ready` as a structured error.
- `findNotesByPrefixTool` export shape (name, required=[prefix]).

### `defaultFindNotesByPrefixRuntime` integration
- beforeEach seeds `globalThis.notes`, afterEach restores.
- reads real `globalThis.notes` end-to-end.
- not-ready when `globalThis.notes` is missing.
- not-ready when `globalThis.notes` is not an array.

All casts via `as unknown as { ... }`.

## 4. Register in `src/ai/index.ts`
- Alphabetical import near `findNearestRiverTool` / `findReligionsByCultureTool`.
- Re-export block next to other find-* exports.
- `registry.register(findNotesByPrefixTool);` alongside `listNotesTool` / `getNoteInfoTool`.

## 5. README_AI.md
- Insert a row next to the `list_notes` / `get_note_info` cluster (near `remove_note`) with full description contrasting with `list_notes` (paginated, HTML-stripped) / `get_note_info` (exact id, full legend) + 3 example prompts + API key boilerplate.

## 6. Verify
- `npm run build` ✔
- `npm test` ✔ (test count rises)
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).

## 7. Commit
- Stage specific files:
  - `src/ai/tools/find-notes-by-prefix.ts`
  - `src/ai/tools/find-notes-by-prefix.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_237.md`
  - `aiplans/tasks_237.md`
- Message: `feat(ai): add find_notes_by_prefix tool` + short body.
