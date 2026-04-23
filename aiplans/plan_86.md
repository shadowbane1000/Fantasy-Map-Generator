# Plan 86 — set_regiment_naval AI tool

## Use case

The Regiment Editor's type-toggle button (the anchor /
users icon at `public/modules/ui/regiment-editor.js:127`)
flips a single regiment between "naval" and "land":

```js
reg.n = +!reg.n; // 1 = naval, 0 = land
```

The UI also resizes the regiment's SVG rect and icon box
as a visual follow-up, but the underlying data change is
just a 0↔1 flip on `regiment.n`.

The AI chat currently has `list_regiments`, `rename_regiment`,
`remove_regiment`, and `set_regiment_unit`. It has no way
to change a regiment's naval/land classification.

## Scope

Add one tool: `set_regiment_naval(state, regiment, naval)`.

- `state` — owning state, id (≥ 0) or case-insensitive
  name/fullName. Matches the pattern used by the other
  regiment tools (regiment ids are per-state, so `state`
  must be provided).
- `regiment` — id (regiment.i, per-state) or case-insensitive
  current name within that state.
- `naval` — boolean. `true` → `reg.n = 1`, `false` → `reg.n = 0`.
- Writes `reg.n = naval ? 1 : 0`.
- Best-effort calls `drawMilitary()` to redraw the armies
  layer (matches the UI's visual refresh without trying to
  replicate its finicky per-rect DOM edits).
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-regiment-naval.ts`**:
   - Reuse `findRegimentByRef` from `./rename-regiment`.
   - Reuse `resolveStateRefInPack` + `BurgPackLike` from
     `./list-burgs` (same as the other regiment tools).
   - `RegimentNavalRef { stateId, stateName, i, name,
      previousNaval }`.
   - `RegimentNavalRuntime { find, apply }`.
   - `apply(stateId, i, naval)` writes `reg.n = naval ? 1
      : 0` and best-effort calls `drawMilitary()`.
   - Tool name: `set_regiment_naval`.
   - Schema: `state` (int|string required), `regiment`
     (int|string required), `naval` (boolean required).
   - Validation:
     - isValidRef(state) and isValidRef(regiment).
     - typeof naval === "boolean".
   - Noop when `previousNaval === naval`.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `src/ai/tools/set-regiment-naval.test.ts`:
   - Unit (stubbed runtime):
     - sets naval by numeric ids
     - sets by case-insensitive state + regiment names
     - flips naval → land
     - rejects non-boolean naval
     - rejects invalid state / regiment refs
     - rejects unknown regiment
     - noop when already at target
     - surfaces runtime errors
   - Integration:
     - stubs `globalThis.pack.states[...].military`.
     - stubs `globalThis.drawMilitary`.
     - writes reg.n on target regiment, calls drawMilitary
       once.
     - succeeds when drawMilitary missing.

4. **README_AI.md**: add a row near `set_regiment_unit`.

## Verification

- `npm test -- --run src/ai/tools/set-regiment-naval` green.
- `npm test -- --run` — 1069 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered, callable, documented.
- Writes reg.n to 1 or 0.
- Best-effort drawMilitary call — matches UI intent.
- Idempotent.
