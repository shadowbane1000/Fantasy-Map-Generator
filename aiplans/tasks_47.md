# Tasks 47 — set_river_type AI tool

## Task 1 — Implement the tool

- [ ] Create `src/ai/tools/set-river-type.ts` exporting:
  - `RiverTypeRef { i, name, previousType }`.
  - `RiverTypeRuntime { find, apply }`.
  - `defaultRiverTypeRuntime`:
    - `find`: reuse `findRiverByRef(getPack()?.rivers, ref)`.
    - `apply(i, type)`: find by `i`; throw if null; write
      `river.type = type`.
  - `createSetRiverTypeTool(runtime)` + `setRiverTypeTool`.
- [ ] Tool schema: `river` (int|string, required), `type` (string,
  required, non-empty).
- [ ] Description notes common values (River, Creek, Brook, Stream,
  Fork, Branch) but explicitly permits any non-empty string.

## Task 2 — Register in ai/index

- [ ] `import { setRiverTypeTool } from "./tools/set-river-type";`.
- [ ] Barrel re-export `createSetRiverTypeTool`, `setRiverTypeTool`.
- [ ] `registry.register(setRiverTypeTool)` near the other set-*
  tools (slot after the zone color group is fine).

## Task 3 — Runtime-injected tests

- [ ] `src/ai/tools/set-river-type.test.ts`:
  - Sets type by numeric id.
  - Sets type by case-insensitive name.
  - Trims surrounding whitespace from `type`.
  - Errors when river unknown.
  - Rejects invalid `river` refs.
  - Rejects invalid `type` (non-string, empty, whitespace).
  - Accepts non-standard types ("Ravine", "Ditch").
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration test

- [ ] `describe("defaultRiverTypeRuntime (integration)")`:
  - beforeEach: stub `globalThis.pack.rivers` with non-contiguous
    ids, one with `.removed: true`.
  - afterEach: restore original pack.
  - Test: set type on a non-removed river — `pack.rivers[k].type`
    updates.
  - Test: cannot retype a removed river (findRiverByRef returns null
    → error; field untouched).

## Task 5 — README

- [ ] Add row under `rename_river`:
  ```
  | `set_river_type`        | Reclassify a river (writes `river.type` — same side-effect as the Rivers Editor type field). Free-form text: common values are River, Creek, Brook, Stream, Fork, Branch; anything non-empty is allowed. Matches by `river.i` or current name; skips removed rivers. | "Reclassify river 5 as a Stream", "Change the Great River to a Canal" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-river-type` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` baseline intact.
- [ ] `npm run build` succeeds.

## Task 7 — Commit

- [ ] Stage and commit. Message: `feat(ai): add set_river_type tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file + runtime) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (injected-runtime tests) → Task 3.
- Plan step 4 (integration test) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can freely retype rivers via Rivers Editor text
  field, AI cannot.
- Plan writes `river.type` identically — free-form string with no
  enum validation, matching the UI's text input.
- Reuses the `findRiverByRef` helper from plan 46 so non-contiguous
  ids and removed-river skipping work out of the box.

## Verification that tests prove the use case

- Injected-runtime tests cover validation branches and happy path.
- Non-standard types are explicitly tested to confirm the free-form
  contract — no whitelist.
- Integration test proves the end-to-end mutation on a real-ish pack
  object, including the removed-river skip guarantee.
