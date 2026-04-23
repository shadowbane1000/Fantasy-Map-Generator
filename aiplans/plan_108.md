# Plan 108 — split_regiment AI tool

## Use case

The Regiment Editor's Split button
(`public/modules/ui/regiment-editor.js:178`) halves the
current regiment's units: each unit key in `reg.u` is
divided between the source (ceil half) and a new
regiment (floor half). The new regiment inherits cell,
x, y, n (naval flag), icon; gets a fresh id
(`last(military).i + 1`), auto-generated name via
`Military.getName`, and a new legend note via
`Military.generateNote`. The new regiment is offset
downward on the map (y += box-size * 2 iteratively
until unoccupied).

The AI chat has rename / remove / set_regiment_*
tools but no way to split a regiment.

## Scope

Add one tool: `split_regiment(state, regiment)`.

- `state` — owning state, id (≥ 0) or
  case-insensitive name. Same pattern as other
  regiment tools.
- `regiment` — id (per-state) or case-insensitive
  current name.
- 50/50 split (matches UI). No fraction parameter —
  the AI can iterate if it wants asymmetric splits.
- Validates the split produces non-zero forces on
  both sides — matches UI's "Not enough forces to
  split" guard.
- Delegates the heavy lifting (name generation,
  legend creation, SVG draw) to
  `Military.getName` / `Military.generateNote` /
  `drawRegiment` globals when available.

## Implementation

1. **New file `src/ai/tools/split-regiment.ts`**:
   - Imports: errorResult, getGlobal, getPack,
     isActive, okResult, type RawRegiment from
     `./_shared`; BurgPackLike + resolveStateRefInPack
     from `./list-burgs`; findRegimentByRef from
     `./rename-regiment`.
   - `SplitRegimentRef { stateId, stateName, i, name,
      units: Record<string, number> }`.
   - `SplitRegimentResult { newRegimentId, newName,
      totalAfterSplit, newTotal }`.
   - `SplitRegimentRuntime { find, split }`.
   - `defaultSplitRegimentRuntime.split(ref)`:
     - Compute u2 (floor halves) and u1 (ceil halves).
     - Sum u2 — if zero, throw.
     - Write back u1 + new a.
     - Build new regiment: copy cell/n/bx/by/icon, new
       i, halved units, new y offset (armies box-size
       * 2 increments), state.
     - `Military.getName(newReg, military)` for name
       — throw if unavailable.
     - Push to state.military.
     - Best-effort `Military.generateNote(newReg, state)`.
     - Best-effort `drawRegiment(newReg, stateId)`.
     - Return counts.
   - Schema: `state` (int|string, required),
     `regiment` (int|string, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `split-regiment.test.ts`:
   - Unit (stubbed):
     - happy path returns counts
     - rejects invalid refs
     - rejects non-splittable (all units zero)
     - rejects unknown regiment
     - surfaces runtime errors
   - Integration:
     - stubs pack + Military + drawRegiment + armies.
     - splits a regiment: old + new are both in
       state.military; counts match.

4. **README_AI.md** — row near `set_regiment_unit`.

## Verification

- `npm test -- --run src/ai/tools/split-regiment` green.
- `npm test -- --run` — 1323 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- 50/50 split matches UI.
- Rejects regiments with no splittable forces.
- Delegates to Military globals for name / note /
  draw.
