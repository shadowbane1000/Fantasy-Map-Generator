# Plan 109 — set_river_width AI tool

## Use case

The Rivers Editor
(`public/modules/ui/rivers-editor.js:222-234`) exposes
two numeric inputs that tune a river's width profile:

- `riverSourceWidth` [0, 3] — starting width at the
  source.
- `riverWidthFactor` [0.1, 4] — how quickly width grows
  along the course.

Writing either runs `updateRiverWidth` + `redrawRiver`
to recompute `river.width` and update the river's SVG
path. The AI chat already has `rename_river` and
`set_river_type` but no way to tune these width knobs.

## Scope

Add one tool: `set_river_width(river, sourceWidth?,
widthFactor?)`.

- `river` — id (> 0) or case-insensitive name (reuses
  `findRiverByRef`).
- `sourceWidth` — optional number in [0, 3].
- `widthFactor` — optional number in [0.1, 4].
- At least one of `sourceWidth` / `widthFactor`
  required.
- Writes the provided fields directly. Does NOT
  recompute `river.width` or redraw — the AI-first
  design is data-only; the UI will recompute on next
  open / regenerate. Documented.
- Idempotent: noop when all provided values already
  match.

## Implementation

1. **New file `src/ai/tools/set-river-width.ts`**:
   - Imports: errorResult, getPack, okResult,
     parseEntityRef, type RawRiver from `./_shared`;
     findRiverByRef from `./rename-river`.
   - Local `RiverPackLike`.
   - `RiverWidthRef { i, name, previousSourceWidth,
      previousWidthFactor }`.
   - `RiverWidthPatch { sourceWidth?, widthFactor? }`.
   - `RiverWidthRuntime { find, apply }`.
   - `apply(i, patch)` writes whichever fields are
     present on pack.rivers[i].
   - Schema: `river` (int|string, required),
     `sourceWidth` (number, optional, 0–3),
     `widthFactor` (number, optional, 0.1–4).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-river-width.test.ts`:
   - Unit (stubbed):
     - sets sourceWidth only
     - sets widthFactor only
     - sets both
     - rejects missing both
     - rejects out-of-range sourceWidth
     - rejects out-of-range widthFactor
     - rejects non-finite values
     - rejects invalid river ref
     - rejects unknown river
     - noop when both match
     - surfaces runtime errors
   - Integration:
     - stubs pack.rivers.
     - writes only the provided fields; other field
       preserved.

4. **README_AI.md** — row near `set_river_type`.

## Verification

- `npm test -- --run src/ai/tools/set-river-width` green.
- `npm test -- --run` — 1332 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Accepts either or both of sourceWidth / widthFactor.
- Range-validates each field.
- Idempotent.
- Documented as data-only (doesn't recompute river.width
  or redraw the river layer).
