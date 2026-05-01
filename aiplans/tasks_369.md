# Tasks for Plan 369 — Tell the AI that up is always north

1. **Insert orientation clause into `DEFAULT_SYSTEM_PROMPT`.**
   In `src/ai/chat-controller.ts`, between the introductory paragraph
   (ends with "prefer using a tool to describing what the user should
   click.") and the `# How to approach a request` heading, add a
   single new paragraph:

   ```
   **Map orientation**: up is always north; the map is not rotatable. East is +x, west is -x; south is +y, north is -y.
   ```

   Keep the rest of the prompt verbatim. No surrounding-content edits.

2. **Run the verification suite.** From the worktree root:
   - `npx tsc --noEmit` — must succeed.
   - `npm run lint` — must remain clean (matches baseline).
   - `npm test` — full Vitest suite must stay green.

3. **Commit on branch `plan-369-system-prompt-north`.** Stage only
   `src/ai/chat-controller.ts`, `aiplans/plan_369.md`, and
   `aiplans/tasks_369.md`. Commit message:

   ```
   docs(ai): tell the AI that up is always north

   Implements plan 369. Adds a one-line orientation clause to the chat
   system prompt so the AI stops asking "which way is north?" — the
   map's orientation is fixed (up = north, +y = south, +x = east).
   ```

   Do NOT push.
