# Plan 372 — World Editor (Layer 3 of the world-building feature)

## Use case

Reserved-id world notes use ids like `world:premise`, `world:cosmology`, etc.
Users want a dedicated UI editor (not the catch-all Notes Editor) listing
those notes specifically with affordances to:

- Open the standard `editNotes(id, name)` dialog for any row.
- Add an arbitrary new world note via a `+` button.
- Delete a world note via a trash icon.
- See predefined topics ALWAYS (premise, cosmology, pantheon, magic,
  calendar, history) — even if no `world:<topic>` note exists yet.
- See user-defined topics whose notes already exist.

Per-row pattern matches the four list-style editors
(states / provinces / cultures / religions). Predefined topics that don't
yet have a note display with an `(empty)` indicator and a click action
that creates an empty note + opens the editor.

### CRITICAL extra requirement: editing `world:premise` clears the AI chat

Plan 371 snapshots the premise at conversation start; mutating it makes the
snapshot stale. So:

1. When the world-editor row for `world:premise` is opened for editing,
   snapshot the legend before opening the notes editor.
2. After the notes editor closes (jQuery dialog `close` event on
   `#notesEditor`), compare to the snapshot.
3. If `world:premise.legend` changed AND `globalThis.__aiChatController`
   exists AND `__aiChatController.getHistory().length > 0`, prompt the
   user: `"Editing world:premise will reset the AI chat (which has
   snapshotted the previous premise). Reset chat now?"` with confirm /
   cancel.
4. On confirm: call `__aiChatController.reset()`. On cancel: leave chat
   alone (warn it'll use stale premise).
5. Same prompt + reset flow for the trash action on `world:premise`.

If chat is empty (or controller absent), save / delete silently.

NOTE on API: the user-facing requirement called these `clear()` and
`history.length`; the actual `ChatController` exposes `reset()` and
`getHistory()`. Use those.

## Lint baseline

`npm run lint` is clean as of master (no findings) — Biome only scans
`src/**/*.ts`, so the new classic-JS file in `public/modules/` is not
linted.

## Predefined topics

```
const WORLD_TOPICS = ["premise", "cosmology", "pantheon", "magic", "calendar", "history"];
```

This must match plan 370's constant. Plan 370 hasn't merged yet, so we
hardcode the same list here. When plan 370 lands, future work can extract
the constant into a shared classic-JS module imported by both editors.

## UI structure

Dialog `#worldEditor`, classes `dialog stable`, with:

- `#worldHeader` `.header` row — column headers ("Topic", "Name", "Legend
  preview", "Actions").
- `#worldEditorBody` `.table` — rows for each world topic.
- `#worldFooter` `.totalLine` — count of populated topics.
- `#worldBottom` — refresh + `+` add button.

Each row carries `data-id="world:<topic>"`, `data-topic="<topic>"`,
`data-empty="true|false"`. Layout: topic id, display name (from
`world:<topic>` note's `name` field, or default
`"World — <Capitalized>"` if note doesn't exist), legend preview (first
~80 plain-text chars of the legend, or `(empty)` for missing notes),
edit-pencil icon (`icon-edit`), trash icon (`icon-trash-empty` — disabled
on empty rows since there's nothing to delete).

Order: predefined topics first in canonical order, then user-defined
topics alphabetical.

## `+` flow

1. Prompt for a topic key (`prompt()` window prompt or
   `confirmationDialog`-style wrapper — for simplicity, `prompt()`).
2. Sanitize: `String(input).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "")`.
3. Validate against `^[a-z][a-z0-9_-]{0,31}$`. Reject empty / invalid.
4. If `notes` already contains `world:<sanitized>`, refuse with a `tip`.
5. Create note `{id: "world:<topic>", name: "World — <Capitalized>", legend: ""}`,
   push to `window.notes`, refresh list, open `editNotes` for the new row.

## Edit flow

Pencil icon (or row click on the topic name) → `editNotes("world:<topic>", currentName)`.
For predefined topics with no existing note: create the note first
(empty legend, default name "World — <Capitalized>"), then open
`editNotes`.

For `world:premise` specifically: snapshot legend before opening; on
notes-editor close, run the chat-clear flow.

## Trash flow

Confirm dialog → splice from `window.notes` → refresh list. Disabled on
predefined rows that have no note (nothing to delete). For
`world:premise`: also confirm the chat-clear flow if chat is non-empty.

## Premise-change-clears-chat detection

Hook to the jQuery `close` event of `#notesEditor` once when opening from
the world editor. Use `$("#notesEditor").one("dialogclose", handler)`
where the handler:

- Looks up `world:premise` legend from `notes`.
- Compares against the snapshot taken just before `editNotes` was called.
- If different and `globalThis.__aiChatController?.getHistory().length > 0`,
  shows confirmation dialog and on confirm calls
  `globalThis.__aiChatController.reset()`.
- Always: refreshes the world editor body (so legend preview updates).

This is sufficient — the world editor remains open behind the notes
editor, so we can update on close.

## Tools menu integration

- Add `<button id="editWorldButton">World</button>` button into the
  `#toolsContent .grid` block in `src/index.html`, alphabetically near
  the other "W" entries (between Units and Zones).
- Wire `tools.js`'s `toolsContent` click handler:
  `else if (button === "editWorldButton") editWorld();`
- Add `editWorld()` to `public/modules/ui/editors.js` next to
  `editCultures` / `editReligions` — dynamically imports
  `../dynamic/editors/world-editor.js`.

## Files

- NEW `public/modules/dynamic/editors/world-editor.js` — the editor.
- MODIFY `src/index.html` — add `editWorldButton` to the Edit grid;
  no separate dialog markup needed (the editor inserts its own HTML
  into `#dialogs`, matching cultures-editor / religions-editor).
- MODIFY `public/modules/ui/tools.js` — wire button → `editWorld()`.
- MODIFY `public/modules/ui/editors.js` — add `editWorld()` dynamic
  importer.

## Tests

- NEW `tests/e2e/world-editor.spec.ts` (Playwright) covering:
  1. Open editor — predefined rows shown.
  2. Add new topic via `+` (mock `window.prompt` to provide a topic key).
  3. Delete a user-defined topic via trash (handle confirmation dialog).
  4. Edit a topic via pencil — opens notes editor.
  5. Premise-change-clears-chat: stub the controller's `reset` method
     and `getHistory` to make history non-empty; mutate the legend
     in-place via `notes`; close the notes editor; assert the
     confirmation dialog appears and accepting it calls `reset`.

## Verification

- `npx tsc --noEmit` clean.
- `npm test` unchanged from baseline (Vitest doesn't run E2E).
- E2E spec discovered via `npx playwright test --list`.

## Self-review

- Predefined list `["premise","cosmology","pantheon","magic","calendar","history"]`
  matches the canonical order specified by plan 370.
- Chat-clear flow runs on BOTH edit and trash paths for `world:premise`.
- `+` regex validates `^[a-z][a-z0-9_-]{0,31}$` and rejects collisions.
- Editor follows cultures-editor / religions-editor visual + interaction style.
- Per-row icon classes: `icon-edit`, `icon-trash-empty`, matching legacy.
