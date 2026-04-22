# Tasks 46 — rename_river AI tool

## Task 1 — Implement findRiverByRef helper

- [ ] In `src/ai/tools/rename-river.ts`, export
  `findRiverByRef(rivers, ref): RawRiver | null`:
  - Null if `rivers` not an array.
  - Numeric ref: iterate; return first entry where
    `z && !z.removed && z.i === ref`.
  - String ref: trim + lowercase; iterate; return first entry where
    `z && !z.removed && (z.name ?? "").toLowerCase() === key`.

## Task 2 — Implement the tool

- [ ] Define:
  - `RiverRenameRef { i, name }`.
  - `RiverRenameRuntime { find, rename }`.
- [ ] `defaultRiverRenameRuntime`:
  - `find`: reuse `findRiverByRef(getPack<{ rivers?: RawRiver[] }>()?.rivers, ref)`.
  - `rename(i, name)`: find by `i`; throw if null; write
    `river.name = name`.
- [ ] Tool schema: `river` (int|string, required), `name` (string,
  required, non-empty).
- [ ] Execute flow:
  - `parseEntityRef(input.river, "river")`.
  - Validate `name` is a non-empty string.
  - `runtime.find` → 404 error on miss.
  - Try/catch `runtime.rename(current.i, newName.trim())`.
  - Return `okResult({ i, previousName, name })`.

## Task 3 — Register in ai/index

- [ ] `import { renameRiverTool } from "./tools/rename-river";`.
- [ ] Barrel re-export `createRenameRiverTool`, `findRiverByRef`,
  `renameRiverTool`.
- [ ] `registry.register(renameRiverTool)` right after
  `renameZoneTool`.

## Task 4 — Runtime-injected tests

- [ ] `src/ai/tools/rename-river.test.ts`:
  - Rename by numeric id — rename called with expected args,
    response body correct.
  - Rename by case-insensitive name.
  - Trim name before writing.
  - Error when river unknown.
  - Reject invalid `river` (null, 0, -1, 1.5, "").
  - Reject invalid `name` (non-string, empty, whitespace, number).
  - Rename to same name still calls runtime.rename.
  - Surface runtime failures.

## Task 5 — findRiverByRef unit tests

- [ ] Inside the same test file:
  - Null rivers → null.
  - Match by non-contiguous i.
  - Skip removed rivers.
  - Case-insensitive name match + whitespace trim.
  - Returns null for unknown name/id.

## Task 6 — Default-runtime integration test

- [ ] `describe("defaultRiverRenameRuntime (integration)")`:
  - Stub `globalThis.pack.rivers` with non-contiguous ids, including
    one that's removed.
  - afterEach: restore original pack.
  - Test: rename river 5 → the matching entry's name updates.
  - Test: rename fails for a removed river (findRiverByRef skips them).

## Task 7 — README

- [ ] Add row under `list_rivers`:
  ```
  | `rename_river`          | Rename a river (writes `river.name`). Rivers match by `river.i` (non-contiguous ids) or case-insensitive current name. Doesn't regenerate the culture-based name — pass the exact new name to use. | "Rename river 5 to Ashwater", "Rename the Great River to Blackflow" |
  ```

## Task 8 — Verify

- [ ] `npm test -- --run src/ai/tools/rename-river` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — baseline intact.
- [ ] `npm run build` succeeds.

## Task 9 — Commit

- [ ] Stage and commit. Message: `feat(ai): add rename_river tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file, findRiverByRef, tool) → Tasks 1, 2.
- Plan step 2 (register) → Task 3.
- Plan step 3 (injected-runtime tests) → Task 4.
- Plan step 4 (findRiverByRef tests) → Task 5.
- Plan step 5 (integration tests) → Task 6.
- Plan step 6 (README) → Task 7.
- Plan "Verification" → Task 8.

## Verification that plan accomplishes the use case

- Use case: user can rename rivers in Rivers Editor, AI cannot.
- Plan writes `river.name` exactly as `changeName()` does — no extra
  redraw required (same as the UI).
- Skips removed rivers explicitly (the UI filters them elsewhere,
  so writing to a removed entry would be a bug — our helper returns
  null for those).

## Verification that tests prove the use case

- `findRiverByRef` tests cover every branch of the non-contiguous id
  resolution, including the `removed` skip which is specific to
  rivers.
- Runtime-injected tests cover all input-validation branches and
  the happy path.
- Default-runtime integration test proves the actual mutation on a
  real-ish pack object, closing the end-to-end loop.
