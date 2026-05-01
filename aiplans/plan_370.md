# Plan 370 — World note tool family (Layer 1 of world-building feature)

## Use case

The legacy `window.notes` array (entries shaped `{id, name, legend}`) is
the same store that the existing AI tools `set_note` /
`get_note_info` / `remove_note` / `find_notes_by_prefix` /
`list_notes` already write to and read from. Those tools accept any
arbitrary id string and treat the array as a flat keyspace.

Layer 1 of a four-plan world-building feature adds a friendlier,
opinionated wrapper: **world notes** — top-level lore documents that
describe the world _overall_ (premise, cosmology, pantheon, magic,
calendar, history) rather than a per-entity legend (per-burg /
per-state / per-marker / etc.). The AI uses these notes when the user
says things like "set the cosmology" or "tell me the world history",
without needing to know about the underlying `window.notes` storage,
the `world:` id prefix, or the predefined topic list.

The wrapper is layered on top of the existing `notes` array — it is
not a parallel store. A world note is _exactly_ a regular note whose
id happens to be `world:<topic>`. The standard note tools continue to
work on these ids; the world-note tools just provide a cleaner
ergonomic surface and a topic-based discovery mechanism.

## Lint baseline (before any changes)

`npm run lint` on plan-370 base (branch `plan-370-world-note-tools`,
based on `master @ 9118fd3`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 842 files in 698ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

## Predefined topics constant

Exported from `src/ai/tools/_shared/world-notes.ts`:

```ts
export const WORLD_PREDEFINED_TOPICS = [
  "premise",
  "cosmology",
  "pantheon",
  "magic",
  "calendar",
  "history",
] as const;
```

Ordering is significant: this is the canonical sort order used by
`list_world_notes` for predefined topics. It mirrors the user's
stated list exactly:
1. premise
2. cosmology
3. pantheon
4. magic
5. calendar
6. history

User-defined (arbitrary) topics that match the regex but are not in
this list are sorted alphabetically and appended after the predefined
block.

## Topic regex + sanitizer

`WORLD_TOPIC_REGEX = /^[a-z][a-z0-9_-]{0,31}$/`

Constraints:
- Must start with a lowercase letter (`a-z`). Leading digits / hyphens
  / underscores are rejected.
- Body characters are lowercase alphanumeric, hyphen, or underscore.
- Total length 1–32 characters.
- No uppercase, no whitespace, no `:` (would collide with the prefix
  separator), no other punctuation.

Tools accept the topic string verbatim — they do **not** auto-lowercase
or auto-trim before validating. The AI is expected to send
already-clean topic names. (Rationale: matches the strictness of
`set-note.ts`'s id handling, which trims but otherwise echoes the
input — for a structured topic the cleaner contract is "reject
malformed input" so the user's mental model of the topic stays
stable.)

Predefined topics all match the regex (verified by inspection).

## ID convention

`worldNoteId(topic)` → `` `world:${topic}` ``

`parseWorldNoteId(rawId)` → returns the topic substring if `rawId`
starts with `"world:"` AND the remainder matches `WORLD_TOPIC_REGEX`,
else `null`.

`isWorldNoteId(rawId)` is sugar for `parseWorldNoteId(rawId) !== null`.

`defaultWorldNoteName(topic)` →
`` `World — ${topic[0].toUpperCase()}${topic.slice(1)}` ``

Examples:
- `premise` → `"World — Premise"`
- `cosmology` → `"World — Cosmology"`
- `factions` → `"World — Factions"`
- `time-travel` → `"World — Time-travel"` (only the first character is
  upper-cased; the rest stays as the user wrote it).

## Per-tool input schema, behavior, errors, result shape

### 1. `set_world_note(topic, legend, name?)`

**Input schema**:
- `topic` (required, string) — must match `WORLD_TOPIC_REGEX`.
- `legend` (required, string) — note body / lore. May be HTML or plain
  text. Empty `""` clears; whitespace-only is rejected (mirrors
  `set-note.ts`).
- `name` (optional, string) — display name. If omitted or `null`,
  default to `defaultWorldNoteName(topic)`. If provided, must be a
  non-empty trimmed string.

**Behavior**: Resolves `rawId = worldNoteId(topic)`. Looks up an
existing entry in `window.notes`. Upserts: if absent, creates with
`{id: rawId, name: effectiveName, legend}`; if present, replaces both
name (with the supplied or defaulted name) and legend. Initializes
`window.notes` to `[]` if the global is missing or not an array
(mirrors `set-note.ts`'s `ensureNotesArray`).

**Errors**:
- `topic must be a non-empty string.` (missing / wrong-type)
- `topic must match ^[a-z][a-z0-9_-]{0,31}$.` (regex fail)
- `legend must be a string.` (wrong type)
- `legend must be empty ('') or contain non-whitespace characters.`
  (whitespace-only)
- `name, if provided, must be a non-empty string.`

**Result**: `okResult({ topic, raw_id, previous_legend, legend, name })`
where `previous_legend` is the prior legend string, or `null` if the
note didn't exist. (Symmetric to `set-note.ts`'s `previousLegend`
field, renamed to snake_case to match the rest of the world-note
result fields and the user's spec.)

### 2. `get_world_note(topic)`

**Input schema**:
- `topic` (required, string, same regex).

**Behavior**: Resolves `rawId = worldNoteId(topic)`. Looks up the
entry in `window.notes`. If `window.notes` is missing / not an array,
treat as "no note exists" (returns `exists: false`) — this is more
forgiving than `get_note_info`'s "not-ready" error because world
notes are user-authored from the chat, not machine-generated, so an
empty / uninitialized notes array is the normal pre-write state.

**Errors**:
- `topic must be a non-empty string.`
- `topic must match ^[a-z][a-z0-9_-]{0,31}$.`

**Result**:
- Found: `okResult({ topic, raw_id, name, legend })`.
- Not found: `okResult({ topic, raw_id, exists: false })`.

### 3. `list_world_notes()`

**Input schema**: empty object (no parameters).

**Behavior**: Iterates `window.notes`. For each entry whose id parses
as a world-note id (`parseWorldNoteId(id) !== null`), emit an entry.
Sorting:
1. Predefined topics in canonical `WORLD_PREDEFINED_TOPICS` order
   (premise, cosmology, pantheon, magic, calendar, history).
2. User-defined topics, sorted alphabetically by topic.

If `window.notes` is missing or not an array, return an empty list
(same forgiveness as `get_world_note`).

**Errors**: none — always returns ok.

**Result**: `okResult({ count, notes: [{ topic, raw_id, name, legend_length, predefined }] })`
where:
- `count` is `notes.length` (number of world notes returned).
- Each note carries `legend_length` (raw `legend.length`) instead of a
  truncated preview — the chat surface knows when to call
  `get_world_note` for the full body.
- `predefined: true` iff the topic is in `WORLD_PREDEFINED_TOPICS`.

### 4. `remove_world_note(topic)`

**Input schema**:
- `topic` (required, string, same regex).

**Behavior**: Resolves `rawId = worldNoteId(topic)`. Splices the
matching note out of `window.notes`. If `window.notes` is missing /
not an array OR no note with that id exists, returns
`{ ok: true, topic, raw_id, removed: false }` (idempotent — symmetric
to `get_world_note`'s forgiving "not found" handling).

**Errors**:
- `topic must be a non-empty string.`
- `topic must match ^[a-z][a-z0-9_-]{0,31}$.`

**Result**: `okResult({ topic, raw_id, removed })` where `removed` is
`true` iff a splice occurred.

## Files

New files (all under `src/ai/tools/`):

- `_shared/world-notes.ts`
  - exports `WORLD_PREDEFINED_TOPICS`, `WORLD_TOPIC_REGEX`,
    `worldNoteId()`, `defaultWorldNoteName()`, `parseWorldNoteId()`,
    `isWorldNoteId()`.
  - **Not** added to `_shared/index.ts` barrel — these helpers are only
    consumed by the four world-note tool files; keeping them out of the
    barrel prevents bloat.
- `set-world-note.ts` — `createSetWorldNoteTool()`, `setWorldNoteTool`.
- `get-world-note.ts` — `createGetWorldNoteTool()`, `getWorldNoteTool`.
- `list-world-notes.ts` — `createListWorldNotesTool()`, `listWorldNotesTool`.
- `remove-world-note.ts` — `createRemoveWorldNoteTool()`, `removeWorldNoteTool`.
- Matching `.test.ts` for each of the four tool files.

Modified file:

- `src/ai/index.ts` — add four imports (alphabetical), four `export {}`
  re-export blocks (alphabetical), four `registry.register(...)` calls
  (placed near the existing `setNoteTool` / `removeNoteTool` /
  `listNotesTool` registrations).

## Tests

Per-tool, the `.test.ts` file covers:

**`set-world-note.test.ts`**
- Creates a new note for a predefined topic (`premise`); auto-default
  name `"World — Premise"`; emits raw_id `"world:premise"`;
  previous_legend = `null`.
- Creates a new note for an arbitrary topic (`factions`); auto-default
  name `"World — Factions"`; emits raw_id `"world:factions"`;
  previous_legend = `null`.
- Updates an existing note's legend; previous_legend reflects the
  prior value.
- Custom `name` overrides the default.
- Empty-string legend clears.
- Whitespace-only legend rejected.
- Bad topic regex (uppercase, leading digit, leading hyphen, length
  33, empty, contains colon, contains space) all rejected.
- Bad name (empty / whitespace-only / non-string) rejected.
- Default-runtime integration: writing through the live
  `globalThis.notes`; missing `notes` initializes to `[]`.
- Registry round-trip: tool name and required field shape.

**`get-world-note.test.ts`**
- Reads an existing predefined-topic note.
- Reads an existing arbitrary-topic note.
- Returns `exists: false` for a topic with no note.
- Returns `exists: false` when `window.notes` is missing / non-array.
- Bad topic regex rejected.
- Default-runtime integration: read through live `globalThis.notes`.

**`list-world-notes.test.ts`**
- Lists nothing when no world notes exist (count 0).
- Lists only `world:*` entries — non-world notes (`burg12`,
  `state3`, etc.) are filtered out.
- Returns predefined topics in canonical order even when the array
  ordering differs (insert `history` first, then `premise`, then
  `cosmology` — list sorts to `premise, cosmology, history`).
- Returns user-defined topics alphabetically after predefined.
- `predefined` flag is correctly set per-entry.
- `legend_length` reflects raw legend length (no HTML stripping).
- Empty / missing `window.notes` returns count 0 with no error.
- Default-runtime integration with live `globalThis.notes`.

**`remove-world-note.test.ts`**
- Removes an existing world note (returns `removed: true`).
- Idempotent: removing a non-existent note returns `removed: false`
  (no error).
- Idempotent when `window.notes` is missing / non-array.
- Bad topic regex rejected.
- In-place splice: array reference preserved.
- Default-runtime integration through live `globalThis.notes`.

All four test files exercise both the seam-mocked path and the
default-runtime / live-globalThis integration path, mirroring the
structure of `set-note.test.ts` / `remove-note.test.ts` /
`get-note-info.test.ts` / `find-notes-by-prefix.test.ts`.

## Verification

- `npm test` — full Vitest suite green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (matches baseline above).

## Self-review

- **Reserved-id ergonomics**: tool inputs use `topic` only. The AI
  never has to write `"world:premise"` itself; tools translate
  `topic → rawId` internally and echo `raw_id` in the result for
  observability. The user explicitly required this.
- **Listing ordering**: the test plan above pins canonical order even
  when array ordering differs, ensuring `predefined` always appears
  first in the user's stated list order, with arbitrary topics
  alphabetical thereafter.
- **Test coverage**: every tool's tests touch (a) a predefined topic,
  (b) an arbitrary topic, (c) bad regex inputs, (d) the
  default-runtime / live-globals integration path, (e) registry
  round-trip via the exported `xxxTool` const.
- **Layered on the existing notes store**: world notes are real
  `window.notes` entries. They survive save/load (`save.js` /
  `load.js` already serialize the notes array). The standard
  `set_note` / `list_notes` / `find_notes_by_prefix` tools still see
  them. No new persistence path needed.
- **No collision with non-world ids**: the `world:` prefix is not used
  by any other id scheme in the codebase. `list-notes.ts`'s
  `KNOWN_PREFIXES` does not include `world`, so world notes appear as
  type `"other"` in `list_notes` (which is fine — the dedicated
  `list_world_notes` tool is the right way to surface them).
- **Forgiving reads**: `get_world_note`, `list_world_notes`, and
  `remove_world_note` treat a missing `window.notes` as "no notes
  yet". `set_world_note` initializes the array. This means the AI can
  write the first world note immediately after `map:generated`
  without a separate bootstrap step.
- **Why `previous_legend` instead of `previousLegend`**: the user's
  spec uses snake_case (`previous_legend`, `raw_id`,
  `legend_length`). We follow the spec verbatim. The existing
  `set-note.ts` uses camelCase; that's a fork in convention, not a
  precedent we're forced to keep.
- Commit message:

  ```
  feat(ai): add world note tool family

  Implements plan 370 (Layer 1 of the world-building feature). Adds
  set_world_note / get_world_note / list_world_notes / remove_world_note
  tools that wrap window.notes with a reserved id convention
  (world:<topic>) and a predefined topic list (premise, cosmology,
  pantheon, magic, calendar, history) plus support for arbitrary
  user-defined topic names.
  ```
