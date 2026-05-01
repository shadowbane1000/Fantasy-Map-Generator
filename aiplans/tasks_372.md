# Tasks for Plan 372 — World Editor

1. **Create `public/modules/dynamic/editors/world-editor.js`** following
   the religions-editor / cultures-editor pattern:
   - Top-level: `const $body = insertEditorHtml(); addListeners();`
   - `WORLD_TOPICS = ["premise","cosmology","pantheon","magic","calendar","history"]`.
   - `export function open()` opens `#worldEditor` jQuery dialog with
     title `"World"`, position right-top.
   - `insertEditorHtml()` injects dialog markup into `#dialogs`.
   - `refreshWorldEditor()` rebuilds the rows: predefined topics first
     (in canonical order), then user-defined `world:<topic>` notes
     (alphabetical). Rows have `data-id`, `data-topic`, `data-empty`.
   - Row HTML: topic, name (input or display), legend preview (first 80
     plain-text chars), `icon-edit` button, `icon-trash-empty` button.
   - `+` button (`#worldAdd`, `icon-plus`) prompts for topic, sanitizes
     with `^[a-z][a-z0-9_-]{0,31}$`, rejects collisions, creates note,
     refreshes list, opens `editNotes`.
   - Edit handler: snapshot premise legend if topic === "premise",
     create note if missing, call `editNotes("world:<topic>", name)`,
     hook `$("#notesEditor").one("dialogclose", …)` to refresh + run
     premise-change-clears-chat flow.
   - Trash handler: confirmationDialog → splice from `notes` → refresh.
     For `world:premise`: also run chat-clear flow if chat non-empty.
   - Helper `maybeClearChat(reason)`: returns a promise; checks
     `globalThis.__aiChatController?.getHistory().length > 0`; if so
     opens `confirmationDialog` and resolves once user clicks; on
     confirm calls `__aiChatController.reset()`.

2. **Add `editWorldButton` to `src/index.html`.** Insert into the
   `#toolsContent .grid` block, between `editUnitsButton` and
   `editZonesButton`:

   ```html
   <button id="editWorldButton" data-tip="Click to open World Editor">World</button>
   ```

3. **Wire button in `public/modules/ui/tools.js`.** In the
   `toolsContent` click handler, add (next to `editZonesButton`):

   ```js
   else if (button === "editWorldButton") editWorld();
   ```

4. **Add dynamic importer in `public/modules/ui/editors.js`** next to
   `editReligions`:

   ```js
   async function editWorld() {
     if (customization) return;
     const Editor = await import("../dynamic/editors/world-editor.js?v=1.114.1");
     Editor.open();
   }
   ```

5. **Create E2E spec `tests/e2e/world-editor.spec.ts`.** Mirrors
   `notes-buttons.spec.ts` style. Cases:
   - Open editor, predefined rows visible (assert all six).
   - Add new topic: stub `window.prompt` to return `"factions"`, click
     `#worldAdd`, expect a row for `world:factions`, expect `notes` has
     `{id: "world:factions"}`.
   - Edit a predefined topic via pencil — `editNotes` opens
     `#notesEditor`, `notes` gains a `world:<topic>` entry.
   - Trash a user-defined topic via icon-trash-empty — confirmation
     handled, row gone, `notes` no longer contains the entry.
   - Premise-change-clears-chat: stub
     `__aiChatController = { getHistory: () => [{}], reset: spy }`;
     open premise via pencil; mutate `notes.find(...).legend` directly
     via `evaluate`; close notes editor; assert confirmation appears
     and accepting it calls `reset` (assert via the spy).

6. **Run verification:**
   - `npx tsc --noEmit` — must succeed.
   - `npm run lint` — clean (Biome doesn't scan `public/**/*.js`, so
     the new editor itself isn't linted; the edits to `editors.js` and
     `tools.js` aren't either).
   - `npm test` — Vitest stays green (E2E excluded).
   - `npx playwright test --list tests/e2e/world-editor.spec.ts` —
     spec parses.

7. **Commit on branch `plan-372-world-editor-ui`.** Stage the new editor,
   the modified `index.html`, `tools.js`, `editors.js`, the new E2E
   spec, and `aiplans/plan_372.md` + `aiplans/tasks_372.md`.

   ```
   feat(ui): add World editor for managing world:* notes

   Implements plan 372 (Layer 3 of the world-building feature). Adds a
   Tools/Edit menu entry "World" that lists world:* notes (predefined
   topics — premise, cosmology, pantheon, magic, calendar, history —
   always shown; user-defined topics shown when they exist). Per-row
   edit/delete icons; '+' button creates new arbitrary topics. Editing
   world:premise clears the AI chat (with confirmation) so the chat
   controller's snapshotted world context refreshes.
   ```

   Do NOT push.
