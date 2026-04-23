# Plan 133 — Use Case: Bulk-regenerate river names

## Status

Iteration 133. Baseline 7 warnings / 1 info / 0 errors. 1664 tests pass
(144 files). Existing bulk-regen tools: `regenerate_all_burg_names`,
`regenerate_all_state_names`, `regenerate_all_province_names`. The
single-river `rename_river` exists (free-form), but there is no
single-river regenerate tool. This plan adds the parallel
`regenerate_river_names` tool.

## Use Case

**"Reroll every river name at once."**

Unlike states/provinces/burgs there is no explicit "Regenerate Names"
button on the Rivers Overview — but the Rivers Editor
(`public/modules/ui/rivers-editor.js`) exposes per-river buttons that
call the canonical name functions. We use those same functions for the
bulk tool.

Per-river generation in the editor:

```js
// rivers-editor.js
function generateNameCulture() {
  const r = getRiver();
  r.name = riverName.value = Rivers.getName(r.mouth); // (default)
}

function generateNameRandom() {
  const r = getRiver();
  if (r) r.name = riverName.value = Names.getBase(rand(nameBases.length - 1));
}
```

`Rivers.getName(cell)` is defined in `src/modules/river-generator.ts`:

```ts
getName(cell: number) {
  return Names.getCulture(pack.cells.culture[cell]);
}
```

So:
- **culture mode** (default, matches editor button) →
  `Names.getCulture(pack.cells.culture[river.mouth])`.
- **random mode** → `Names.getBase(rand(nameBases.length - 1))`.

Rivers don't have on-map labels (the renderer `drawRivers()` only emits
`<path>` elements — no `<text>`); river names appear in the editor,
overview, and tooltips only. So there is no DOM label to refresh, and
no renderer function to call after a bulk rename. The runtime's
`redraw` step is still present for parity with the state/province
tools but is a best-effort no-op.

Prompts:
- *"Reroll every river name."*
- *"Give all rivers fresh random names (mode: random)."*
- *"Rename all the rivers using culture bases."*

### Success criteria

- `regenerate_river_names` registered on the default registry.
- Accepts optional `mode` (`"culture"` default, `"random"`). Rejects
  unknown modes.
- Skips `river.removed === true`. Skips `river.lock === true` if that
  key is ever set (rivers don't officially support `lock` today, but
  the tool future-proofs the check).
- Writes `river.name` with the exact value produced by the generator
  above.
- Returns `{ ok, mode, renamed: [{i, previousName, name}], skipped:
  [{i, name, reason}] }`.
- Per-river errors (missing `Names`, missing `pack.cells.culture`,
  etc.) are recorded in `skipped`, not thrown.
- `npm run build` succeeds, `npm test` all pass, lint matches baseline
  (7 warnings / 1 info / 0 errors).

## Shape

```
src/ai/tools/
  regenerate-river-names.ts        — new tool (runtime-seam pattern)
  regenerate-river-names.test.ts   — unit + integration tests

src/ai/tools/_shared/pack-types.ts — RawRiver gets optional `lock?: boolean`
src/ai/index.ts                    — import + export + registry wire-up
README_AI.md                       — table row near rename/remove_river
```

## Runtime seam

```ts
interface RegenerateRiverNamesRuntime {
  list(): RegenerateRiverNamesRiverRef[];
  generate(mode: RiverNameMode, mouth: number): string;
  apply(i: number, name: string): void;
  redraw(): void; // best-effort noop — rivers have no on-map labels today
}
```

`RegenerateRiverNamesRiverRef = { i, name, mouth, lock?, removed? }`.

Default runtime:
- `list()` reads `pack.rivers` via `getPackCollection<RawRiver>("rivers")`.
- `generate("culture", mouth)` throws unless `Names.getCulture` and
  `pack.cells.culture` are available, then returns
  `Names.getCulture(pack.cells.culture[mouth])`.
- `generate("random", _)` picks a random index in `nameBases` and
  returns `Names.getBase(baseIndex)`.
- `apply(i, name)` mutates `pack.rivers[k].name` for the river with
  `r.i === i` (ids are non-contiguous; can't index the array).
- `redraw()` calls `drawRivers()` if present (best-effort —
  `drawRivers` only re-emits paths, no labels; still cheap and matches
  the state/province pattern).

Mode resolver is colocated (no single-river tool to share with):

```ts
export const RIVER_NAME_MODES = ["culture", "random"] as const;
export type RiverNameMode = (typeof RIVER_NAME_MODES)[number];
export function resolveRiverNameMode(value: unknown): RiverNameMode | null;
```

## Skip reasons

- `"removed"` — `river.removed === true`.
- `"locked"` — `river.lock === true`.
- `"generate failed: <error message>"` — generator threw.
- `"generator returned empty string"` — generator returned non-string
  or whitespace.
- `"apply failed: <error message>"` — apply step threw.

## Tests

Unit (injected-runtime) tests mirror `regenerate-all-state-names.test.ts`:
1. default mode is culture; skips locked and removed.
2. explicit random mode canonicalizes case (`"RANDOM"` → `"random"`).
3. unknown mode returns `errorResult` and never touches runtime.
4. generator errors go to `skipped`; loop continues; `redraw` still
   called once.
5. empty generator output is skipped.
6. apply errors go to `skipped`; loop continues.
7. list-throws returns `errorResult` and never calls `redraw`.
8. redraw failure is swallowed (renames still returned).

Integration block uses `defaultRegenerateRiverNamesRuntime` (via
`regenerateRiverNamesTool.execute(...)`) with real
`pack`/`Names`/`nameBases`/`drawRivers` set on `globalThis`:
- culture mode: renames only non-locked, non-removed rivers; calls
  `Names.getCulture` with the mouth cell's culture.
- random mode: calls `Names.getBase` + passes a numeric base index.
- per-river error when `Names` is missing (no throw).
- per-river error when `nameBases` missing in random mode.
