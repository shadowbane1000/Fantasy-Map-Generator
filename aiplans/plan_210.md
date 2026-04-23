# Plan 210 — `get_note_info` AI tool

## Goal

Add a read-only AI tool `get_note_info` that reads a single note from
`window.notes` by its stringly-typed id (e.g. `"burg12"`, `"state3"`,
`"marker5"`, `"regiment1-2"`). The per-note parallel of `set_note` /
`list_notes` / `remove_note`.

## Motivation

`list_notes` enumerates notes in bulk but truncates legends to 300 chars by
default (HTML-stripped preview) to keep responses compact. `set_note` writes
and `remove_note` deletes — neither returns the full current legend when
what the caller wants is just to read one note verbatim.

`get_marker_info` returns a marker's associated note but (a) goes through
the marker lookup pipeline and (b) truncates legends at 2000 chars. There is
no direct "read one note by id" tool. Agents needing the untruncated legend
for a burg / state / province / culture / religion / regiment / river /
route / lake / battle / label / zone note currently have to page through
`list_notes` with `full_legend: true` and filter client-side.

A dedicated per-id reader is the natural discovery → read → write loop:

- `list_notes` — enumerate ids / names
- `get_note_info` — read one note in full
- `set_note` / `remove_note` — mutate

## API

Required input:

- `id` — string. The note's id. Trimmed before lookup. Rejected when empty /
  whitespace-only / non-string.

No optional inputs. The full legend is always returned (no truncation).

## Output shape

Happy path:

```
{
  ok: true,
  id:     "burg12",
  name:   "Rookholm",
  legend: "Full lore text, may contain arbitrary HTML.<p>…</p>"
}
```

- `id` echoes the (trimmed) id passed in, matching the stored `note.id`.
- `name` is `note.name ?? ""` — the raw stored name (empty string when
  unset, mirroring `set_note` / `remove_note` behaviour).
- `legend` is `note.legend ?? ""` — the raw HTML legend verbatim. No strip,
  no truncation. This is the critical difference vs. `get_marker_info`
  (which truncates at 2000 chars) and `list_notes` (which strips HTML and
  truncates at 300 chars by default).

Error paths:

- `id` missing / non-string / empty / whitespace-only → `errorResult("id must be a non-empty string.")` (same wording as `remove_note` / `set_note`).
- `window.notes` missing or not an array → `errorResult("Notes are not available yet; cannot read note. Wait for window.notes to be initialized.")` (parallels `list_notes.notReadyError`).
- No note matching the id → `errorResult("No note found matching \"<id>\".")` (same shape `remove_note` uses for its not-found path).

## Runtime seam

```ts
export interface NoteInfo {
  id: string;
  name: string;
  legend: string;
}

export type ReadNoteInfoResult = NoteInfo | "not-ready" | "not-found";

export interface NoteInfoRuntime {
  readNote(id: string): ReadNoteInfoResult;
}
```

`defaultNoteInfoRuntime.readNote(id)`:

- Calls `getNotes<RawNote>()` from the shared globals helper.
- Returns `"not-ready"` when the result is `undefined` (no `window.notes`
  or it's not an array). This matches the spirit of
  `list_notes.notReadyError` rather than treating the empty-case as a
  not-found.
- Finds the first entry where `entry?.id === id`. Returns `"not-found"`
  when none matches.
- Otherwise returns `{ id, name: entry.name ?? "", legend: entry.legend ?? "" }`.

Tool `execute`:

- Validate `id`, trim.
- Call `runtime.readNote(trimmed)`.
- Map `"not-ready"` → error string above; `"not-found"` → error string
  above (quoting the ref via `JSON.stringify`); `NoteInfo` → `okResult(info)`.

## Registration

- `src/ai/tools/get-note-info.ts` — runtime-seam tool.
- `src/ai/tools/get-note-info.test.ts` — unit (pure seam) + integration
  (`defaultNoteInfoRuntime`) describes.
- `src/ai/index.ts`:
  - Import `getNoteInfoTool` in the alphabetical block (after
    `getMarkerInfoTool`, before `getProvinceInfoTool`).
  - Re-export `createGetNoteInfoTool`, `defaultNoteInfoRuntime`,
    `getNoteInfoTool`, `type NoteInfo`, `type NoteInfoRuntime`,
    `type ReadNoteInfoResult` — alphabetical, directly after the
    `./tools/get-marker-info` export block and before
    `./tools/get-province-info`.
  - Register `getNoteInfoTool` in `buildDefaultRegistry` directly after
    `getMarkerInfoTool`.
- `README_AI.md` — add row for `get_note_info` near the `list_notes` /
  `set_note` / `remove_note` rows (alphabetically slots between
  `get_marker_info` and `get_province_info` in the "Read" block, but since
  the README is grouped by topic rather than strict alpha, slot it right
  after `get_marker_info`). Example prompts + API-key blurb.

## Tests

Pure seam (uses `createGetNoteInfoTool(runtime)` with fakes):

- happy path → returns `{ ok: true, id, name, legend }` with full legend
  untouched
- trims id before lookup (verify `readNote` called with trimmed id)
- full legend is returned untruncated even for very long strings
  (> 2000 chars — proves no `MARKER_LEGEND_MAX_CHARS`-style cap)
- legend may contain raw HTML and is echoed verbatim
- name / legend each default to `""` when the stored entry's field is
  missing
- rejects invalid ids: `null`, `undefined`, `""`, `"   "`, `42`, `{}` all
  produce `isError: true`
- `"not-ready"` runtime result → structured error matching
  `/Notes are not available/i`
- `"not-found"` runtime result → structured error matching
  `/No note found matching/i` with the ref JSON-quoted
- `getNoteInfoTool.name === "get_note_info"` and
  `input_schema.required === ["id"]`

Integration (`defaultNoteInfoRuntime`):

- stubs `globalThis.notes` via `as unknown as { notes?: unknown }`,
  beforeEach / afterEach restoration
- reads an existing note through `getNoteInfoTool.execute`
- returns full legend when legend is long (no truncation)
- errors with not-found for unknown id
- errors with not-ready when `window.notes` is missing / not an array

## Non-goals

- Filtering / search — that's `list_notes`'s job.
- Writing — `set_note` / `remove_note`.
- HTML stripping — `list_notes` provides that for the preview path; the
  `get_note_info` contract is "give me the raw stored legend".
- Resolving by name — notes are keyed by id string, and the same
  `list_notes` enumeration + `set_note` / `remove_note` pipeline always
  uses id. Consistent with those siblings; callers who want name-based
  lookup can `list_notes?search=…`.
- Fancy "classified type" field — `list_notes` already derives it from the
  id prefix; this tool returns the raw primitives.
