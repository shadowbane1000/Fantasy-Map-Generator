# Plan 373 — Auto-populate predefined empty world notes on `map:generated`

## Use case

This plan is **Layer 4 of a 4-plan world-building feature** (plans
370 / 371 / 372 establish the `world:<topic>` id convention with
predefined topics; this plan auto-creates the empty placeholders).

Without auto-population, a freshly generated map has zero `world:*`
notes — the user has to manually click `+` in the notes editor for
every predefined topic before they can write anything. This plan
eliminates that friction by hooking the existing `map:generated`
event and inserting the 6 predefined empty notes if (and only if)
none currently exist.

The 6 predefined topics, in user-stated order:

1. `world:premise`   → `"World — Premise"`
2. `world:cosmology` → `"World — Cosmology"`
3. `world:pantheon`  → `"World — Pantheon"`
4. `world:magic`     → `"World — Magic"`
5. `world:calendar`  → `"World — Calendar"`
6. `world:history`   → `"World — History"`

Each created note has `legend: ""`. This list MUST stay in sync with
plan 370 / 372 (same 6 topics, same id strings, same display names).

## Idempotency contract

The auto-populate hook is idempotent **and** preserves user intent:

- Run the populate logic on a notes array containing **zero**
  `world:*` entries → returns the 6 default notes to add.
- Run it on a notes array containing **any number** of `world:*`
  entries (1, 5, or 6) → returns an empty array (no additions).
- Therefore: a user who deliberately deletes 5 of the 6 notes and
  regenerates the map keeps their single remaining note untouched
  — we do not auto-recreate the missing 5. The user's intent is
  preserved.
- Running the listener twice on the same array does not duplicate:
  after the first call inserts 6, the second call sees 6 `world:*`
  notes and bails.
- The listener fires for both initial generation and every
  regenerate-map call. The idempotency check above handles both.

## Lint baseline

`npm run lint` on plan-373 base (branch
`plan-373-autopopulate-world-notes`, based on `master @ f160a57`):

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 842 files in 692ms. No fixes applied.
```

Clean. Post-implementation lint must remain clean.

`npm test` baseline: 384 test files, 7327 tests passing.
`npx tsc --noEmit` baseline: clean.

Note: Biome only scans `src/**/*.ts`, so the new
`public/modules/world-notes-init.js` file is not lint-scanned (per
CLAUDE.md). Only the new TS test file is in scope for Biome.

## Where the event is dispatched

Verified via `grep -rn "map:generated" public/ src/ tests/`:

- **Dispatched** at `public/main.js:1257`:
  ```js
  window.dispatchEvent(new CustomEvent("map:generated", {detail: {seed, mapId}}));
  ```
  — fires from `showStatistics()` after every generation, including
  regenerate.
- **Listened on** by ~20 AI tool prompts (all just describing the
  event for the model — they don't actually attach listeners).
- **E2E tests** in `tests/e2e/` wait on this event before asserting
  (e.g. `tests/e2e/load-map.spec.ts` pattern).

The event already exists; we just need a new listener.

## Behavior / hook placement

A new file `public/modules/world-notes-init.js` is added. It is a
classic-JS file (no ESM, matches the prevailing `public/modules/**`
style) loaded as a `<script defer>` tag from `src/index.html`. The
file:

1. Defines a `PREDEFINED` array of 6 topic keys (in user-stated
   order: `premise, cosmology, pantheon, magic, calendar, history`).
2. Defines a pure helper `buildDefaults()` that returns the 6 notes.
3. Defines a pure helper `decideAutoPopulate(notesArray)` that
   returns either `[]` (some `world:*` already exists) or
   `buildDefaults()` (none exist; returns the 6 to add). Treats a
   non-array input as "empty" and returns the 6 defaults — this
   covers the early-fire case where `window.notes` somehow isn't
   initialized yet.
4. Defines an `ensureWorldNotes()` side-effect wrapper that:
   - Initializes `window.notes` to `[]` if it's not an array.
   - Calls `decideAutoPopulate(window.notes)`.
   - Pushes each returned note onto `window.notes`.
5. Registers the listener: `window.addEventListener("map:generated",
   ensureWorldNotes)`.
6. Exposes the pure helpers on `window.__worldNotesAutoPopulate`
   (object literal `{ buildDefaults, decideAutoPopulate, PREDEFINED }`)
   so the unit test can exercise them.

The exposure on `window.__worldNotesAutoPopulate` is the standard
"pure logic exported via global for testability" pattern. The double
underscore prefix signals "test-only / internal." It is not
guarded by a build flag because the cost is trivial (~3 function
references on `window`) and there is no real downside.

## Files

- **NEW** `public/modules/world-notes-init.js` — classic JS, ~30
  lines including the `PREDEFINED` list, two pure helpers, the
  side-effect wrapper, the listener registration, and the
  `window.__worldNotesAutoPopulate` exposure. `"use strict";` at the
  top, no IIFE (matches the prevailing style of
  `public/versioning.js` and other `public/modules/**/*.js`).

- **MODIFY** `src/index.html` — one new `<script defer>` tag
  inserted near the end of the script-tag block, alongside other
  classic-JS init scripts. Suggested placement: immediately after
  the `modules/io/export.js` line (the very last `<script>` in the
  current file, line 8600), so this initializer loads after every
  other classic module is parsed. (`defer` ordering is preserved by
  document order.) The listener registration runs at script-parse
  time, before `map:generated` ever fires (the first dispatch
  happens after at least one map-generation cycle, well after all
  `defer` scripts have executed).

## Tests

One new Vitest unit test:
**NEW** `src/ai/world-notes-autopopulate.test.ts` (placed under
`src/ai/` because the world-notes feature is part of the AI
chat-driven world-building flow, matching where the related plans
370–372 tests will live).

The test loads `public/modules/world-notes-init.js` via Node's
`fs.readFileSync` + `vm.runInNewContext`, supplying a fake `window`
sandbox. It then asserts on the exposed pure helpers
(`window.__worldNotesAutoPopulate.decideAutoPopulate` and
`buildDefaults`):

- **`buildDefaults` returns the 6 expected notes in order.** Each
  has the right `id`, `name`, and an empty `legend`.
- **`decideAutoPopulate([])` returns the 6 defaults.**
- **`decideAutoPopulate(undefined)` returns the 6 defaults** (early-
  fire case).
- **`decideAutoPopulate([{id:"burg7", legend:"X"}])` returns the 6
  defaults** (non-`world:*` notes don't count).
- **`decideAutoPopulate([{id:"world:premise", legend:""}])` returns
  `[]`** (any single `world:*` blocks repopulation — preserves user
  deletion intent).
- **`decideAutoPopulate(buildDefaults())` returns `[]`** (running
  the logic twice doesn't duplicate).
- **Idempotency end-to-end (via `ensureWorldNotes`)**: simulate a
  `map:generated` dispatch on the sandbox window, then a second
  dispatch — final `notes.length` === 6, not 12.

DOM event wiring is partially exercised by the idempotency case
above (we install the same listener the production code installs,
in the same sandbox). We do not test the production
`<script>`-tag wiring; that's covered by the existing E2E pattern
which would catch a missing `<script>` line if a future plan added
an assertion for `world:*` notes existing on map load.

## Verification

1. `npx tsc --noEmit` — must remain clean.
2. `npm run lint` — must remain clean (matches baseline).
3. `npm test` — must add 1 new file with ~7 new tests; existing
   384 / 7327 must remain green.

## Self-review checklist

To be re-verified after implementation:

- The `PREDEFINED` array order matches the user-stated order
  exactly: `premise, cosmology, pantheon, magic, calendar, history`.
- All 6 ids start with `world:` exactly (no `world-`, no `World:`).
- All 6 display names use `"World — "` with an em-dash (U+2014),
  not a hyphen-minus, matching the user-stated list.
- `legend` is the empty string `""`, not `null` or `undefined`.
- The new file uses `"use strict";` and double quotes, matching the
  style of `public/versioning.js`.
- The new `<script defer>` tag in `src/index.html` does NOT have a
  `?v=…` cache-busting suffix — but neither do many of the other
  recent additions; not load-bearing for this plan.
- The listener fires once per `map:generated` dispatch (we
  `addEventListener` exactly once at script-parse time; not inside
  any other handler).
- Idempotency: re-running the populate logic on the same array
  doesn't duplicate. Verified by unit test
  `decideAutoPopulate(buildDefaults())` → `[]`.
- User-deletion preservation: a notes array with **one** `world:*`
  note returns `[]` from the populate decision (no auto-recreation
  of the other 5). Verified by unit test.
- The hook does not modify any `pack`, `grid`, or rendering state —
  only `window.notes`. No redraw is needed (the notes editor reads
  `window.notes` lazily when opened).
- The exposed `window.__worldNotesAutoPopulate` global has a
  double-underscore prefix to signal "test-only / internal." It is
  read-only access; nothing in production code uses it.
- No upstream code references these specific note ids yet; that's
  the responsibility of plans 370 / 371 / 372 (already merged into
  master per the plan brief — but actually NOT visible in this
  worktree's git history, so the predefined-id convention only
  exists by user-spec). This plan establishes the on-disk default
  data; plan 372 (or wherever the notes-editor predefined-id list
  lives) consumes it. **If plans 370 / 371 / 372 are not yet
  merged in master at the time of merge, this plan still works
  standalone** — the 6 notes are simply created with `world:*` ids
  and the default name; they show up in the notes editor as
  ordinary entries, ready for the user to fill in.
