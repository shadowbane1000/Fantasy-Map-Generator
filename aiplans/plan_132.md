# Plan 132 — Use Case: Set Culture Center Cell

## Status

Iteration 132. Baseline 7 warnings / 1 info / 0 errors.
Existing culture-mutation tools include `rename_culture`, `set_culture_color`,
`set_culture_type`, `set_culture_base`, `set_culture_shield`, `add_culture`,
`remove_culture`, and `set_entity_expansionism` (cultures). This plan adds
`set_culture_center` — reassign a culture's `center` cell, the same
data-mutation the Cultures Editor's center-drag performs.

## Use Case

**"Change the ancestral home cell of a culture."**

Each culture has a numeric `center` (cell index) that identifies its
"origin" cell. It's used by expansion simulation (`Cultures.expand`), by
the map overlay (the `#cultureCenter{i}` circle in the Cultures Editor
debug layer), and as a seed for culture-flavoured naming.

The Cultures Editor exposes this via a draggable circle — see
`public/modules/dynamic/editors/cultures-editor.js` around line 582
(`cultureCenterDrag`). The core write is:

```js
pack.cultures[cultureId].center = cell;
recalculateCultures();
```

Notes on the editor behaviour:
- The drag handler ignores water cells (`pack.cells.h[cell] < 20 → return`),
  so only land cells "stick". We won't replicate the water guard — the tool
  is a data-layer seam and the engine tolerates any valid cell index.
- `recalculateCultures()` only runs the expansion if the "auto change"
  toggle is on. We do **not** run it from the tool — matching the rest of
  our "set_*" tools which stay pure data mutations.

Prompts:
- *"Move the Highlanders' center to cell 1523."*
- *"Set culture 3's origin cell to 982."*
- *"Re-center the Coastalfolk on cell 4412."*

### Success criteria

1. `set_culture_center({culture: 2, cell: 1523})` sets
   `pack.cultures[2].center = 1523`.
2. Accepts `culture` as either numeric id (> 0) or case-insensitive name
   (`"culture-3"` is not special — `parseEntityRef` handles it naturally
   for numeric ids; name lookup matches the same rules as other culture
   tools).
3. Rejects culture 0 (Wildlands placeholder) — consistent with the other
   `set_culture_*` tools.
4. Rejects removed cultures.
5. Rejects locked cultures (consistent with the "respect locks" pattern
   seen in other editors; even though the drag UI doesn't enforce it, the
   task spec calls for it).
6. Validates `cell` is an integer `0 ≤ cell < pack.cells.i.length`.
7. Returns `{ ok, i, previousCenter, center }` (also includes `name` for
   debuggability, matching other set_culture_* tools).
8. Idempotent: when the requested center equals the current center the
   tool returns a `noop: true` body — no pack mutation.

## Tool shape

```ts
export interface CultureCenterRef {
  i: number;
  name: string;
  previousCenter: number;
  locked: boolean;
}

export interface CultureCenterRuntime {
  find(ref: number | string): CultureCenterRef | null;
  getCellCount(): number;
  apply(i: number, cell: number): void;
}
```

`defaultRuntime.find`:
- Resolves via `findEntityByRef(pack.cultures, ref)` — skips
  `removed: true` and index 0.
- Returns `{ i, name, previousCenter, locked }`.

`defaultRuntime.getCellCount`:
- Returns `pack.cells.i.length` when pack.cells.i is an array;
  otherwise `0`.

`defaultRuntime.apply(i, cell)`:
- Re-reads `pack.cultures[i]`; throws on missing / removed.
- Writes `culture.center = cell`.

Execute flow:
1. `parseEntityRef(input.culture, "culture")`.
2. Validate `cell` is a finite non-negative integer.
3. Look up the culture; handle not-found.
4. Reject `i <= 0` (Wildlands).
5. Reject `locked`.
6. `getCellCount()` must be > 0 and `cell` < that count.
7. Noop when `cell === previousCenter`.
8. Call `apply`; surface runtime errors via `errorResult`.

## Files touched

- **new** `src/ai/tools/set-culture-center.ts`
- **new** `src/ai/tools/set-culture-center.test.ts`
- `src/ai/index.ts` — import + register + export
- `README_AI.md` — add row near the other `set_culture_*` entries.

(`pack-types.ts` already has `center?: number` on `RawCulture`.)

## Verification

- `npm run build` succeeds.
- `npm test` — expect baseline + N.
- `npx biome check src/` — 7 warnings / 1 info / 0 errors.
