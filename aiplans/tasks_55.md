# Tasks 55 — remove_note AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/remove-note.ts`:
  - Imports: `errorResult`, `getNotes`, `okResult`, `type RawNote`
    from `_shared`.
  - Exports: `RemoveNoteRef`, `NoteRemovalRuntime`,
    `defaultNoteRemovalRuntime`, `createRemoveNoteTool`,
    `removeNoteTool`.
- [ ] `defaultNoteRemovalRuntime.find(id)`:
  - `notes = getNotes<RawNote>()`; find entry with matching id.
  - Return `{ id, name: entry.name ?? "", legend: entry.legend ?? "" }`.
- [ ] `defaultNoteRemovalRuntime.remove(id)`:
  - `notes = getNotes<RawNote>()`; throw if not array.
  - `idx = notes.findIndex(n => n?.id === id)`; throw if -1.
  - `notes.splice(idx, 1)`.
- [ ] Tool schema: `id` (string required).
- [ ] Execute: validate; `find` → 404; try/catch remove; return
  `{ id, name, legend }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export.
- [ ] `registry.register(removeNoteTool)` near the other remove*
  tools.

## Task 3 — Runtime-injected tests

- [ ] `src/ai/tools/remove-note.test.ts`:
  - Remove by id, response body correct.
  - Error when id unknown.
  - Reject invalid id (null, undefined, "", "   ", 42).
  - Surface runtime failures (find throws, remove throws).

## Task 4 — Default-runtime integration

- [ ] beforeEach: `globalThis.notes = [
    { id: "burg12", name: "Rookholm", legend: "Old lore" },
    { id: "state3", name: "Ashholm", legend: "Rising power." },
  ]`.
- [ ] afterEach: restore.
- [ ] Tests:
  - Remove "burg12" → notes length 1, only state3 remains.
  - Remove "ghost" → error, notes untouched.
  - When `window.notes` undefined → error (not-ready).
  - Removing the only note leaves an empty array.

## Task 5 — README

- [ ] Row under `set_note`:
  ```
  | `remove_note`           | Delete a note from `window.notes` — same side-effect as the Notes Editor's Remove button (confirm dialog is skipped; tools run non-interactively). Pass the note's id (discover via `list_notes`). | "Remove the state 3 note", "Delete the regiment1-2 note" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/remove-note` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add remove_note tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Tasks 3, 4.
- Plan step 4 → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Notes Editor Remove, but AI can't invoke it generically.
- Plan uses the same `splice` mutation the UI uses (the UI's visible
  `notes = notes.filter(...)` rebinds the let, but the AI tool's
  in-place splice achieves the same observable end-state and
  preserves the array reference — matching how
  `remove_marker` / `remove_regiment` already handle notes).
- Error on unknown id so the AI knows when the note wasn't
  actually there (vs a silent success).

## Verification that tests prove the use case

- Injected-runtime tests cover every validation / error path.
- Default-runtime integration test proves the live `globalThis.notes`
  array is spliced correctly, including the edge of removing the
  last entry.
