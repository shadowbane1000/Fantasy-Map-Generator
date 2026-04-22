# Plan 54 — set_note AI tool

## Use case

The Notes Editor (`public/modules/ui/notes-editor.js`) lets the user
edit the `name` and `legend` of any note attached to any entity —
burgs, states, provinces, cultures, religions, markers, regiments,
rivers, lakes, battles, labels, zones. Writing is simple:
`note.name = value` and `note.legend = value`.

The chat has `set_marker_note` for markers and `list_notes` (plan 53)
to read all notes. But the only way to *edit* a non-marker note via
the AI is currently impossible. Prompts like "add a legend to the
Rookholm burg note", "update the Phalanx regiment's description",
"tag state 3 with a quick history paragraph" all need a general
write-path.

## Scope

Add one tool: `set_note(id, name?, legend?)`. Upsert-style,
modelled on `set_marker_note`:

- `id` required — the full note id string (e.g. "burg12",
  "regiment1-2", "state3"). No resolution required; the AI can pass
  an id it got from `list_notes`.
- `name` optional — when provided, must be non-empty. If omitted on
  an existing note, keep the current name.
- `legend` optional — when provided, must be a string. Empty string
  "" is allowed (clears the legend); whitespace-only is rejected to
  match the `set_marker_note` contract.
- At least one of `name` / `legend` must be provided.
- Upsert:
  - If a note with the given id exists: update the supplied fields.
  - If no note exists: create one. Require `name` in this case
    (otherwise error) because a note without a name is useless.
    `legend` defaults to "".

No SVG redraw needed — the Notes Editor refreshes its own DOM when
re-opened; the floating pinned-note box is a UI artifact.

## Implementation

1. **New file `src/ai/tools/set-note.ts`**:
   - Imports: `errorResult`, `getNotes`, `okResult`, `type RawNote`
     from `_shared`.
   - `NoteRef { id, name, legend, existed }`.
   - `NoteRuntime { find(id): NoteRef | null; write(id, name, legend)
     : void }`.
   - `defaultNoteRuntime.find`: `getNotes()?.find(n => n.id === id)`
     → return `{ id, name, legend, existed: true }` or null.
   - `defaultNoteRuntime.write(id, name, legend)`:
     - `let notes = getNotes<RawNote>()`.
     - If notes undefined: `(globalThis as any).notes = []; notes = []`.
     - Find existing; if present: update provided fields. Else: push
       a new `{ id, name, legend: legend ?? "" }`.
   - Tool schema: `id` (string required), `name` (string optional,
     non-empty if provided), `legend` (string optional, "" allowed
     but not whitespace-only).
   - Execute:
     - Validate `id` is non-empty string.
     - Validate `name` if provided (non-empty trimmed).
     - Validate `legend` if provided (string, empty OK, whitespace-
       only not).
     - Require at least one of name/legend.
     - `runtime.find(id)` — if missing and `name` is missing, error.
     - Call `runtime.write(id, effectiveName, legend)`.
     - Return `{ id, created, previousName, previousLegend,
       name, legend }`.

2. **Register** in `src/ai/index.ts`. Place near `set_marker_note`
   alphabetically or wherever convenient.

3. **Tests `src/ai/tools/set-note.test.ts`**:
   - Runtime-injected:
     - Update name only on existing note.
     - Update legend only on existing note.
     - Update both name and legend on existing note.
     - Legend "" clears the legend on existing note.
     - Rejects whitespace-only legend.
     - Creates a new note when none exists (requires name).
     - Errors when neither name nor legend provided.
     - Errors when new-note path tries to create without name.
     - Rejects invalid `id` (non-string, empty, whitespace).
     - Rejects invalid `name` (non-string, empty, whitespace).
     - Rejects invalid `legend` (non-string, whitespace-only).
     - Surfaces runtime write failures.
   - Default-runtime integration:
     - Update existing burg note → `window.notes[k].name` changed.
     - Create new state note → appended to `window.notes`.
     - Works when `window.notes` is initially missing (creates
       array).

4. **README_AI.md** — row near `list_notes`.

## Verification

- `npm test -- --run src/ai/tools/set-note` green.
- `npm test -- --run` — full suite green (672 before).
- `npm run lint` — 7/1 baseline intact (watch for optional-chain).
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can update any note's name / legend with a single call after
  reading it from `list_notes`.
- Upsert creates missing notes when given both `id` and `name`.
- Whitespace-only legend rejected (matching `set_marker_note`
  contract).
