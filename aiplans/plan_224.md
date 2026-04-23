# Plan 224 — `find_burgs_by_type` AI tool

## Goal
Add a read-only AI tool `find_burgs_by_type` that lists every active burg on the current map whose `burg.type` matches a caller-supplied type label (case-insensitive). Parallel to `find_burgs_by_state` / `find_burgs_by_culture` / `find_burgs_by_religion` and the type-only companion to `find_markers_by_type`.

## Shape
- Input:
  - `type` (string, required) — matched case-insensitively against the `BURG_TYPES` constant from `set-burg-type.ts` (`Generic`, `River`, `Lake`, `Naval`, `Nomadic`, `Hunting`, `Highland`).
  - `limit` (integer in `[1, 100000]`, default `10000`).
- Output: `{ ok, type, burgs: [{i, name, x, y, population, capital}], count }`.
- Runtime seam + `defaultFindBurgsByTypeRuntime` (reads `window.pack`).
- Errors: un-generated map (not-ready), missing / non-string / empty type, unknown type (reject with supported list), out-of-range limit.

## Implementation
- `src/ai/tools/find-burgs-by-type.ts`:
  - Import `BURG_TYPES` + `BurgType` + `resolveBurgType` from `./set-burg-type` (do NOT duplicate the constant).
  - `findBurgsByTypeInPack(pack, typeCanonical, limit)` — iterate `pack.burgs`, skip `i===0`, skip `removed`, filter by `(b.type ?? "").toLowerCase() === typeCanonical.toLowerCase()`. Returns `{ burgs, count }` or `"not-ready"`.
  - `defaultFindBurgsByTypeRuntime` wraps the pure scanner with `getPack<PackLike>()`.
  - `createFindBurgsByTypeTool(runtime?)` returns a `Tool` with schema + `execute`.
  - `findBurgsByTypeTool` default export.
- Register in `src/ai/index.ts`: import + `export {...}` barrel + `registry.register(findBurgsByTypeTool)` next to the other `find_burgs_by_*`.
- README_AI.md: add a row after `find_burgs_by_religion`.
- Match style: same result shape, same error messages, same "Requires an Anthropic API key…" tail.

## Testing
Mirror `find-burgs-by-state.test.ts` structure:
- Pure scanner tests.
- Tool surface tests (arg validation, limit boundaries, case-insensitivity, unknown type).
- `defaultFindBurgsByTypeRuntime` integration block with `beforeEach`/`afterEach` to install/remove `globalThis.pack`.

## Verification
- `npm run build` passes.
- `npm test` passes.
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
