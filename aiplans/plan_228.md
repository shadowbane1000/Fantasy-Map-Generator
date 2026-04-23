# Plan 228: `find_religions_by_type` AI tool

## Goal
Add a new read-only AI tool, `find_religions_by_type`, that lists every active religion whose `religion.type` matches a caller-supplied type label. Parallel to `find_states_by_type` and `find_cultures_by_type`, but operating over `pack.religions`.

## Behaviour
- Required input `type` (string). Case-insensitive compare against canonical religion types (`RELIGION_TYPES` from `set-religion-type.ts`: `Folk`, `Organized`, `Cult`, `Heresy`). Unknown types are rejected with the supported list — mirroring `find_states_by_type` (not the permissive `find_cultures_by_type`) because religion types are a constrained enum.
- Optional `limit` (integer in [1, 100000], default 10000). Truncates the `religions` array but `count` still reports the full unlimited total.
- Iterates `pack.religions` linearly:
  - skip index-0 "No Religion" placeholder (`r.i === 0`),
  - skip `removed: true`,
  - skip religions without a string `type`,
  - match case-insensitively against `RELIGION_TYPES` canonical.
- Echoes the canonical type (e.g. `"Folk"`) back in the response, like `find_states_by_type`.
- Returns `{ ok, type, religions: [{ i, name, color, form, deity, culture }], count }`.
  - `color` / `form` / `deity` fall back to `null` when missing.
  - `culture` is the origin-culture name (`pack.cultures[religion.culture].name`) or `null` when `religion.culture` is missing, 0 (Wildlands), or the culture is unavailable / removed.
- Errors on un-generated map (`not-ready`), missing / non-string / empty `type`, unknown `type`, or out-of-range `limit`.
- Read-only: never mutates `pack`.

## Files
- Create `src/ai/tools/find-religions-by-type.ts` (runtime-seam pattern, reuse `RELIGION_TYPES` / `resolveReligionType` from `set-religion-type.ts`).
- Create `src/ai/tools/find-religions-by-type.test.ts` (pure-scanner tests + tool-surface tests + `defaultFindReligionsByTypeRuntime` integration block).
- Register in `src/ai/index.ts` — import + `registry.register(...)` adjacent to `findCulturesByTypeTool`, and a re-export block.
- Add a README_AI.md row adjacent to `find_states_by_type` / `find_cultures_by_type`, including the "Requires an Anthropic API key" note and natural-language examples.

## Non-goals
- No mutation — no redraw / recalc hooks.
- No cross-layer references (does not look up burgs or states).
- Does not change existing tools or types.
