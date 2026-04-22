# Plan 14 — Use Case: List religions

## Status

Iteration 14. 13 tools implemented (rename_culture added last).
Baseline 7 warnings / 1 info / 0 errors. 188 tests pass.

## Use Case

**"List the religions on the current map."**

Seen by the user in the Religions Editor: name, type (Folk/Organized/
Cult/Heresy), form (Shamanism, Polytheism, etc.), deity, color,
culture (by name), cells, area, population.

Prompts:
- *"List the religions."*
- *"Which is the biggest religion?"*
- *"What's the deity of the Old Faith?"*

### Success criteria

1. `list_religions()` returns `{ok, total, limit, offset, religions}`.
   Each entry: `{i, name, type, form, deity, color, culture,
   cultureId, cells, area, population, expansion, code}`.
2. Skips index 0 placeholder and `removed` entries.
3. `population = round((rural + urban) * populationRate)`, with
   fallback to raw sum when rate is non-positive.
4. `culture` is the resolved culture name (`pack.cultures[id]?.name`),
   null when missing.
5. Paginated: `limit` 1–500 (default 100), `offset` ≥ 0.
6. Graceful error when `pack` / `pack.religions` is missing.

## Scope

In-scope: list_religions tool, paging, README, tests.
Out-of-scope: religion editing.

## Design

New file: `src/ai/tools/list-religions.ts`. Same shape as the other
list-* tools.

```ts
export interface ReligionSummary {
  i: number;
  name: string;
  type: string | null;
  form: string | null;
  deity: string | null;
  color: string | null;
  culture: string | null;
  cultureId: number;
  cells: number;
  area: number;
  population: number;
  expansion: string | null;
  code: string | null;
}
```

Pure helper `readReligionsFromPack(pack, populationRate)`.
`ReligionsRuntime` seam with `readReligions()`.

## Files

Create: `plan_14.md`, `tasks_14.md`,
`src/ai/tools/list-religions.ts`,
`src/ai/tools/list-religions.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-religions.test.ts`):

1. Full list default paging.
2. Honors limit/offset.
3. Rejects bad paging.
4. Runtime null → error.
5. `readReligionsFromPack`:
   - Skips index 0 + removed.
   - Resolves culture name by id.
   - Scales population.
   - Falls back on non-positive rate.
   - Returns null for missing pack.
   - Missing fields → null in the summary.

## Plan ↔ tasks ↔ tests verification

Each criterion has a matching test per the table in the pattern
used by plans 6/9/12. No new infra.

Lint / test / build gates in tasks_14.md.
