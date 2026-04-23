# Tasks 90 — remove_religion AI tool

- [ ] Create `src/ai/tools/remove-religion.ts`:
  - Imports from `./_shared`: errorResult, findEntityByRef,
    getPack, okResult, parseEntityRef, type RawReligion.
  - Local `PackWithReligionCells`:
    ```
    interface PackWithReligionCells {
      cells?: { religion?: number[] };
      religions?: RawReligion[];
    }
    ```
  - Exports:
    - `RemoveReligionRef { i, name }`.
    - `RemoveReligionRuntime { find, remove }` —
      `remove(ref) -> { cascadedOrigins: number }`.
    - `defaultRemoveReligionRuntime`:
      - find: findEntityByRef (skips id 0 & removed).
      - remove(ref):
        - Get pack; throw if missing.
        - cells.religion: replace entries === ref.i
          with 0.
        - religions[ref.i] tombstone: keep i, name, set
          removed = true. (Match UI which sets
          `.removed = true` in place — don't wipe name.
          Actually the UI does: `pack.religions[religionId].removed = true;`
          which preserves the rest of the fields. Do
          that.)
        - Walk other religions, filter origins (default
          if empty to [0]); count those changed.
        - Best-effort DOM removals via document.getElementById
          for: `religion{i}`, `religion-gap{i}`,
          `religionsCenter{i}`. Guard with `typeof
          document !== "undefined"`.
        - Return cascadedOrigins count.
    - `createRemoveReligionTool(runtime?)` and
      `removeReligionTool`.
  - Tool name: `remove_religion`.
  - Description: references Religions Editor trash icon,
    lists mutations, notes tombstone + origins cascade,
    mentions best-effort DOM cleanup.
  - Schema: `religion` (int|string required).
  - Validation:
    - parseEntityRef(religion).
    - find returns null → "No religion found..."
    - Reject id 0 explicitly after find (since find
      already rejects 0 via isActive, this is defense in
      depth).
  - Return payload:
    `{ i, name, cascadedOrigins }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `remove-*` tools.
  - Barrel re-export.
  - `registry.register(removeReligionTool)` near other
    remove tools.

- [ ] Write `src/ai/tools/remove-religion.test.ts`:
  - Unit (stubbed runtime):
    - removes by numeric id
    - resolves by case-insensitive name
    - rejects invalid refs (`null, undefined, 0, -1, 1.5, ""`)
    - rejects unknown religion
    - surfaces runtime errors
  - `defaultRemoveReligionRuntime (integration)`:
    - stubs `globalThis.pack`:
      - cells.religion = [0, 1, 2, 1, 2, 0]
      - religions:
        {i:0, name:"No religion"},
        {i:1, name:"Solarism", origins:[0]},
        {i:2, name:"Lunarism", origins:[1,0]},
        {i:3, name:"Astralism", origins:[2]},
        {i:4, name:"Gone", removed:true, origins:[1]}
    - Remove religion 2:
      - pack.cells.religion now [0,1,0,1,0,0].
      - pack.religions[2].removed === true and
        pack.religions[2].name === "Lunarism" still.
      - pack.religions[3].origins === [0] (was [2], empty
        → reset to [0]).
      - pack.religions[1].origins untouched (= [0]).
      - cascadedOrigins === 1 (only religion 3 cascaded).
      - Removed religion 4 is skipped by the cascade
        (no touching).
    - rejects id 0.
    - rejects already-removed religion 4.

- [ ] Update `README_AI.md` — row near `remove_province`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add remove_religion tool`.

## Verification: tasks → plan

- File + registration covers the plan's "tool registered
  and callable".
- apply mutates cells, tombstones, origins, best-effort
  DOM — matches plan.
- cascadedOrigins count exposed in payload — matches
  plan.

## Verification: plan → use case

- UI does 6 things; tool does 4 core mutations + 2
  best-effort cosmetic. (Editor refresh is N/A for AI.)
- UI's origins cleanup: filter + reset to [0] — tool
  does the same.
- UI's tombstone: sets removed = true in place — tool
  does the same (doesn't wipe name).

## Verification: tests → regressions

- If cells.religion zeroing dropped, integration fails.
- If tombstone lost the name, integration assertion on
  `religions[2].name === "Lunarism"` fails.
- If origins cascade missed the empty-array case, the
  `[0]` reset assertion fails.
- If cascadedOrigins count wrong, that assertion fails.
- If the tool cascaded into the removed religion,
  pack.religions[4].origins would change — and our test
  asserts it doesn't.
