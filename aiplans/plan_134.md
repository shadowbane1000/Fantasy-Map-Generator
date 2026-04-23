# Plan 134 — Use Case: Set Religion Center Cell

## Status

Iteration 134. Baseline 7 warnings / 1 info / 0 errors.
Existing religion-mutation tools include `rename_religion`,
`set_religion_color`, `set_religion_type`, `set_religion_form`,
`set_religion_deity`, `set_religion_expansion`, `set_religion_culture`,
`add_religion`, and `remove_religion`. This plan adds
`set_religion_center` — reassign a religion's `center` cell, the same
data-mutation the Religions Editor's center-drag performs. Parallel to
the just-merged `set_culture_center` (plan 132).

## Use Case

**"Change the origin cell of a religion."**

Each religion has a numeric `center` (cell index) that identifies its
"origin" cell. It's the cell the religion was seeded on and it drives
the `#religionsCenter{i}` marker shown while the Religions Editor is
open, as well as any re-expansion seeded from that cell.

The Religions Editor exposes this via a draggable circle — see
`public/modules/dynamic/editors/religions-editor.js` around line 557
(`handleDrag`). The core write is:

```js
pack.religions[religionId].center = cell;
recalculateReligions();
```

Notes on the editor behaviour:
- The drag handler ignores water cells (`pack.cells.h[cell] < 20 → return`),
  so only land cells "stick". We won't replicate the water guard — the
  tool is a data-layer seam and the engine tolerates any valid cell
  index. This matches the way `set_culture_center` handles the same
  situation.
- `recalculateReligions()` only runs the expansion if the "auto change"
  toggle is on. We do **not** run it from the tool — matching the rest
  of our `set_*` tools which stay pure data mutations.

Prompts:
- *"Move the Old Faith's center to cell 1523."*
- *"Set religion 3's origin cell to 982."*
- *"Re-center the Brightpath on cell 4412."*

### Success criteria

1. `set_religion_center({religion: 2, cell: 1523})` sets
   `pack.religions[2].center = 1523`.
2. Accepts `religion` as either numeric id (> 0) or case-insensitive
   name (`"religion-2"` resolves naturally via `parseEntityRef`'s
   id-like-string handling; name lookup matches the same rules as the
   other religion tools).
3. Rejects religion 0 (the "No religion" placeholder) — consistent with
   the other `set_religion_*` tools.
4. Rejects removed religions.
5. Rejects locked religions (consistent with the "respect locks"
   pattern seen in other editors; `set_culture_center` enforces the
   same).
6. Validates `cell` is an integer `0 ≤ cell < pack.cells.i.length`.
7. Returns `{ ok, i, previousCenter, center }` (also includes `name`
   for debuggability, matching other `set_religion_*` tools).
8. Idempotent: when the requested center equals the current center the
   tool returns a `noop: true` body — no pack mutation.

## Tool shape

```ts
export interface ReligionCenterRef {
  i: number;
  name: string;
  previousCenter: number;
  locked: boolean;
}

export interface ReligionCenterRuntime {
  find(ref: number | string): ReligionCenterRef | null;
  getCellCount(): number;
  apply(i: number, cell: number): void;
}
```

`defaultRuntime.find`:
- Resolves via `findEntityByRef(pack.religions, ref)` — skips
  `removed: true` and index 0.
- Returns `{ i, name, previousCenter, locked }`.

`defaultRuntime.getCellCount`:
- Returns `pack.cells.i.length` when `pack.cells.i` is an array;
  otherwise `0`.

`defaultRuntime.apply(i, cell)`:
- Re-reads `pack.religions[i]`; throws on missing / removed.
- Writes `religion.center = cell`.

Execute flow:
1. `parseEntityRef(input.religion, "religion")`.
2. Validate `cell` is a finite non-negative integer.
3. Look up the religion; handle not-found.
4. Reject `i <= 0` ("No religion" placeholder).
5. Reject `locked`.
6. `getCellCount()` must be > 0 and `cell` < that count.
7. Noop when `cell === previousCenter`.
8. Call `apply`; surface runtime errors via `errorResult`.

## Files touched

- **new** `src/ai/tools/set-religion-center.ts`
- **new** `src/ai/tools/set-religion-center.test.ts`
- `src/ai/index.ts` — import + register + export
- `README_AI.md` — add row near the other `set_religion_*` entries.

(`pack-types.ts` already has `center?: number` on `RawReligion`.)

## Verification

- `npm run build` succeeds.
- `npm test` — expect baseline + N.
- `npx biome check src/` — 7 warnings / 1 info / 0 errors.
