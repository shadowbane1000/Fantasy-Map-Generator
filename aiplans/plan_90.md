# Plan 90 — remove_religion AI tool

## Use case

The Religions Editor
(`public/modules/dynamic/editors/religions-editor.js:496`)
exposes a trash icon per religion. Confirming the prompt
runs `removeReligion(id)`:

1. Removes SVG `#religion{i}` / `#religion-gap{i}` under
   the `relig` layer.
2. Removes the debug `#religionsCenter{i}` element.
3. Zeroes every `pack.cells.religion[cell] = 0` that
   referenced this religion.
4. Marks `pack.religions[i].removed = true` (tombstone).
5. For every other active religion, filters the removed
   id out of its `origins` array. If the array becomes
   empty, it's reset to `[0]`.
6. Refreshes the editor panel.

The AI chat has `remove_province` (just added) and
similar removals for burg / marker / note / regiment /
route / zone / biome — but not religion. This tool fills
that gap.

## Scope

Add one tool: `remove_religion(religion)`.

- `religion` — id (> 0) or case-insensitive name.
- Rejects id 0 ("No religion" placeholder) and already-
  removed entries.
- Performs all six side-effects above (DOM + origins
  cleanup are best-effort).
- Returns `{ i, name, cascadedOrigins }` — cascadedOrigins
  is the count of other religions whose origins array
  was touched.

## Implementation

1. **New file `src/ai/tools/remove-religion.ts`**:
   - Imports: errorResult, findEntityByRef, getPack,
     okResult, parseEntityRef, type RawReligion from
     `./_shared`.
   - Local pack shape for cells.religion.
   - `RemoveReligionRef { i, name }`.
   - `RemoveReligionRuntime { find, remove }`.
   - `remove` returns cascadedOrigins count.
   - Default runtime:
     - find: findEntityByRef (skips id 0 and removed).
     - remove:
       - Zero pack.cells.religion entries === i.
       - Mark pack.religions[i].removed = true.
       - Walk other religions; filter origins to drop i;
         if empty, reset to [0]; count those updated.
       - Best-effort DOM: remove
         `#religion{i}`, `#religion-gap{i}`,
         `#religionsCenter{i}` via document.getElementById
         fall-through (the legacy UI uses d3 selections;
         document.getElementById works since the D3
         elements are bare DOM nodes with ids).
       - Return cascadedOrigins.
   - Schema: `religion` (int|string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `remove-religion.test.ts`:
   - Unit (stubbed):
     - removes by id
     - resolves by name
     - rejects invalid refs
     - rejects unknown religion
     - surfaces runtime errors
   - Integration:
     - stubs pack.cells.religion, pack.religions
       (including origins arrays referencing the target).
     - asserts cells cleared, tombstone set.
     - asserts other religions' origins filtered /
       defaulted to [0] when empty.
     - asserts cascadedOrigins count in payload.
     - rejects id 0.
     - rejects already-removed.

4. **README_AI.md** — row near `remove_province`.

## Verification

- `npm test -- --run src/ai/tools/remove-religion` green.
- `npm test -- --run` — 1117 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired, documented.
- Mutates pack.cells.religion, pack.religions[i], and
  origins on all other religions as the UI does.
- Best-effort DOM cleanup.
- Rejects invalid, id 0, already-removed.
