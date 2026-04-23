# Plan 150 — set_culture_origins AI tool

## Use case

Each culture in `pack.cultures` has an `origins: number[]` field — a
list of parent-culture indices used to drive heraldic kinship. When
the Emblem / COA generator rolls a culture's coat of arms, it pulls
traits from ancestor cultures via their `origins` chain (generator
output in `public/modules/dynamic/editors/cultures-editor.js` and in
`src/modules/cultures-generator.ts` initialises every new culture to
`origins = [0]` meaning "no parent"). The Cultures Editor's
add / generator workflow accepts a comma-separated origins string
(`cultures-editor.js:836-930`) and `remove_culture` already cascades
origin removals into other cultures (`remove_culture.ts:80-88`).

There is no AI tool yet that can directly set a culture's parentage,
so the assistant can't curate cultural lineage / heraldic descent.
Add `set_culture_origins` to fill that gap.

## UI reference

- `public/modules/dynamic/editors/cultures-editor.js`
  - line 529-531 — removeCulture cascades: filters the removed id
    out of every other active culture's `origins`; resets empty
    arrays to `[0]`.
  - line 836-839 — CSV export writes origins as a comma-separated
    list of parent culture names.
  - line 865-930 — the generator step `restoreOrigins` parses a
    comma-separated string of names back into an `origins: number[]`
    and falls back to `[0]` if empty.
- `src/modules/cultures-generator.ts:1212` — new cultures start with
  `origins = [0]`.
- `src/ai/tools/remove-culture.ts:80-88` — same cascade shape
  (filter + reset to `[0]`).

## Scope

Add one tool: `set_culture_origins(culture, origins)`.

- `culture` — numeric id (>0) or case-insensitive name — required.
- `origins` — `number[]` of culture indices — required. Empty array
  allowed (means "no parent"; tool normalises to `[0]` so the data
  matches the generator's convention and the remove-cascade's
  reset).
- Validates:
  - each origin is a non-negative integer; within bounds
    (`origin < pack.cultures.length`);
  - origin's target culture exists and is not removed;
  - origin is not the culture itself (no self-loop).
- Rejects culture 0 (Wildlands placeholder), removed cultures,
  locked cultures.
- Duplicates in `origins` are deduplicated (preserving order of
  first occurrence).
- Mutation: `pack.cultures[i].origins = [...cleaned]`.
- Data-only; no SVG redraw needed. Emblem regeneration uses
  origins lazily during `COA.generate`.
- Response: `{ ok, i, name, previousOrigins, origins }`.

## Runtime seam

Match `set-culture-center.ts`:

```ts
interface CultureOriginsRuntime {
  find(ref): CultureOriginsRef | null;
  getCulturesInfo(): { length: number; removed: Set<number> };
  apply(i: number, origins: number[]): void;
}
```

`find` exposes `{ i, name, previousOrigins, locked }`.
`getCulturesInfo` lets validation run without touching the live
pack inside the pure logic.

## Tests

`set-culture-origins.test.ts` — unit tests via `createSetCultureOriginsTool(runtime)`:

- applies origins by culture id
- applies origins by case-insensitive name
- empty array normalised to `[0]`
- idempotent when origins match current (noop: true? — we don't
  need a noop flag for this tool; we always return the final
  origins — keep it simple)
- dedups duplicates
- rejects culture 0
- rejects locked cultures
- rejects unknown refs
- rejects self-loop
- rejects invalid origin types (non-int, negative, NaN, string)
- rejects out-of-range origin ids
- rejects origins referring to removed cultures
- rejects non-array `origins`
- surfaces runtime apply() failures

Plus a `defaultCultureOriginsRuntime` integration block:

- writes `pack.cultures[i].origins` live
- refuses locked cultures
- rejects origin referencing removed culture
- empty array reset to `[0]`

## Other wiring

- Register in `src/ai/index.ts` next to `setCultureCenterTool` and
  export `createSetCultureOriginsTool` / `setCultureOriginsTool`.
- Add a row to `README_AI.md` near the other `set_culture_*`
  entries.
