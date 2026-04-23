# Plan 227 — `find_cultures_by_type` AI tool

## Goal
Add a read-only AI tool that lists every culture whose `culture.type` matches a caller-supplied type label — the type-filtered parallel of `list_cultures` and the bulk counterpart to `set_culture_type` / `get_culture_info`. This is the cultures-shaped analog of `find_burgs_by_type`, matched via a case-insensitive compare against the raw `culture.type` string (no canonicalization step, so the tool works even for maps with legacy / custom type strings).

## Shape
- File: `src/ai/tools/find-cultures-by-type.ts`
- Test: `src/ai/tools/find-cultures-by-type.test.ts`
- Register in `src/ai/index.ts` (import + re-exports + `registry.register`).
- Add a README_AI.md row adjacent to `find_states_by_culture`.

## Tool contract
- name: `find_cultures_by_type`
- input:
  - `type` (string, required) — matched case-insensitively against the raw `culture.type` string. Culture 0 (Wildlands) has `type` `""` or similar — we echo the caller's `type` back as-is (after trim), but still apply the lowercased compare.
  - `limit` (integer, 1..100000, default 10000).
- output: `{ ok, type, cultures: [{i, name, color, expansionism, base, center}], count }`.
  - `color` falls back to `null` when missing.
  - `expansionism`, `base`, `center` fall back to `null` when missing (all three are numeric fields in `RawCulture`).
  - `type` echoes the caller's requested type (trimmed) — we do NOT force canonical casing because raw cultures may carry arbitrary strings.
- read-only — no pack mutation.

## Key notes
- Unlike `find_burgs_by_type` (which validates against a canonical `BURG_TYPES` enum), `find_cultures_by_type` uses the flexible compare. The `set_culture_type` canonical list (`CULTURE_TYPES`) is what `set_culture_type` enforces on write — but reads can see arbitrary strings from user edits / imports. A flexible match matches how `find_zones_by_type` and `find_markers_by_type` behave.
- Culture 0 (Wildlands) is **allowed** when its `type` matches — the plan explicitly allows culture 0 unlike state/burg finders. In practice Wildlands usually has `type === ""`, so it won't match any caller-supplied non-empty type, but we don't filter it out on i===0 — we only filter on `removed: true`.
- Scan iterates `pack.cultures` linearly, skipping `removed: true` entries only. Matching: `typeof c.type === "string" && c.type.toLowerCase() === needle`.

## Implementation sketch
Closest analog: `find-burgs-by-type.ts` for the type-filter pattern, adjusted to drop the `BURG_TYPES` enum check since culture types on raw data are flexible.

- Constants: `DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT = 10000`, `MAX_FIND_CULTURES_BY_TYPE_LIMIT = 100000`.
- Types:
  - `FindCulturesByTypeHit = { i, name, color: string | null, expansionism: number | null, base: number | null, center: number | null }`
  - `FindCulturesByTypePayload = { type, cultures: Hit[], count }`
  - `FindCulturesByTypeResult = Payload | "not-ready"`
  - `FindCulturesByTypeRuntime`
  - `PackLike` — `{ cultures?: RawCulture[] }`
- `findCulturesByTypeInPack(pack, type, limit)` — iterate `pack.cultures`, skip `removed`, filter on lowercased-string compare. Cap output at limit, still increment `count`. Returns `"not-ready"` if `pack.cultures` is missing.
- `defaultFindCulturesByTypeRuntime` — reads pack via `getPack<PackLike>()`.
- `parseLimit` — same shape as existing tools.
- `createFindCulturesByTypeTool(runtime)` returns `Tool`; `findCulturesByTypeTool` is the default instance.
- `execute` validates `type` is a non-empty string, trims it, passes through to the runtime without canonicalization.

## Tests
Mirror `find-burgs-by-type.test.ts` structure (minus the canonical-type / rejects-unknown-type block since we don't validate the type):
- **Pure scanner block** (`findCulturesByTypeInPack`):
  - multi-match for one type (case-insensitive, e.g. "Generic" matches "Generic" and "generic")
  - second type, no cross-contamination
  - includes culture 0 when its type matches the caller input (edge case)
  - empty result when no culture has the type
  - skips `removed: true`
  - skips cultures with no `type` field
  - limit truncation preserves full `count`
  - field population (color, expansionism, base, center)
  - field fall-through to `null` when missing
  - `"not-ready"` when pack or pack.cultures is missing
- **Tool-surface block**:
  - ok with canonical-style input ("Highland")
  - ok case-insensitive (" highland ", "HIGHLAND", "highland")
  - rejects missing / non-string / empty / whitespace type
  - surfaces `"not-ready"` as error
  - explicit limit + full count
  - invalid limit (0, -1, 1.5, "10", MAX+1)
  - default limit applied when omitted
  - limit boundaries (1, MAX)
  - empty list when no match
  - exported schema shape + constants exported
- **`defaultFindCulturesByTypeRuntime` integration block**: find via default runtime, tool end-to-end, pack missing surfaces "not ready".

Use `as unknown as { ... }` casts on `FakePack` to keep tests permissive.

## Registration
- `src/ai/index.ts`:
  - Import `findCulturesByTypeTool` near `findBurgsByTypeTool`.
  - Add re-export block for `createFindCulturesByTypeTool`, `DEFAULT_…`, `defaultFindCulturesByTypeRuntime`, types, `findCulturesByTypeInPack`, `findCulturesByTypeTool`, `MAX_…`.
  - `registry.register(findCulturesByTypeTool)` adjacent to `findBurgsByTypeTool`.

## README_AI.md
Insert a new row near `find_states_by_culture`, with API-key line and example usage column (e.g. "List every Naval culture", "Show me all Highland cultures", "What are all the Nomadic cultures?").

## Verification
- `npm run lint` baseline 7 warnings / 1 info / 0 errors — must remain.
- `npm run build` passes.
- `npm test` passes; new suite adds coverage.
