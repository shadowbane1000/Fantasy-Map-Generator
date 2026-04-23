# Tasks 108 — split_regiment AI tool

- [ ] Create `src/ai/tools/split-regiment.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getPack,
      isActive, okResult, type RawRegiment.
    - `./list-burgs`: BurgPackLike, resolveStateRefInPack.
    - `./rename-regiment`: findRegimentByRef.
  - Exports:
    - `SplitRegimentRef { stateId, stateName, i, name,
       units }`.
    - `SplitRegimentResult { newRegimentId, newName,
       oldTotal, newTotal }`.
    - `SplitRegimentRuntime { find, split }`.
    - `defaultSplitRegimentRuntime`:
      - find: resolveStateRefInPack → state with
        isActive; findRegimentByRef → reg; return
        `{ stateId, stateName, i, name, units: {...reg.u} }`.
      - split(ref):
        - Get pack; throw if missing state / regiment.
        - Walk reg.u:
          - u2[key] = floor(reg.u[key] / 2).
          - u1[key] = ceil(reg.u[key] / 2).
        - Sum u2; if zero, throw "Not enough forces
          to split."
        - Write reg.u = u1; reg.a = sum of u1.
        - New i = last(state.military).i + 1 OR
          state.military.length (prefer the former).
        - Read box-size from armies.attr("box-size")
          if present (use getGlobal<d3.Selection>).
          Default to 15 if unavailable.
        - Compute y offset until no collision with
          existing military x/y.
        - Build newReg: copy cell, n, bx, by, icon from
          old; i = new; u = u2; a = sum u2; x = reg.x;
          y = offset; state = stateId.
        - Get `Military.getName`; throw if missing.
        - newReg.name = Military.getName(newReg,
          state.military).
        - state.military.push(newReg).
        - Best-effort Military.generateNote(newReg, state).
        - Best-effort drawRegiment(newReg, stateId).
        - Return `{ newRegimentId, newName, oldTotal:
          sum u1, newTotal: sum u2 }`.
    - `createSplitRegimentTool(runtime?)` and
      `splitRegimentTool`.
  - Tool name: `split_regiment`.
  - Description: references Regiment Editor Split
    button, 50/50 split, new regiment created.
  - Schema: state (int|string), regiment (int|string).
    Both required.
  - Validation:
    - isValidRef(state, regiment).
    - find returns null → error.
  - Return payload: `{ stateId, stateName, i, name,
     newRegimentId, newName, oldTotal, newTotal }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other regiment tools.
  - Barrel re-export.
  - `registry.register(splitRegimentTool)`.

- [ ] Write `src/ai/tools/split-regiment.test.ts`:
  - Unit (stubbed runtime):
    - happy path with counts
    - resolves by case-insensitive names
    - rejects invalid state/regiment refs
    - rejects unknown regiment
    - surfaces runtime errors (split throws)
  - `defaultSplitRegimentRuntime (integration)`:
    - stubs pack.states[*].military, Military.getName +
      generateNote, drawRegiment.
    - split a regiment with { Swords: 100, Archers: 50 }
      → new reg has { Swords: 50, Archers: 25 }; old
      reg has { Swords: 50, Archers: 25 } (ceil 100/2 =
      50 and 50/2 = 25).
    - rejects regiment with all-zero units (cannot
      split).
    - errors when Military.getName missing.

- [ ] Update `README_AI.md` — row near
  `set_regiment_unit`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add split_regiment tool`.

## Verification: tasks → plan

- File + registration covers plan's "callable".
- Split arithmetic matches plan (floor / ceil).
- Error path for all-zero units matches plan.

## Verification: plan → use case

- UI splits via `floor` / `ceil` by unit; tool does
  the same.
- UI requires non-zero new total; tool does the same.
- UI uses Military.getName / generateNote /
  drawRegiment; tool delegates to same when
  available.

## Verification: tests → regressions

- If split arithmetic is wrong, integration asserts
  on old/new unit counts fail.
- If zero-total guard dropped, the no-forces test
  fails.
- If Military.getName missing wasn't caught, the
  missing-global test fails.
