# Tasks 93 — set_burg_group AI tool

- [ ] Create `src/ai/tools/set-burg-group.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPackCollection,
    okResult, parseEntityRef, type RawBurg.
  - `BurgGroupRef { i, name, previousGroup }`.
  - `BurgGroupRuntime`:
    - `find(ref: number | string): BurgGroupRef | null`.
    - `listGroups(): string[]` — names from
      window.Burgs.groups; empty if not available.
    - `apply(ref: BurgGroupRef, group: string): void` —
      delegates to `window.Burgs.changeGroup(burg,
      group)`.
  - `defaultBurgGroupRuntime`:
    - find: findEntityByRef(pack.burgs). Skip i <= 0.
      previousGroup = entry.group ?? "".
    - listGroups: read
      `globalThis.Burgs?.groups` as a
      `{ name: string }[]`. Map to names, filter non-
      strings.
    - apply:
      - Get Burgs module via getGlobal. Throw if
        changeGroup function missing.
      - Look up burg in pack.burgs by ref.i; throw if
        missing or removed.
      - Call `module.changeGroup(burg, group)`.
  - `createSetBurgGroupTool(runtime?)` / `setBurgGroupTool`.
  - Tool name: `set_burg_group`.
  - Description: references Burg Editor Group dropdown,
    delegation to Burgs.changeGroup (which handles SVG),
    validation against the live group list.
  - Schema: `burg` (int|string required), `group` (string
    required).
  - Validation:
    - parseEntityRef(burg).
    - typeof group !== "string" OR empty after trim →
      error.
    - find returns null → "No burg found..."
    - runtime.listGroups() returns non-empty → group
      must match (case-insensitive); canonicalize to the
      stored spelling.
    - If listGroups() returns empty, accept the group
      string as-is (Burgs module may not have loaded
      group config yet).
  - Noop: previousGroup === canonical.
  - Return payload: `{ i, name, group, previousGroup,
    noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after `setBurgFeatureTool`.
  - Barrel re-export.
  - `registry.register(setBurgGroupTool)`.

- [ ] Write `src/ai/tools/set-burg-group.test.ts`:
  - Unit (stubbed runtime):
    - sets by numeric id
    - resolves by case-insensitive name
    - canonicalizes lowercase input ("CAPITAL" →
      "capital" if that's the stored casing)
    - rejects unknown group (when listGroups returns a
      non-empty set)
    - accepts any group when listGroups returns empty
      (fallback)
    - rejects empty / non-string group
    - rejects invalid burg refs
    - rejects unknown burg
    - noop when already at target
    - surfaces runtime errors
  - `defaultBurgGroupRuntime (integration)`:
    - stubs `globalThis.pack.burgs` with 3 entries.
    - stubs `globalThis.Burgs = { groups: [{name:"capital"},
      {name:"city"}, {name:"fort"}], changeGroup: vi.fn() }`.
    - Calls setBurgGroupTool to move burg 1 to "fort".
    - Asserts Burgs.changeGroup called with (burg1, "fort").
    - Input "CAPITAL" → canonicalized to "capital" in
      apply call.
    - Input "unknown" → rejected (not in group list).
    - Removed burgs rejected.

- [ ] Update `README_AI.md` — row near `set_burg_type`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_burg_group tool`.

## Verification: tasks → plan

- File + registration cover plan's "callable".
- Runtime seam lets us inject a fake listGroups and
  apply.
- Canonicalization matches plan.

## Verification: plan → use case

- UI calls Burgs.changeGroup on dropdown change.
- Tool apply does the same via window.Burgs.changeGroup.
- Validation against live list keeps the AI from
  writing a group name the UI wouldn't show.

## Verification: tests → regressions

- If apply forgot the changeGroup delegation, the
  integration assertion fails.
- If canonicalization dropped, "CAPITAL" would not
  match "capital" and the test fails.
- If the listGroups-empty fallback was removed, the
  fallback test fails.
- If removed-burg protection dropped, that test fails.
- If noop path was removed, that test fails.
