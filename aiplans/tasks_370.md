# Tasks for Plan 370 — World note tool family

1. **Create the shared helper module.** Add
   `src/ai/tools/_shared/world-notes.ts` exporting:
   - `WORLD_PREDEFINED_TOPICS` (readonly tuple, canonical order:
     premise, cosmology, pantheon, magic, calendar, history).
   - `WORLD_TOPIC_REGEX` = `/^[a-z][a-z0-9_-]{0,31}$/`.
   - `worldNoteId(topic)` → `` `world:${topic}` ``.
   - `defaultWorldNoteName(topic)` →
     `` `World — ${topic[0].toUpperCase()}${topic.slice(1)}` ``.
   - `parseWorldNoteId(rawId)` → topic string or `null`.
   - `isWorldNoteId(rawId)` → boolean.

2. **Create `src/ai/tools/set-world-note.ts`.** Mirrors `set-note.ts`
   structure: `WorldNoteRef`, `WorldNoteRuntime` (`find` / `write`),
   `defaultWorldNoteRuntime` reading `globalThis.notes`,
   `createSetWorldNoteTool(runtime)`, `setWorldNoteTool` const. Input:
   `topic` (required), `legend` (required), `name` (optional). Result
   shape per plan §1.

3. **Create `src/ai/tools/get-world-note.ts`.** Lookup-only;
   `WorldNoteInfoRuntime` returning `WorldNoteInfo | null` (forgiving:
   no `not-ready` state). Result shape per plan §2.

4. **Create `src/ai/tools/list-world-notes.ts`.** Reads
   `globalThis.notes`, filters to world-note ids via
   `parseWorldNoteId`, sorts predefined-first then alpha-by-topic.
   Result shape per plan §3 with `legend_length` and `predefined`
   per entry.

5. **Create `src/ai/tools/remove-world-note.ts`.** Idempotent splice;
   never errors on missing notes / missing array. Result shape per
   plan §4.

6. **Create matching `.test.ts` files** for each of the four tool
   files. Each test file must cover:
   - happy path on a **predefined** topic,
   - happy path on an **arbitrary** topic,
   - bad-regex rejection (uppercase, leading digit, leading hyphen,
     length > 32, empty, contains colon, contains space),
   - default-runtime / live `globalThis.notes` integration,
   - registry round-trip via the exported tool const,
   - tool-specific edge cases (e.g. set: whitespace legend / custom
     name; list: ordering; remove: idempotent).

7. **Wire into the registry.** In `src/ai/index.ts`:
   - Add four imports (alphabetical):
     `getWorldNoteTool`, `listWorldNotesTool`, `removeWorldNoteTool`,
     `setWorldNoteTool` from their respective tool files.
   - Add four `export { ... } from "./tools/..."` blocks (alphabetical
     among the existing tool re-exports; `get-world-note` between
     `get-wind` and any subsequent `get-y…`, etc.). Re-export the
     `create*Tool` factory plus the `*Tool` const at minimum.
   - Add four `registry.register(...)` calls — group them next to the
     existing note registrations:
     - `registry.register(getWorldNoteTool);` near `getNoteInfoTool`,
     - `registry.register(listWorldNotesTool);` near `listNotesTool`,
     - `registry.register(setWorldNoteTool);` near `setNoteTool`,
     - `registry.register(removeWorldNoteTool);` near `removeNoteTool`.

8. **Run the verification suite.** From the worktree root:
   - `npx tsc --noEmit` — must succeed.
   - `npm run lint` — must remain clean (matches baseline).
   - `npm test` — full Vitest suite must stay green.

9. **Commit on branch `plan-370-world-note-tools`.** Stage only the
   new tool files, their tests, the new shared helper, the modified
   `src/ai/index.ts`, `aiplans/plan_370.md`, and `aiplans/tasks_370.md`.
   Commit message:

   ```
   feat(ai): add world note tool family

   Implements plan 370 (Layer 1 of the world-building feature). Adds
   set_world_note / get_world_note / list_world_notes / remove_world_note
   tools that wrap window.notes with a reserved id convention
   (world:<topic>) and a predefined topic list (premise, cosmology,
   pantheon, magic, calendar, history) plus support for arbitrary
   user-defined topic names.
   ```

   Do NOT push.
