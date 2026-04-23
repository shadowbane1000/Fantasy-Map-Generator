# Tasks 86 — set_regiment_naval AI tool

- [ ] Create `src/ai/tools/set-regiment-naval.ts`:
  - Imports:
    - `./_shared`: errorResult, getGlobal, getPack, isActive,
      okResult, type RawRegiment.
    - `./rename-regiment`: findRegimentByRef.
    - `./list-burgs`: BurgPackLike, resolveStateRefInPack.
    - `./index`: Tool, ToolResult.
  - Exports:
    - `RegimentNavalRef { stateId, stateName, i, name,
       previousNaval }`.
    - `RegimentNavalRuntime { find, apply }`.
    - `defaultRegimentNavalRuntime`:
      - find: resolveStateRefInPack → state + isActive,
        findRegimentByRef → regiment. Return `{
          stateId, stateName, i: regiment.i,
          name: regiment.name ?? "",
          previousNaval: !!regiment.n
        }`.
      - apply(stateId, i, naval):
        - Look up state; throw if missing.
        - Find regiment in state.military; throw if missing.
        - Write `(regiment as RawRegiment).n = naval ? 1 : 0`.
        - `getGlobal<() => void>("drawMilitary")` →
          best-effort call (try/catch swallowed).
    - `createSetRegimentNavalTool(runtime?)` and
      `setRegimentNavalTool`.
  - Tool name: `set_regiment_naval`.
  - Description: references the Regiment Editor's
    naval / land toggle, notes reg.n = 1 for naval / 0
    for land, mentions drawMilitary redraw, idempotent.
  - Schema: state (int|string), regiment (int|string),
    naval (boolean). All required.
  - Validation:
    - state / regiment via an isValidRef helper shared by
      other regiment tools (non-negative int OR non-empty
      string) — copy the helper pattern locally.
    - typeof naval !== "boolean" → errorResult.
  - Noop: `previousNaval === naval`.
  - Return payload:
    `{ stateId, stateName, i, name, naval, previousNaval,
      noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after `setRegimentUnitTool`.
  - Barrel re-export block for
    `createSetRegimentNavalTool`,
    `setRegimentNavalTool`,
    types.
  - `registry.register(setRegimentNavalTool)` next to
    `setRegimentUnitTool`.

- [ ] Write `src/ai/tools/set-regiment-naval.test.ts`:
  - Unit (stubbed runtime):
    - sets by numeric ids (naval: true → apply called
      with (stateId, i, true), returns naval: true).
    - sets by case-insensitive state + regiment names.
    - flips naval → land (apply called with (_, _, false)).
    - noop when already naval=true.
    - noop when already naval=false.
    - rejects non-boolean naval (list of bad values).
    - rejects invalid state refs.
    - rejects invalid regiment refs.
    - rejects unknown regiment (find returns null).
    - surfaces runtime errors.
  - `defaultRegimentNavalRuntime (integration)`:
    - stubs `globalThis.pack = { states: [{i:0,...},
      {i: 1, name: "Altaria", military: [...]}] }`.
    - stubs `globalThis.drawMilitary = vi.fn()`.
    - writes reg.n = 1 on a land regiment, verifies
      drawMilitary called once.
    - writes reg.n = 0 on a naval regiment.
    - succeeds when drawMilitary is undefined (delete
      from globalThis, tool still writes).

- [ ] Update `README_AI.md` — row near `set_regiment_unit`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_regiment_naval tool`.

## Verification: tasks → plan

- Runtime seam + state+regiment double-key match the
  other regiment tools' pattern.
- apply writes 0/1 and calls drawMilitary best-effort —
  matches the plan.
- Noop semantics are explicit.

## Verification: plan → use case

- UI does `reg.n = +!reg.n` on click. Tool does
  `reg.n = naval ? 1 : 0` on call — equivalent data
  change, explicit on what each value means.
- UI does per-rect SVG mutation; tool calls
  drawMilitary() which re-renders the armies layer —
  achieves the same visual outcome via a supported
  renderer instead of fragile DOM edits.

## Verification: tests → regressions

- If apply wrote the wrong numeric value, integration
  assertion on reg.n fails.
- If drawMilitary call was dropped, drawMilitary
  assertion fails.
- If drawMilitary throw wasn't caught, the "missing"
  integration test fails because an error would be
  returned instead of success.
- If noop semantics loosened or tightened, the noop
  tests fail.
- If non-boolean naval slipped through, the validation
  test fails.
