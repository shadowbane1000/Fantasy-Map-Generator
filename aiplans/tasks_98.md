# Tasks 98 — set_regiment_icon AI tool

- [ ] Create `src/ai/tools/set-regiment-icon.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getPack,
      isActive, okResult, type RawRegiment.
    - `./list-burgs`: BurgPackLike, resolveStateRefInPack.
    - `./rename-regiment`: findRegimentByRef.
  - Exports:
    - `RegimentIconRef { stateId, stateName, i, name,
       previousIcon }`.
    - `RegimentIconRuntime { find, apply }`.
    - `defaultRegimentIconRuntime`:
      - find: resolveStateRefInPack → state with
        isActive, findRegimentByRef. previousIcon =
        regiment.icon ?? "".
      - apply(stateId, i, icon):
        - Look up state; throw if missing / inactive.
        - Find regiment; throw if missing.
        - regiment.icon = icon.
        - Best-effort drawMilitary() via getGlobal.
    - `createSetRegimentIconTool(runtime?)` and
      `setRegimentIconTool`.
  - Tool name: `set_regiment_icon`.
  - Description: references Regiment Editor emblem
    picker, notes drawMilitary redraw, idempotent,
    (state, regiment) two-part ref.
  - Schema:
    - state (int|string required)
    - regiment (int|string required)
    - icon (string required; non-empty after trim)
  - Validation:
    - isValidRef(state), isValidRef(regiment) — reuse
      the existing shared helper pattern (non-negative
      int or non-empty string).
    - typeof icon !== "string" || !icon.trim() → error.
  - Noop: previousIcon === trimmed.
  - Return payload: `{ stateId, stateName, i, name,
     icon, previousIcon, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other setRegiment* imports.
  - Barrel re-export.
  - `registry.register(setRegimentIconTool)`.

- [ ] Write `src/ai/tools/set-regiment-icon.test.ts`:
  - Unit (stubbed runtime):
    - sets by numeric ids
    - resolves by case-insensitive state+regiment names
    - trims icon whitespace
    - rejects empty / non-string icon
    - rejects invalid state refs
    - rejects invalid regiment refs
    - rejects unknown regiment
    - noop when unchanged
    - surfaces runtime errors
  - `defaultRegimentIconRuntime (integration)`:
    - stubs `globalThis.pack.states` with a military
      array on state 1.
    - stubs `globalThis.drawMilitary`.
    - writes icon on regiment; asserts reg.icon updated
      and drawMilitary called once.
    - succeeds when drawMilitary missing.

- [ ] Update `README_AI.md` — row near
  `set_regiment_naval`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_regiment_icon tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Apply writes regiment.icon + best-effort drawMilitary
  — matches plan.

## Verification: plan → use case

- UI writes regiment.icon on emblem-picker pick; tool
  does the same with a trimmed string.
- UI also mutates SVG inline; tool re-renders via
  drawMilitary (same approach as set_regiment_naval for
  layout-affecting changes).

## Verification: tests → regressions

- If apply forgot to write icon, integration fails.
- If drawMilitary wasn't called, integration fails.
- If drawMilitary missing wasn't caught, the "missing"
  integration test fails.
- If noop semantics changed, noop test fails.
