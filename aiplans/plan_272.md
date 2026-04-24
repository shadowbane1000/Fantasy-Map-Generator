# Plan 272 — `find_duplicate_names` AI tool

## Goal

Add a read-only AI tool that scans a chosen entity domain (states,
provinces, burgs, cultures, religions, rivers) and returns every group
of two or more entities that share the same name (case-insensitive).
Useful for catching typos / accidental collisions after bulk renames.

## Scope

- Read-only; never mutates `pack`.
- Domains: `state`, `province`, `burg`, `culture`, `religion`, `river`.
  Skip `marker` for now since marker names come from `notes` (more
  complex shape).
- Skip the index-0 placeholder and any `removed: true` entry in each
  collection.
- Treat missing / empty `name` as no-name — an entity with no name is
  NOT considered to share a name with another no-name entity (we skip
  it entirely so the report is meaningful).
- Group by `name.trim().toLowerCase()`; only keep groups of size >= 2.
- Sort result groups by `count` descending, tie-break on lowercased
  name ascending for deterministic output.
- Optional `limit` (default 1000, max 100000) caps returned groups;
  `count` always reflects the full (uncapped) number of groups.

## Return shape

```
{
  ok: true,
  domain: "state",
  duplicates: [
    { name: "Stormreach", ids: [3, 7], count: 2 },
    ...
  ],
  count: <total groups, uncapped>
}
```

`name` in each group is the ORIGINAL-case name of the first entity
encountered (so the AI sees a human-friendly name rather than the
lowercased key).

## Structure (matches existing tools)

- Pure collector `findDuplicateNamesInPack(pack, domain, limit)`
  returning either a payload or `"not-ready"`.
- Runtime seam `FindDuplicateNamesRuntime` with a single
  `collect(domain, limit)` method. `defaultFindDuplicateNamesRuntime`
  reads `window.pack` via `getPack`.
- Tool factory `createFindDuplicateNamesTool(runtime)` produces the
  `Tool` with full description + `input_schema`. Exported singleton
  `findDuplicateNamesTool = createFindDuplicateNamesTool()`.

## Validation

- `domain` required; case-insensitive; must be in the allowed list.
- `limit` optional; integer in [1, 100000].
- "Map is not ready" when the corresponding collection is missing.

## Tests

All in `find-duplicate-names.test.ts`. Mirrors `find-adjacent-entities.test.ts`:

1. Pure collector:
   - finds duplicates in states (two entries sharing name).
   - case-insensitive grouping ("altaria" matches "Altaria").
   - skips index-0 placeholder & removed entries.
   - skips entries with missing / empty names.
   - groups of size 1 are dropped.
   - sort order: count desc, then lowercased name asc.
   - limit truncates `duplicates` but `count` is unlimited.
   - works for every domain (state, province, burg, culture,
     religion, river).
   - returns `"not-ready"` when the relevant collection is absent.
2. Tool surface:
   - ok=true with expected shape.
   - domain accepted case-insensitively.
   - rejects unknown/empty/non-string domain.
   - rejects invalid limit (0, negative, fractional, non-number,
     > max).
   - surfaces `"not-ready"` as structured error.
   - exported singleton has the expected schema.
3. `defaultFindDuplicateNamesRuntime` integration — stubs
   `globalThis.pack` and asserts the real runtime reads it, then
   restores the original globals.

## Registration

- Export the symbols and register the singleton in `src/ai/index.ts`
  next to `find_adjacent_entities`.
- Add a row in `README_AI.md` immediately after the
  `find_adjacent_entities` row, with the same style (description + 3-4
  example prompts).
