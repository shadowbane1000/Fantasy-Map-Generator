# Plan 120 — regenerate_all_burg_names AI tool

## Use case

The Burgs Overview has a "Regenerate names" button
(`public/modules/ui/burgs-overview.js:222`) that, for
every non-locked burg:

```js
const name = Names.getCulture(burg.culture);
burg.name = name;
// update row input + SVG label
```

This is a common "refresh" action after switching
cultures set or name base. It skips locked burgs
(`burg.lock = true`) so users can preserve specific
names.

The AI already has `regenerate_burg_name` for a single
burg. This adds the bulk version.

## Scope

Add one tool: `regenerate_all_burg_names(mode?)`.

- `mode` — `"culture"` (default, matches UI) or
  `"random"`. The UI only offers culture mode; random
  is an AI extension.
- Skips locked burgs (`burg.lock === true`).
- Skips removed burgs and burg 0.
- Writes `burg.name = newName` and best-effort updates
  each `#burgLabel{i}` SVG text.
- Returns counts: `{ regenerated, skippedLocked,
  skippedRemoved }`.

## Implementation

1. **New file `src/ai/tools/regenerate-all-burg-names.ts`**:
   - Imports: errorResult, getGlobal, getPack,
     okResult, type RawBurg from `./_shared`.
   - Import `BURG_NAME_MODES`, `resolveBurgNameMode`
     from `./regenerate-burg-name` (share the enum).
   - `RegenerateAllBurgNamesCounts { regenerated,
      skippedLocked, skippedRemoved }`.
   - `RegenerateAllBurgNamesRuntime { regenerate }` —
     single method that walks the burgs, applies, and
     returns counts.
   - `defaultRegenerateAllBurgNamesRuntime`:
     - Read pack.burgs; throw if missing.
     - Read Names module; throw if missing or missing
       the required function for the mode.
     - For random mode: also need nameBases.
     - Walk each burg:
       - Skip i === 0 (placeholder).
       - Skip removed.
       - If locked: increment skippedLocked.
       - Else:
         - Generate name (culture: Names.getCulture(
           burg.culture); random: Names.getBase(rand)).
         - Write burg.name.
         - Best-effort label update.
         - increment regenerated.
     - Return counts.
   - Schema: `mode` (string enum optional, default
     culture).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-all-burg-names.test.ts`:
   - Unit (stubbed):
     - default culture mode
     - explicit random
     - rejects unknown mode
     - surfaces runtime errors
   - Integration:
     - stubs pack.burgs (mixture: id 0, 1, 2 locked, 3
       removed, 4), Names, nameBases, document.
     - culture mode: Names.getCulture called for
       non-locked, non-removed burgs; counts match.
     - random mode: Names.getBase called per unlocked
       burg.
     - errors when Names missing.

4. **README_AI.md** — row near `regenerate_burg_name`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-all-burg-names`
  green.
- `npm test -- --run` — 1476 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Two modes; default matches UI (culture only).
- Skips locked and removed burgs.
- Counts returned.
