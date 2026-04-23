# Plan 226 — `find_states_by_type`

## Goal
Add a read-only AI tool that lists every active state whose `state.type` matches a caller-supplied type label. Parallels `find_burgs_by_type` (type-filter pattern) and `find_states_by_culture` (state enumeration pattern).

## Surface
- Tool name: `find_states_by_type`
- Required input: `type` (string, case-insensitive). Matches canonical `STATE_TYPES` (Generic, River, Lake, Naval, Nomadic, Hunting, Highland) defined in `set-state-type.ts`.
- Optional input: `limit` (integer, [1, 100000], default 10000).
- Output: `{ ok, type, states: [{i, name, fullName, form, color, capital}], count }`.
- `type` echoed back in canonical casing.
- `count` is the full unlimited total; `states` may be truncated by `limit`.
- Skip index-0 (Neutrals) + `removed: true` states.
- Read-only — no `pack` mutation.

## Error cases
- Missing / non-string / empty `type` → error with `supported` echoed.
- Unknown `type` → error with `supported` echoed.
- `limit` out-of-range / wrong shape → structured error.
- `pack.states` missing → "Map is not ready yet…".

## Files
- `src/ai/tools/find-states-by-type.ts` — tool module (runtime-seam pattern).
- `src/ai/tools/find-states-by-type.test.ts` — unit + integration tests.
- `src/ai/index.ts` — re-export symbols + `registry.register(findStatesByTypeTool)`.
- `README_AI.md` — table row near `find_states_by_culture`.

## Approach
1. Pure scanner `findStatesByTypeInPack(pack, type, limit)`: iterate `pack.states`, skip i=0 / removed / non-string `type` / mismatch; return `{ type, states, count }` or `"not-ready"`.
2. Runtime seam `FindStatesByTypeRuntime` with single `find(type, limit)` method. `defaultFindStatesByTypeRuntime` wraps `getPack<PackLike>()`.
3. Tool factory `createFindStatesByTypeTool(runtime = default)`: validates `type` via `resolveStateType` (imported from `set-state-type.ts`), validates `limit`, calls runtime, returns `okResult`/`errorResult`.
4. `findStatesByTypeTool` bound export.
5. Tests mirror `find-burgs-by-type.test.ts` structure: fake pack fixture with mixed types, `makePack()`, `asPack()`, `runtimeReturning`, `realRuntime`, plus a `describe` block for `defaultFindStatesByTypeRuntime` integration that stashes `globalThis.pack`.

## Non-goals
- No reuse of `STATE_TYPES` re-export — import from `set-state-type`, do NOT duplicate.
- No edits to `pack`.
- No UI wiring beyond tool registration.
