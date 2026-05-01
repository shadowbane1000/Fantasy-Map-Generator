# Tasks for Plan 371 — Inject snapshotted world context into chat prompt

1. **Add a world-context builder + snapshot field in
   `src/ai/chat-controller.ts`.**
   - Import `getNotes` and `RawNote` from `./tools/_shared`.
   - Add a top-level constant
     `const WORLD_CONTEXT_MAX_LEGEND_CHARS = 4000;`.
   - Add a top-level helper `function buildWorldContextBlock(): string`
     that:
     - Calls `getNotes<RawNote>()`. If undefined or empty, emits
       both placeholder lines.
     - Reads `notes.find(n => n?.id === "world:premise")?.legend`
       (treating empty / whitespace-only as missing).
     - Caps the legend at 4000 chars; if truncated, append
       `\n…(truncated)`.
     - Builds the topic list from notes whose `id` starts with
       `"world:"` and is NOT `"world:premise"`. Deduplicate by id,
       preserve first-seen order. If empty, render `(none yet)`.
     - Returns the exact text:
       ```
       # World context (snapshot at conversation start)

       World premise: <legend or "(not yet defined)">

       World topics defined: <comma-separated ids or "(none yet)">. Use `get_world_note(topic)` to fetch any of these.
       ```
   - Add `private worldContextBlock: string;` field.
   - In the constructor, set
     `this.worldContextBlock = buildWorldContextBlock();`.
   - In `reset()`, recompute
     `this.worldContextBlock = buildWorldContextBlock();` BEFORE
     emitting `cleared`.
   - In `send()`, change the `system` array from a 1-element to a
     2-element array; both blocks carry
     `cache_control: { type: "ephemeral" }`. The second block's
     `text` is `this.worldContextBlock`.

2. **Update `src/ai/chat-controller.test.ts`.** The existing
   "attaches a cache_control breakpoint to the system prompt" test
   pins `sysArr.toHaveLength(1)`. Update it to expect TWO entries:
   - `sysArr[0]` matches the existing assertion (text =
     "you are a test bot", cache_control ephemeral).
   - `sysArr[1]` is the world-context block: type `"text"`,
     `cache_control: {type:"ephemeral"}`, and `text` containing the
     placeholder phrases (since `globalThis.notes` is unset in this
     test). One `expect(sysArr[1].text).toContain("World premise:")`
     is enough — the precise wording is pinned by the new test file.

3. **Add `src/ai/chat-controller.world-snapshot.test.ts`.** Cover the
   nine test cases enumerated in `plan_371.md` § Tests. Use the
   `scriptedClient` / `makeResponse` helpers from
   `chat-controller.test.ts` (copy them into the new file — keep the
   files independent, mirroring the existing `chat-controller.click-request.test.ts`
   which also re-defines `nullClient`). Save and restore
   `globalThis.notes` in `beforeEach` / `afterEach` to avoid
   cross-test contamination, mirroring `remove-note.test.ts`.

4. **Verify.**
   - `npm test` — full suite green.
   - `npx tsc --noEmit` — clean.
   - `npm run lint` — matches the baseline (no new findings).

5. **Commit on branch `plan-371-prompt-world-injection`.** Stage:
   - `src/ai/chat-controller.ts`
   - `src/ai/chat-controller.test.ts`
   - `src/ai/chat-controller.world-snapshot.test.ts`
   - `aiplans/plan_371.md`
   - `aiplans/tasks_371.md`

   Commit message (verbatim from the plan brief):

   ```
   feat(ai): inject snapshotted world context into chat prompt

   Implements plan 371 (Layer 2 of the world-building feature). At
   conversation start, snapshots window.notes['world:premise'] and the
   inventory of world:* topics into a cached prompt section between two
   cache_control breakpoints. The snapshot is frozen for the lifetime of
   the conversation; clear() refreshes it. New world notes added
   mid-conversation appear only in the next conversation.
   ```

   Do NOT push.
