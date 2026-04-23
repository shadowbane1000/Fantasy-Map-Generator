# Plan 117 — regenerate_burg_name AI tool

## Use case

The Burg Editor has two "regenerate name" buttons:

- `burgNameReRandom`
  (`public/modules/ui/burg-editor.js:123`) — random name
  from a random name-base (`Names.getBase(rand(...))`).
- `burgNameReCulture`
  (`public/modules/ui/burg-editor.js:145`) — name from the
  burg's culture's name-base (`Names.getCulture(culture)`).

Both set `burg.name` and update the SVG label text.

The AI chat already has `rename_burg` for manual renames
and `add_burg` which auto-names. But there's no way to
roll a new name from the existing generator — a common
user action.

## Scope

Add one tool: `regenerate_burg_name(burg, mode?)`.

- `burg` — id (> 0) or case-insensitive name.
- `mode` — optional; `"culture"` (default) or
  `"random"`.
- `"culture"`: delegates to
  `Names.getCulture(burg.culture)`.
- `"random"`: delegates to `Names.getBase(randomIndex)`
  where randomIndex is picked uniformly over the
  name-base count.
- Writes `burg.name = newName` and updates the SVG label
  best-effort.
- Idempotent? No — the new name is random, so each call
  produces a fresh name. Don't noop.

## Implementation

1. **New file `src/ai/tools/regenerate-burg-name.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getPackCollection, okResult, parseEntityRef,
     type RawBurg from `./_shared`.
   - `BURG_NAME_MODES = ["culture","random"] as const`.
   - `resolveBurgNameMode`.
   - `RegenerateBurgNameRef { i, name, culture }`.
   - `RegenerateBurgNameRuntime { find, generate, apply }`.
   - `defaultRegenerateBurgNameRuntime`:
     - find: findEntityByRef on burgs. Guard i > 0 &&
       !removed.
     - generate(mode, culture):
       - mode=culture: `Names.getCulture(culture)`.
       - mode=random: `Names.getBase(randIndex)` — need
         `window.nameBases.length` and a random int in
         range. Throw if Names / nameBases missing.
     - apply(i, name):
       - Write pack.burgs[i].name = name.
       - Best-effort update SVG `#burgLabel{i}` text.
   - Schema: `burg` (int|string, required), `mode`
     (string enum, optional, default "culture").

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-burg-name.test.ts`:
   - `resolveBurgNameMode`.
   - Unit (stubbed):
     - generates with default mode "culture"
     - generates with explicit "random"
     - rejects unknown mode
     - rejects invalid burg refs
     - rejects unknown burg
     - surfaces runtime errors
   - Integration:
     - stubs pack.burgs, Names, nameBases, document.
     - applies the new name; SVG text updated.

4. **README_AI.md** — row near `rename_burg`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-burg-name`
  green.
- `npm test -- --run` — 1428 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Two modes (culture / random) supported.
- Delegates to Names module for the roll.
- Updates burg.name and SVG label.
