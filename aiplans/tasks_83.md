# Tasks 83 — set_burg_port AI tool

- [ ] Create `src/ai/tools/set-burg-port.ts`:
  - Exports `BurgPortRef { i, name, cell, x, y, group,
    previousEnabled }`.
  - Exports `BurgPortRuntime { find, enable, disable }`.
  - `enable(ref: BurgPortRef) => { port: number;
     haven: boolean }`. Returns the new `port` value and
     whether a haven was found.
  - `disable(i: number): void` — writes 0, removes SVG.
  - `defaultBurgPortRuntime`:
    - find: findEntityByRef + guard `i > 0 && !removed`.
      Hydrate with cell / x / y / group pulled from the
      live burg.
    - enable:
      - Read `pack.cells.haven[burg.cell]` (may be 0).
      - `portFeature = haven ? pack.cells.f[haven] : -1`.
      - Write `pack.burgs[i].port = portFeature`.
      - Get `#anchors` via getElementById.
      - Query `#anchors #<group>` (fallback: `#anchors`
        itself if the group is missing) and append a
        `<use>` element via
        `document.createElementNS(SVG_NS, "use")`.
      - Attributes: `href=#icon-anchor`,
        `id=anchor<i>`, `data-id=<i>`, `x=<burg.x>`,
        `y=<burg.y>`.
      - Return `{ port: portFeature, haven: !!haven }`.
    - disable:
      - Write `pack.burgs[i].port = 0`.
      - Remove element via
        `document.querySelector("#anchors [data-id='"+i+"']")
        ?.remove()`.
  - Exports `createSetBurgPortTool(runtime?)` and
    `setBurgPortTool`.
  - Tool name: `set_burg_port`.
  - Description: mentions Burg Editor Port button, haven
    lookup, anchor SVG insertion.
  - Schema: `burg` (int|string, required), `enabled`
    (boolean, required).
  - Validation errors:
    - parseEntityRef.
    - typeof enabled !== "boolean".
    - find returns null.
  - Noop path: `previousEnabled === input.enabled`.
  - Return payload:
    - `{ i, name, enabled, previousEnabled, port,
       warning?, noop }`.
    - `warning: "No coastal haven available; port set to
       -1."` when enabling and haven not found.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `set-burg-*`.
  - Barrel re-export block.
  - `registry.register(setBurgPortTool)` near the other
    `setBurg*Tool` registrations.

- [ ] Write `src/ai/tools/set-burg-port.test.ts`:
  - `set_burg_port tool` describe (stubbed runtime):
    - enables port (with haven): no warning, correct
      apply call, return payload includes port = featureId.
    - enables port (no haven): warning present,
      port: -1 in payload.
    - disables port: apply called with disable, port: 0.
    - noop when already enabled.
    - noop when already disabled.
    - rejects non-boolean enabled.
    - rejects invalid refs.
    - rejects unknown burg.
    - surfaces enable failure.
    - surfaces disable failure.
  - `defaultBurgPortRuntime (integration)`:
    - Build a minimal DOM: an `anchors` element with a
      sub-element `#<group>`, registered with
      getElementById / querySelector / createElementNS.
    - Stubs `globalThis.pack = { burgs, cells: { haven,
      f } }`, `globalThis.document = ...`.
    - Scenario 1: enable a burg with a haven —
      pack.burgs[i].port becomes feature id; a <use>
      child is appended to `#<group>`.
    - Scenario 2: enable a burg with no haven —
      pack.burgs[i].port = -1; warning attached to ok
      result; <use> still appended.
    - Scenario 3: disable an enabled burg —
      pack.burgs[i].port = 0; the matching <use> is
      removed.

- [ ] Update `README_AI.md`: add row near
  `set_burg_feature`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_burg_port tool`.

## Verification: tasks → plan

- File layout + registration → "tool registered and
  callable".
- Runtime seam (find / enable / disable) matches the
  plan's runtime shape.
- Enable returns both port value and haven flag → warning
  can be surfaced.

## Verification: plan → use case

- Enable: `pack.cells.haven[burg.cell]` →
  `pack.cells.f[haven]` → write `burg.port` → append <use>
  — same three-step sequence as togglePort in burg-editor.js.
- Disable: write 0 → remove data-id — same as the UI's
  two-step sequence.
- The no-haven path preserves the UI's warn-but-still-set
  behavior rather than erroring.

## Verification: tests → regressions

- Wrong featureId written → integration asserts
  pack.burgs[i].port === expected fails.
- Missing SVG insert → integration asserts appendChild
  was called fails.
- SVG not removed on disable → integration asserts the
  <use> child is gone fails.
- Noop path removed → noop test fails.
- Warning omitted for no-haven enable → the warning
  assertion fails.
