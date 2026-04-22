# Plan 16 — Use Case: List provinces

## Status

Iteration 16. 15 tools implemented. Baseline 7 warnings / 1 info / 0
errors. 204 tests pass.

## Use Case

**"List the provinces on the current map."**

The user sees these in the Provinces Editor: each province has a
short name, full name, formal form (County/Duchy/…), color, parent
state, and its capital burg (burg.i stored in `province.burg`).

Prompts:
- *"List all provinces."*
- *"Which provinces are in Altaria?"*
- *"What's the capital of Rookwood Duchy?"*

### Success criteria

1. `list_provinces()` returns `{ok, total, limit, offset,
   filters, provinces}`. Each entry: `{i, name, fullName, formName,
   color, state, stateId, burg, burgId, pole}`.
2. Skips index 0 and `removed` entries.
3. `state` resolved via `pack.states[province.state]?.name` (null
   allowed).
4. `burg` resolved via `pack.burgs[province.burg]?.name` (null when
   no capital burg is set).
5. `pole` is `[x, y]` if set, else null.
6. Paginated: `limit` 1–500 (default 100), `offset` ≥ 0.
7. Optional `state` filter: numeric id or case-insensitive string
   name (reuse `resolveStateRefInPack` from `list-burgs.ts` for the
   same semantics).
8. Graceful error when `pack` / `pack.provinces` missing.

## Scope

In-scope:
- Tool `list_provinces` with `ProvincesRuntime` seam and `state`
  filter.
- Pure helper `readProvincesFromPack(pack)`.
- Registry + README.
- Tests.

Out-of-scope: province editing, emblem/color changes.

## Design

New file: `src/ai/tools/list-provinces.ts`.

```ts
export interface ProvinceSummary {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  state: string | null;
  stateId: number;
  burg: string | null;
  burgId: number;
  pole: [number, number] | null;
}
export interface ProvincesRuntime {
  readProvinces(): ProvinceSummary[] | null;
  resolveStateRef(ref: number | string): number | null;
}
```

The default runtime reuses the pack lookups already needed: reads
`window.pack.provinces`, resolves state via
`resolveStateRefInPack` (exported from `list-burgs.ts`).

Executor validates paging + filter types, calls `readProvinces()`,
applies `state` filter post-hoc on `stateId`, slices.

## Files

Create: `plan_16.md`, `tasks_16.md`,
`src/ai/tools/list-provinces.ts`,
`src/ai/tools/list-provinces.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-provinces.test.ts`):

1. Full list default paging.
2. Honors limit/offset.
3. Invalid paging rejected.
4. `state` filter by id.
5. `state` filter by name (case-insensitive) via runtime resolver.
6. Unresolved state filter → error.
7. Runtime null → error.
8. `readProvincesFromPack` helper:
   - Skips index 0 + removed.
   - Resolves state name + burg name.
   - pole passthrough / null.
   - Null on missing pack.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 shape + total | helper + executor | 1, 8 |
| #2 skip 0/removed | helper | 8 |
| #3 state name | helper | 8 |
| #4 burg name | helper | 8 |
| #5 pole | helper | 8 |
| #6 paging | validator | 2, 3 |
| #7 state filter | executor | 4, 5, 6 |
| #8 pre-load error | runtime null | 7 |

Lint / test / build gates in tasks_16.md.
