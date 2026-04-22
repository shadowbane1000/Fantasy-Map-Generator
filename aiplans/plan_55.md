# Plan 55 — remove_note AI tool

## Use case

The Notes Editor's Remove button (`triggerNotesRemove` →
`removeLegend` at `public/modules/ui/notes-editor.js:180`) deletes
the currently selected note from `window.notes`. Together with
`list_notes` (read) and `set_note` (upsert) this completes the
CRUD triad on arbitrary notes.

Prompts like "clear the state 3 note entirely" or "drop the stale
regiment1-2 note" currently have no AI path — `set_note` can only
clear the legend (not the entry), and `remove_marker` / `remove_*`
tools are entity-specific.

## Scope

Add one tool: `remove_note(id)`.

- `id` required — non-empty note id string (e.g. "burg12",
  "regiment1-2", "state3"). No case handling (note ids are
  canonical strings, not names).
- Side-effect: splice the matching entry out of `window.notes`
  (in-place, consistent with `remove_marker` / `remove_regiment`).
- Idempotent-style error: if no note with that id exists, return
  an error rather than silently succeeding — callers should first
  verify via `list_notes`.

Note: destructive marker/regiment removals already drop their
associated notes as a side-effect. `remove_note` is the generic
tool for any other note type (states, provinces, cultures,
religions, rivers, routes, lakes, battles, labels, zones) and for
free-standing notes without an entity.

## Implementation

1. **New file `src/ai/tools/remove-note.ts`**:
   - Imports: `errorResult`, `getNotes`, `okResult`, `type RawNote`
     from `_shared`.
   - `RemoveNoteRef { id, name, legend }`.
   - `NoteRemovalRuntime { find(id): RemoveNoteRef | null; remove(id)
     : void }`.
   - `defaultNoteRemovalRuntime.find`:
     `getNotes<RawNote>()?.find(n => n?.id === id)` → return shallow
     `{ id, name, legend }` or null.
   - `defaultNoteRemovalRuntime.remove(id)`:
     - `notes = getNotes<RawNote>()`; throw if not array.
     - `idx = notes.findIndex(n => n?.id === id)`; throw if <0.
     - `notes.splice(idx, 1)`.
   - Tool schema: `id` (string required).
   - Execute: validate `id` non-empty string; `find` → 404 error;
     try/catch `remove`; return `{ id, name, legend }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/remove-note.test.ts`**:
   - Runtime-injected:
     - Removes by id.
     - Returns name+legend from the find in the response.
     - Error when id unknown.
     - Error for invalid id (null, "", "   ", non-string).
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.notes` with 2 entries; remove one; verify
       length 1 and correct entry remains.
     - Stub `globalThis.notes` undefined → error surfaced.
     - Removing the only note leaves an empty array.

4. **README_AI.md** — new row under `set_note`.

## Verification

- `npm test -- --run src/ai/tools/remove-note` green.
- `npm test -- --run` — full suite (688 before).
- `npm run lint` — 7/1 baseline unchanged.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can remove any note via its id string after reading it from
  `list_notes`. Works across all entity-type notes because the id
  is just a string key.
- In-place splice preserves the `window.notes` array reference, so
  legacy UI code that still holds the original reference sees the
  mutation.
