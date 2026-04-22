# Tasks 54 — set_note AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/set-note.ts`:
  - Imports: `errorResult`, `getNotes`, `okResult`, `type RawNote`
    from `_shared`.
  - Exports `NoteRef { id, name, legend, existed }`,
    `NoteRuntime { find, write }`, `defaultNoteRuntime`,
    `createSetNoteTool`, `setNoteTool`.
- [ ] `defaultNoteRuntime.find(id)`:
  - `getNotes<RawNote>()?.find(n => n?.id === id)` → return
    `{ id, name: raw.name ?? "", legend: raw.legend ?? "",
    existed: true }` or null.
- [ ] `defaultNoteRuntime.write(id, name, legend)`:
  - Ensure `window.notes` exists:
    - `let arr = getNotes<RawNote>()`. If undefined → set
      `(globalThis as {notes?: RawNote[]}).notes = [];` and refetch.
    - (Tests will set globals explicitly; a helper like
      `ensureNotesArray()` keeps this ergonomic.)
  - Find existing by id; if found:
    - `existing.name = name` (caller passed a name or the
      pre-existing one).
    - `existing.legend = legend` (caller passed a legend string; may
      be "").
  - Else: `arr.push({ id, name, legend })`.
- [ ] Tool schema: `id` (string required), `name` (string optional
  non-empty when provided), `legend` (string optional — empty string
  allowed, whitespace-only rejected).
- [ ] Execute:
  - Validate `id` is non-empty (post-trim) string.
  - hasName: check name is string & non-empty trimmed (else error
    if name was supplied but bad).
  - hasLegend: legend string; allow "" literal; reject whitespace-
    only.
  - Require at least one of name / legend (else error).
  - `runtime.find(id)` — if null AND name missing, error (can't
    create without name).
  - Compute:
    - `effectiveName = name ?? current?.name ?? ""`.
    - `effectiveLegend = legend ?? current?.legend ?? ""`.
  - Try/catch `runtime.write(id, effectiveName, effectiveLegend)`.
  - Return `{ id, created: !current, previousName, previousLegend,
    name, legend }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export.
- [ ] `registry.register(setNoteTool)` after `setMarkerNoteTool`.

## Task 3 — Runtime-injected tests

- [ ] `src/ai/tools/set-note.test.ts`:
  - Update name only on existing note.
  - Update legend only on existing note.
  - Update both.
  - Legend "" clears.
  - Rejects whitespace-only legend.
  - Creates a new note when missing (id + name provided).
  - Errors when neither name nor legend given.
  - Errors when creating new note without name.
  - Rejects invalid id (non-string, empty, whitespace).
  - Rejects invalid name (non-string, empty, whitespace).
  - Rejects invalid legend (non-string, whitespace-only).
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration

- [ ] beforeEach: `globalThis.notes = [{id: "burg12", name:
  "Rookholm", legend: "Old lore"}]`.
- [ ] Test: update name → notes[0].name changed; legend untouched.
- [ ] Test: update legend → notes[0].legend changed; name untouched.
- [ ] Test: create new note → notes length 2, new entry appended.
- [ ] Test: when window.notes is missing → creates [] and appends.
- [ ] afterEach: restore.

## Task 5 — README

- [ ] Row under `list_notes`:
  ```
  | `set_note`              | Create or update the name / legend of any note in `window.notes` (burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels, zones). Upsert: if no note exists for the id, it's created (requires `name`). `legend: ""` clears; whitespace-only is rejected. | "Add a legend to the Rookholm burg note", "Update state 3's note with a history paragraph", "Clear the legend on zone 5" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-note` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] `feat(ai): add set_note tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new tool file + runtime) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (tests) → Tasks 3, 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: Notes Editor name/legend edits are unreachable by the
  AI for non-marker notes.
- Plan writes the same `note.name` / `note.legend` fields the Notes
  Editor writes; upsert mirrors `editNotes()`'s auto-create behaviour
  when a new entity clicks opens the editor.
- Generalized: accepts ANY id string (`burg12`, `regiment1-2`,
  `state3`, etc.), because the notes array has no type-specific
  schema.

## Verification that tests prove the use case

- Injected-runtime tests exercise every update / create / validation
  branch.
- Default-runtime integration test proves the mutation lands on
  `globalThis.notes` and handles the no-notes-yet edge case.
- Whitespace-only legend rejection test matches the same contract
  set_marker_note enforces, so both paths accept identical inputs.
