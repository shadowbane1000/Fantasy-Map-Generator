# Tasks 210 — `get_note_info`

## Implementation

- [ ] `src/ai/tools/get-note-info.ts`
  - [ ] `NoteInfo` = `{ id: string; name: string; legend: string }`
  - [ ] `ReadNoteInfoResult` = `NoteInfo | "not-ready" | "not-found"`
  - [ ] `NoteInfoRuntime` = `{ readNote(id: string): ReadNoteInfoResult }`
  - [ ] `defaultNoteInfoRuntime.readNote(id)`:
    - [ ] `getNotes<RawNote>()` → `undefined` maps to `"not-ready"`
    - [ ] missing entry → `"not-found"`
    - [ ] found → `{ id, name: entry.name ?? "", legend: entry.legend ?? "" }`
  - [ ] `createGetNoteInfoTool(runtime = default)`:
    - [ ] `name: "get_note_info"`
    - [ ] description explains: reads a single note; parallels
      `set_note` / `list_notes` / `remove_note`; full legend without
      truncation; mention API-key blurb.
    - [ ] `input_schema` requires `id` (string)
    - [ ] validate `id` non-empty string; trim; errorResult when bad
    - [ ] map runtime result: `"not-ready"` → error
      "Notes are not available yet; cannot read note. Wait for window.notes to be initialized.",
      `"not-found"` → `No note found matching "<id>".`,
      else `okResult({ id, name, legend })`
  - [ ] `getNoteInfoTool = createGetNoteInfoTool()` convenience export

- [ ] `src/ai/tools/get-note-info.test.ts`
  - [ ] Pure seam describe:
    - [ ] happy path full legend returned untouched
    - [ ] trims id before lookup
    - [ ] long legend (e.g. 3000 chars) not truncated
    - [ ] raw HTML legend echoed verbatim
    - [ ] missing name / legend → empty strings in output
    - [ ] invalid ids rejected (null, undefined, "", "  ", 42, {})
    - [ ] `"not-ready"` surfaced as structured error
    - [ ] `"not-found"` surfaced with JSON-quoted ref
    - [ ] tool name + input_schema.required shape
  - [ ] Integration `defaultNoteInfoRuntime` describe:
    - [ ] stub `globalThis.notes` via `as unknown as { notes?: unknown }`
    - [ ] reads existing note through `getNoteInfoTool.execute`
    - [ ] long legend returned untruncated
    - [ ] errors with not-found for unknown id
    - [ ] errors with not-ready when `window.notes` is `undefined` /
      not an array

- [ ] `src/ai/index.ts`
  - [ ] `import { getNoteInfoTool } from "./tools/get-note-info";` —
    alphabetical slot after `get-marker-info`, before `get-province-info`
  - [ ] Re-export `createGetNoteInfoTool`, `defaultNoteInfoRuntime`,
    `getNoteInfoTool`, `type NoteInfo`, `type NoteInfoRuntime`,
    `type ReadNoteInfoResult` — alphabetical block directly after the
    `./tools/get-marker-info` exports and before `./tools/get-province-info`
  - [ ] Register `getNoteInfoTool` in `buildDefaultRegistry` directly
    after `getMarkerInfoTool`

- [ ] `README_AI.md`
  - [ ] Add `get_note_info` row after `get_marker_info` row — describe
    scope vs. `list_notes` (no truncation; single id) and vs.
    `get_marker_info` (marker-scoped + truncated vs. general + full),
    example prompts, API-key blurb.

## Verification

- [ ] `npm run lint` — still 7 warnings / 1 info / 0 errors
- [ ] `npm run build`
- [ ] `npm test` — 3159 + new tests all pass
- [ ] Commit with scoped files (tool, test, `src/ai/index.ts`,
  `README_AI.md`, `aiplans/plan_210.md`, `aiplans/tasks_210.md`)
