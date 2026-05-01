# Tasks for Plan 373 — Auto-populate predefined empty world notes

1. **Create `public/modules/world-notes-init.js`.**

   Classic JS, `"use strict";` at top, no IIFE (matches
   `public/versioning.js` style). Defines:

   - `const PREDEFINED = ["premise","cosmology","pantheon","magic","calendar","history"];`
   - `function buildDefaults()` — returns `PREDEFINED.map(topic => ({id: "world:" + topic, name: "World — " + topic[0].toUpperCase() + topic.slice(1), legend: ""}))` (or equivalent that produces the exact 6 notes specified in `plan_373.md`).
   - `function decideAutoPopulate(notesArray)` — `if (!Array.isArray(notesArray)) return buildDefaults();` then `if (notesArray.some(n => typeof n?.id === "string" && n.id.startsWith("world:"))) return [];` else `return buildDefaults();`.
   - `function ensureWorldNotes()` — initializes `window.notes` to `[]` if not array, then `for (const n of decideAutoPopulate(window.notes)) window.notes.push(n);`.
   - `window.addEventListener("map:generated", ensureWorldNotes);`
   - `window.__worldNotesAutoPopulate = {PREDEFINED, buildDefaults, decideAutoPopulate, ensureWorldNotes};` so the unit test can exercise the pure helpers.

   Verify the names match exactly: `"World — Premise"`, `"World — Cosmology"`, `"World — Pantheon"`, `"World — Magic"`, `"World — Calendar"`, `"World — History"` (em-dash U+2014, capital first letter of topic).

2. **Add the `<script defer>` tag in `src/index.html`.**

   Insert immediately after the existing `<script defer src="modules/io/export.js?v=1.112.2"></script>` line (currently at line 8600), so it is the very last classic-JS script before `</body>`:

   ```html
       <script defer src="modules/world-notes-init.js"></script>
   ```

   No `?v=…` suffix needed for a brand-new file.

3. **Add the unit test `src/ai/world-notes-autopopulate.test.ts`.**

   Use `node:fs` + `node:vm` to load
   `public/modules/world-notes-init.js` into a sandboxed `window`
   object. Then exercise the pure helpers via
   `window.__worldNotesAutoPopulate`. Cover:

   - `buildDefaults()` returns 6 notes, in order, with the exact ids and names from the plan.
   - `decideAutoPopulate([])` → 6 defaults.
   - `decideAutoPopulate(undefined)` → 6 defaults (non-array fallback).
   - `decideAutoPopulate([{id:"burg7", legend:"X"}])` → 6 defaults (non-`world:*` ids don't block).
   - `decideAutoPopulate([{id:"world:premise", legend:""}])` → `[]` (any `world:*` blocks).
   - `decideAutoPopulate(buildDefaults())` → `[]` (idempotent).
   - End-to-end: dispatch `map:generated` twice on the sandbox `window`; assert `notes.length === 6` (not 12).

   Use `vm.runInNewContext(source, sandbox)` where the sandbox
   includes `window`, `addEventListener`, `dispatchEvent` (the
   sandbox's `window` should be a small EventTarget-like object
   with `addEventListener`/`dispatchEvent`, OR the test can use
   the real `EventTarget` class).

4. **Run the verification suite.**

   - `npx tsc --noEmit` — clean.
   - `npm run lint` — clean (matches baseline).
   - `npm test` — 385 files, ~7334 tests passing (current 384/7327 + 1 file with ~7 cases).

5. **Commit on branch `plan-373-autopopulate-world-notes`.**

   Stage:
   - `public/modules/world-notes-init.js` (new)
   - `src/index.html` (one inserted line)
   - `src/ai/world-notes-autopopulate.test.ts` (new)
   - `aiplans/plan_373.md` (new)
   - `aiplans/tasks_373.md` (new)

   Commit message:

   ```
   feat(ui): auto-populate predefined empty world notes on map:generated

   Implements plan 373 (Layer 4 of the world-building feature). When a
   map is generated and window.notes contains no world:* notes, creates
   the 6 predefined empty notes (premise, cosmology, pantheon, magic,
   calendar, history). Idempotent: if any world:* note exists (e.g.
   user deliberately deleted some), does nothing.
   ```

   Do NOT push.
