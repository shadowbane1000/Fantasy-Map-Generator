# Plan 101 — regenerate_emblems AI tool

## Use case

The Tools panel has a Regenerate Emblems button
(`public/modules/ui/tools.js:92,466`) that calls the
global `regenerateEmblems()`, which:

1. Wipes every existing `#stateCOA*` / `#provinceCOA*` /
   `#burgCOA*` DOM element and the `emblems use`
   children.
2. Generates new `coa` (coat-of-arms) objects for every
   active state, burg, and province, with
   culture-appropriate heraldic kinship.
3. Re-draws the emblems layer (either via `drawEmblems`
   or by re-toggling the Emblems layer).

The AI chat has `set_culture_shield` (which cascades the
shield shape on existing coas) but no way to regenerate
the emblems entirely from scratch. This tool fills that
gap.

## Scope

Add one tool: `regenerate_emblems()` — zero parameters.

- Delegates to `window.regenerateEmblems()`.
- Computes and returns the counts it processed (active
  states + active burgs + active provinces).
- Errors clearly if the function is not available yet
  (map not loaded).

## Implementation

1. **New file `src/ai/tools/regenerate-emblems.ts`**:
   - Imports: errorResult, getGlobal, getPackCollection,
     okResult, types RawBurg, RawProvince, RawState from
     `./_shared`.
   - `RegenerateEmblemsCounts { states: number; burgs: number;
      provinces: number }`.
   - `RegenerateEmblemsRuntime { regenerate, counts }`.
   - `defaultRegenerateEmblemsRuntime`:
     - regenerate: get `regenerateEmblems` global; throw
       if missing; call it.
     - counts: count active (non-removed, id > 0) states,
       burgs, and provinces in the current pack.
   - Tool name: `regenerate_emblems`.
   - Schema: empty object, no required fields.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-emblems.test.ts`:
   - Unit (stubbed):
     - calls runtime.regenerate and returns counts.
     - surfaces errors when regenerate throws.
   - Integration:
     - stubs pack + `globalThis.regenerateEmblems`.
     - counts match active entities.
     - errors when regenerateEmblems is missing.

4. **README_AI.md** — row near `regenerate_map`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-emblems`
  green.
- `npm test -- --run` — 1254 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Delegates to `window.regenerateEmblems`.
- Reports counts.
- Errors clearly when the function is missing.
