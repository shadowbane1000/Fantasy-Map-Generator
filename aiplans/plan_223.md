# Plan 223: find_religions_by_culture

## Goal

Add a new AI tool `find_religions_by_culture` that lists every active
religion whose origin culture (`religion.culture`) matches a given
culture. Parallel to `find_states_by_culture` / `find_burgs_by_culture`.

## Why

`get_culture_info` exposes counts, and `list_religions` enumerates every
religion globally. There's no bulk way to answer "which religions came
out of culture X?" — the origin-culture relationship is a direct
`religion.culture === cultureI` field lookup on `pack.religions`. This
mirrors `find_states_by_culture`'s shape exactly.

## Shape

```ts
{
  ok: true,
  culture: { i, name },
  religions: [
    { i, name, type, form, color, deity }
  ],
  count
}
```

- Required `culture`: non-negative integer id OR case-insensitive name.
  Allow id `0` (Wildlands placeholder) — cultures are unlike states /
  burgs in that 0 is valid.
- Optional `limit`: integer in [1, 100000], default 10000. `count` is
  always the full unlimited total.
- Skip religion `i === 0` (the "No religion" placeholder).
- Skip `removed: true` religions.
- Filter on `religion.culture === cultureI`.

## Reference files

- `src/ai/tools/find-states-by-culture.ts` (+ test) — direct analog.
- `src/ai/tools/list-religions.ts` — religion iteration.
- `src/ai/tools/get-religion-info.ts` — for `religion.culture` reading
  and field semantics.
- `src/ai/tools/_shared/index.ts` — helpers (`errorResult`, `okResult`,
  `getPack`, `RawReligion`, `RawCulture`).

## Implementation strategy

Runtime-seam pattern identical to `find-states-by-culture.ts`:

1. Exports: `DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT = 10000`,
   `MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT = 100000`,
   `FindReligionsByCultureHit`, `FindReligionsByCulturePayload`,
   `FindReligionsByCultureResult`, `ResolvedCulture`,
   `ResolveCultureResult`, `resolveCultureRefInPack`,
   `findReligionsByCultureInPack`, `FindReligionsByCultureRuntime`,
   `defaultFindReligionsByCultureRuntime`,
   `createFindReligionsByCultureTool`, `findReligionsByCultureTool`.

2. Per-religion hit fields: `{ i, name, type, form, color, deity }`
   — mirrors `list_religions` subset. `type` / `form` / `color` /
   `deity` fall back to `null` when missing on the raw entry.

3. Pure scanner `findReligionsByCultureInPack(pack, cultureI, limit)`:
   - returns `"not-ready"` when `pack?.religions` is missing;
   - iterates `pack.religions`, skipping `i === 0`, `removed`, and
     non-matching `culture`;
   - populates the full `count` and truncates `religions` at `limit`.

4. `resolveCultureRefInPack` — identical to the one in
   `find-states-by-culture.ts` (allows id 0; resolves by
   case-insensitive name; skips removed). Local copy (do NOT import
   across tools — shared-constants restriction).

5. Input parsing: `parseCultureRef`, `parseLimit` — mirror
   `find-states-by-culture.ts`.

6. Tool `name: "find_religions_by_culture"`, `required: ["culture"]`,
   schema with `culture` (integer | string, >= 0) and `limit`
   (integer, min 1, max 100000).

7. Register in `src/ai/index.ts` near `findStatesByCultureTool`
   (import, export-from, and `registry.register`).

8. `README_AI.md` row between `find_states_by_culture` and
   `find_provinces_by_state`.

## Tests

Mirror `find-states-by-culture.test.ts`:

- Pure scanner: multi-culture, no cross-contamination, culture 0
  (Wildlands), empty culture, skip i=0/removed, truncation with full
  count, field shape, null fallbacks, not-ready paths.
- `resolveCultureRefInPack`: numeric id, case-insensitive name, 0
  allowed, not-found for unknown / removed / OOR, not-ready when
  cultures missing.
- Tool surface: numeric / string / culture 0, invalid culture, not-found,
  not-ready from resolve and find, removed culture, limit truncation
  + full count, invalid limit, default limit, empty result.
- `defaultFindReligionsByCultureRuntime` integration: mutates
  `globalThis.pack`.

Fixture: 5 cultures (0=Wildlands, 1, 2, 3 removed, 4 empty), religions
with various `culture` ids incl. 0, some removed, plus the i=0
placeholder and one with no culture field.

## Verification

- `npm test` — new tests pass; overall count jumps by the new tests.
- `npm run build` — TS strict mode passes.
- `npm run lint` — 7 warnings / 1 info / 0 errors baseline preserved.

## Non-goals

- Not modifying the shared `resolveCultureRefInPack` in
  `find-states-by-culture.ts` (each tool keeps its own local copy per
  project conventions).
- Not altering any runtime or registry beyond registration.
