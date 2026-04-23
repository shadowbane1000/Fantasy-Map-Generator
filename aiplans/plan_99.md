# Plan 99 — move_regiment AI tool

## Use case

The renderers layer exports a global
`moveRegiment(reg, x, y)`
(`src/renderers/draw-military.ts:211`) which:

1. Mutates `reg.x = x` and `reg.y = y`.
2. Animates the regiment's rect / text / icon / image
   SVG elements to the new coords with a duration
   proportional to distance (same effect the user sees
   when dragging a regiment in the Regiments layer).

The AI chat has rename / remove / set-unit / set-naval /
set-icon for regiments, but no way to reposition one.

## Scope

Add one tool: `move_regiment(state, regiment, x, y)`.

- `state` — owning state (id ≥ 0 incl. Neutrals) or
  case-insensitive name/fullName.
- `regiment` — regiment id or case-insensitive current
  name within that state.
- `x`, `y` — finite numbers.
- Delegates to `window.moveRegiment(reg, x, y)` which
  animates the SVG and writes `reg.x` / `reg.y`.
- Idempotent: noop when the coords already match.

## Implementation

1. **New file `src/ai/tools/move-regiment.ts`**:
   - Imports: errorResult, getGlobal, getPack, isActive,
     okResult, type RawRegiment from `./_shared`;
     BurgPackLike + resolveStateRefInPack from
     `./list-burgs`; findRegimentByRef from
     `./rename-regiment`.
   - `MoveRegimentRef { stateId, stateName, i, name,
      previousX, previousY }`.
   - `MoveRegimentRuntime { find, move }`.
   - `move(stateId, i, x, y)`:
     - Look up state/regiment; throw on missing.
     - Get `moveRegiment` global; if present, call with
       (reg, x, y). If missing, write reg.x/y directly
       as a fallback. (The `moveRegiment` path is the
       preferred one because it animates the SVG; the
       fallback keeps the tool usable in test
       environments / when the renderer hasn't attached
       yet.)
   - Schema: state (int|string required), regiment
     (int|string required), x (number required), y
     (number required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `move-regiment.test.ts`:
   - Unit (stubbed):
     - moves by numeric ids
     - resolves by case-insensitive state + regiment
       names
     - rejects non-finite x/y
     - rejects invalid refs
     - rejects unknown regiment
     - noop when coords unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.states[*].military + moveRegiment.
     - delegates to moveRegiment (asserts called with
       regiment + new x / y).
     - fallback path when moveRegiment missing (writes
       reg.x/y directly).

4. **README_AI.md** — row near `set_regiment_icon`.

## Verification

- `npm test -- --run src/ai/tools/move-regiment` green.
- `npm test -- --run` — 1227 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Prefers window.moveRegiment (animated move) over
  direct data mutation.
- Falls back to direct write when renderer missing.
- Idempotent.
