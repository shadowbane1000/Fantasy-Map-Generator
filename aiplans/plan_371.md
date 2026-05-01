# Plan 371 — Inject snapshotted world context into chat prompt

## Use case

Layer 2 of a 4-plan world-building feature. Layer 1 establishes the
convention that user-defined world lore lives in `window.notes` under
ids prefixed `world:` — specifically `world:premise` for the top-level
premise legend, and `world:<topic>` for additional named topics. This
layer (plan 371) wires that convention into the chat assistant's
prompt so the AI sees the world premise and the inventory of available
world topics on every turn — without paying for it on every turn.

The chat controller already prompt-caches the system prompt and the
conversation tail (commit `ff2c546` "feat(ai): prompt-cache the system
prompt + conversation tail"). This plan adds a SECOND cache breakpoint
between the two existing ones, producing the structure:

```
[ tools + system_prompt ]                                    ← cache layer 1 (long-lived)
<cache_control: ephemeral>                                   ← marker on last system block
[ world context: world:premise + list of world:* topics ]    ← cache layer 2 (per-conversation)
<cache_control: ephemeral>                                   ← marker on last world-context block
[ conversation tail ]                                        ← uncached
<cache_control: ephemeral>                                   ← tail marker (existing)
```

The world-context block is a SECOND `system` text block (kept simple —
the Anthropic API allows the `system` field to be an array of text
blocks; ordering is `tools → system → messages`, so a marker on the
last system block covers everything before it, and a marker on the
penultimate system block creates a finer-grained breakpoint between
the two system entries).

The world context is **snapshotted at conversation start and frozen
for the lifetime of the conversation** — it does NOT update when notes
are mutated mid-conversation. Refresh happens when the conversation is
cleared (`controller.reset()`; the existing method on the class —
plan brief said `clear()` but the existing API name is `reset()`,
which we keep for backwards-compatibility with `chat-window.ts:320`).

User intent: keep cache layer 2 stable for the whole conversation;
new world notes added mid-chat appear in the next conversation.

## Lint baseline (before any changes)

`npm run lint` on plan-371 base (branch
`plan-371-prompt-world-injection`, based on `master @ 9118fd3`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 842 files in 727ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

## Convention check (`world:premise` + `world:*` ids)

The plan brief specifies `world:premise` as the id of the top-level
world legend, and `world:*` as the id-prefix convention for additional
world-building notes. A grep over the codebase confirms this is a
*new* convention (plan 370 will introduce the editor surface that
writes these ids; this plan only *reads* them):

```
$ grep -rn "world:premise\|world:" src/ public/ --include="*.ts" --include="*.js"
src/ai/tools/find-largest-provinces.test.ts:43:// Test world:
src/ai/tools/list-heightmap-templates.test.ts:26:    world: { id: 21, name: "World" },
src/ai/tools/get-province-distribution.test.ts:39:// Test world:
public/modules/ui/options.js:635:    world: 10,
public/config/precreated-heightmaps.js:25:  world: {id: 21, name: "World"},
```

None of these matches are the `world:` *id-prefix* convention — they
are unrelated (test comments, an option key named `world`, a
heightmap-template id `world`). Safe to claim the
`world:`-prefixed-id namespace for this feature.

The shape of `window.notes` entries is `{id, name, legend}` (per
`src/ai/tools/_shared/pack-types.ts:177` and
`public/modules/ui/notes-editor.js:25`). A "world premise" note is
just `{id: "world:premise", name: "...", legend: "..."}`. Topic notes
are `{id: "world:<topic>", ...}`.

## Snapshot lifecycle

- **Captured at controller construction.** The constructor calls a
  private `snapshotWorldContext()` once and stores the resulting
  string in `this.worldContextBlock`. (Captured at construction
  rather than at first `send()` — the controller is itself
  short-lived and is reconstructed when the user re-opens the chat
  window, so "construction" and "first send" coincide for normal
  use; capturing at construction makes the lifecycle one fewer state
  variable to reason about, and tests can directly assert on
  construction-time behavior.)

- **Refreshed on `reset()`.** The existing `reset()` clears history
  and emits `cleared`; we extend it to ALSO recompute
  `this.worldContextBlock`. New world notes added between the
  previous send and the reset will appear after the reset.

- **NOT refreshed on note mutation.** No subscription to
  `window.notes`; mutations made between sends do not change the
  snapshot.

- **NOT refreshed per send().** Subsequent `send()` calls in the same
  conversation re-use the cached `this.worldContextBlock` verbatim,
  so the cache hit is preserved.

## World-context block format

A short text block, suitable for the `system: [text-block, text-block]`
slot. Suggested wording (kept verbatim — tests pin the format):

```
# World context (snapshot at conversation start)

World premise: <world:premise legend, or "(not yet defined)">

World topics defined: <comma-separated list of `world:<topic>` ids that
exist, or "(none yet)">. Use `get_world_note(topic)` to fetch any of
these.
```

(The `get_world_note` tool referenced in the last sentence is a layer-3
artifact — plan 372 — but mentioning it here costs nothing; if the
tool isn't registered, the AI simply won't call it. Keeping it in the
text now means we don't have to amend cache-layer-2 wording later.)

## Cache structure (exact placement)

The Anthropic API orders content as `tools → system → messages`, so a
`cache_control` marker on a system text block creates a breakpoint
covering everything ordered before it. We use TWO system blocks:

1. **System block 0**: the existing `DEFAULT_SYSTEM_PROMPT`. Carries
   `cache_control: { type: "ephemeral" }` — this caches `tools +
   system[0]` (cache layer 1, long-lived, only invalidated when the
   system prompt or tools change).

2. **System block 1**: the world-context snapshot. Also carries
   `cache_control: { type: "ephemeral" }` — this caches `tools +
   system[0] + system[1]` (cache layer 2, per-conversation, frozen
   for the conversation's lifetime).

The conversation tail in `messages[]` continues to carry its own
`cache_control` marker via `withTailCacheBreakpoint` — that's cache
layer 3 (per-iteration, the existing behavior).

The Anthropic API caps cache breakpoints at 4 per request; we use 3
(system block 0, system block 1, tail), well within the budget.

## Edge cases

- **`window.notes` absent or non-array.** `getNotes()` returns
  undefined; emit:
  ```
  World premise: (not yet defined)

  World topics defined: (none yet). Use `get_world_note(topic)` to fetch any of these.
  ```
  (Same closing sentence so the AI's behaviour is uniform across
  bootstrap states.)

- **`world:premise` missing or has empty legend.** Emit
  `World premise: (not yet defined)`.

- **Very long premise legend.** Cap at 4000 chars; if truncated,
  append `\n…(truncated)`. The cache-layer-2 budget is generous (much
  larger than 4 KB) so this is purely a defensive cap to avoid
  pathological pastes ballooning the prompt.

- **Zero `world:*` notes.** Emit `World topics defined: (none yet).`
  followed by the same `Use get_world_note(...)` sentence.

- **Notes with `world:` prefix but `:premise` is the only one.** The
  topic list excludes `world:premise` (it's already shown above as the
  premise) and only lists OTHER `world:*` ids. If that filter leaves
  zero topics, render `(none yet)`.

- **Duplicate ids in `window.notes`.** Deduplicate by id before
  listing; preserve first-seen order.

## Files modified

- `src/ai/chat-controller.ts` — the only production file touched.
  Adds:
  - `WORLD_CONTEXT_MAX_LEGEND_CHARS = 4000` constant.
  - A private `buildWorldContextBlock(): string` (free helper, not a
    method — easier to test) that reads `getNotes()` and emits the
    text block above.
  - `private worldContextBlock: string` field initialised in the
    constructor.
  - `reset()` recomputes `this.worldContextBlock`.
  - `send()` builds the `system` array as `[default-block,
    world-context-block]`, both with `cache_control`.

- `aiplans/plan_371.md`, `aiplans/tasks_371.md` — this plan and its
  task list.

No new files. No changes to `_shared/globals.ts` (the existing
`getNotes()` helper already does what we need).

## Tests

New file `src/ai/chat-controller.world-snapshot.test.ts`. Patterns
follow `chat-controller.test.ts` (scriptedClient + makeResponse) and
`remove-note.test.ts` (saving and restoring `globalThis.notes`):

1. **Snapshot captured at construction with notes present.**
   Pre-set `globalThis.notes = [{id:"world:premise", legend:"It's a swamp."}]`,
   construct controller, send "hi", assert
   `client.calls[0].system[1].text` contains
   `World premise: It's a swamp.`.

2. **Snapshot DOES NOT refresh on note mutation between sends.**
   Construct with one premise, `await send("a")`, mutate
   `globalThis.notes[0].legend = "MUTATED"`, `await send("b")`,
   assert call 1 system[1] text matches call 0 system[1] text and
   neither contains "MUTATED".

3. **Snapshot refreshes on `reset()`.** Construct with one premise,
   `await send("a")`, mutate notes, `controller.reset()`, `await
   send("b")`. Call 1 system[1] now contains the new legend.

4. **`reset()` after no sends still recaptures.** Construct, mutate
   notes, `reset()`, `await send("a")`. The snapshot reflects the
   post-mutation notes.

5. **Long legend gets capped at 4000 chars + `…(truncated)`.**
   Premise legend = 5000 'x' chars. Assert system[1] text contains
   exactly 4000 'x' followed by `\n…(truncated)`.

6. **Empty / undefined notes → `(not yet defined)` / `(none yet)`.**
   Three sub-cases:
   - `globalThis.notes = undefined` → both placeholders present.
   - `globalThis.notes = []` → both placeholders present.
   - `globalThis.notes = [{id: "marker1"}]` (no `world:*` ids) →
     both placeholders present.

7. **Topic listing excludes `world:premise`, lists `world:*` ids in
   first-seen order, deduplicates.** Notes:
   `[world:premise, world:cosmology, marker1, world:religion,
   world:cosmology]`. Expect topic list to be
   `world:cosmology, world:religion`.

8. **Cache markers placed correctly.** With any non-trivial notes,
   assert:
   - `system[0].cache_control` is `{type:"ephemeral"}`.
   - `system[1].cache_control` is `{type:"ephemeral"}`.
   - The tail breakpoint (existing behavior) is still on the last
     content block of `messages[messages.length - 1]`.

9. **Premise legend with empty string is treated as missing.**
   `[{id:"world:premise", legend:""}]` → `World premise: (not yet
   defined)`.

(The existing `chat-controller.test.ts` `system` assertion at line 188
expects `sysArr.toHaveLength(1)` — that test must be updated to
expect TWO entries (the second one being the world-context block,
which for a freshly-constructed controller with no notes will contain
the placeholder text). The test for `cache_control` on the first block
remains intact.)

## Verification

- `npm test` — full suite green, including the new file.
- `npx tsc --noEmit` — clean.
- `npm run lint` — matches baseline.

## Self-review

- **Snapshot lifecycle matches user intent.**
  - Captured ONCE per conversation lifecycle (construction).
  - Refreshed by `reset()` (which is the existing "clear conversation"
    handler used by `chat-window.ts:320`).
  - NOT refreshed on note mutation (no subscription to `notes`).
  - NOT refreshed per `send()` — the `worldContextBlock` field is
    read verbatim each `send()`.

- **Cache placement preserves cache layer 1.** System block 0 still
  carries the same `cache_control` marker it has today, so the
  `tools + system[0]` prefix is still cacheable across conversations
  and across the controller-rebuild boundary. The new system block 1
  appears AFTER the existing one, so its presence does not invalidate
  the earlier prefix — the API always builds the cache prefix
  left-to-right.

- **Cache budget.** Anthropic allows up to 4 cache breakpoints per
  request. We use 3 (sys[0], sys[1], tail). Within budget.

- **No race vs. the legacy `notes-editor`.** The legacy editor
  mutates `window.notes` synchronously when the user types in the
  legend. Because the snapshot is captured at controller
  construction, edits made AFTER construction don't affect the
  current conversation — that's the desired behavior.

- **`reset()` ordering.** We recompute `this.worldContextBlock`
  BEFORE emitting the `cleared` event, so any listener that
  inspects the controller's state after the event (e.g. logs the
  new cached block) sees the post-reset value. (No listener does
  today, but it's the safer ordering.)

- **`getNotes` behavior.** Already returns `undefined` on missing /
  non-array; tests cover both. No change required to `globals.ts`.

- **Truncation marker.** The `\n…(truncated)` marker uses a Unicode
  ellipsis (U+2026) to match the visual style elsewhere in the
  codebase (e.g. `chat-window.ts` truncation code). Char-counted by
  `legend.length` (JS UTF-16 length), which matches what the API
  bills.

- **Test pin: existing chat-controller.test.ts.** The assertion
  `expect(sysArr).toHaveLength(1)` at line 188 of
  `chat-controller.test.ts` will fail as written; we update it in
  the same commit to `toHaveLength(2)` and add a sanity check that
  the second block is the world-context placeholder. No other test
  pins the system array shape.

- **Commit message.** Per brief:
  ```
  feat(ai): inject snapshotted world context into chat prompt

  Implements plan 371 (Layer 2 of the world-building feature). At
  conversation start, snapshots window.notes['world:premise'] and the
  inventory of world:* topics into a cached prompt section between two
  cache_control breakpoints. The snapshot is frozen for the lifetime of
  the conversation; clear() refreshes it. New world notes added
  mid-conversation appear only in the next conversation.
  ```
