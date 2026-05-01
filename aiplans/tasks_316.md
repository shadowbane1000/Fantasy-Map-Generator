# Tasks for plan 316: `list_namesbases`

## 1. Lint baseline
- [x] Run `npm run lint`; record counts in `plan_316.md` (7 warnings, 1 info, 0 errors).

## 2. Plan + tasks
- [x] Write `aiplans/plan_316.md`.
- [x] Write `aiplans/tasks_316.md` (this file).

## 3. Self-review (mandatory)
- [x] Re-read `plan_316.md` and `tasks_316.md`. Edit as needed. Add a self-review note.
      (See "Self-review (step 4)" section in `plan_316.md`.)

## 4. Implement `list-namesbases.ts`
- [ ] Create `src/ai/tools/list-namesbases.ts`:
  - `NamesbaseEntry` interface (wire shape).
  - `ListNamesbasesRuntime` interface with `getNameBases(): unknown[] | null`.
  - `defaultListNamesbasesRuntime` reading `window.nameBases` via `getGlobal`,
    returning `null` when missing or not an array.
  - `summarizeEntry(entry, index)` private helper.
  - `createListNamesbasesTool(runtime?)` factory.
  - Exported `listNamesbasesTool` instance.
  - JSDoc and a thorough `description` explaining source, fields, error behavior, and
    pairing with future namesbase tools.

## 5. Wire into the registry
- [ ] Add `import { listNamesbasesTool } from "./tools/list-namesbases";` near the
      other `list-*` imports (between `list-marker-types` / `list-markers` /
      `list-notes`; alphabetical).
- [ ] Add the export block (createListNamesbasesTool, defaultListNamesbasesRuntime,
      ListNamesbasesRuntime, NamesbaseEntry, listNamesbasesTool) between the
      `list-marker-types` and `list-notes` export blocks.
- [ ] Add `registry.register(listNamesbasesTool);` near the other `list-*`
      registrations.

## 6. Tests `list-namesbases.test.ts`
- [ ] Pure runtime behaviour:
  - Happy path with 3 namesbases.
  - Empty corpus → `name_count: 0`, `sample_names: []`.
  - `b: "Foo,,Bar,"` → `name_count: 4`, `sample_names: ["Foo", "Bar"]`.
  - `b` with > 5 names → `sample_names.length === 5`.
  - Missing `m` → `multiword_rate: 0`.
  - Missing `d` → `duplicate_chars: ""`.
  - Whitespace-padded names trimmed in `sample_names`.
- [ ] Tool-level behaviour:
  - `runtime.getNameBases() === null` → error.
  - `null`/`undefined`/`{}` inputs all succeed.
  - Tool name and input_schema shape.
- [ ] Default-runtime integration (touches `globalThis.nameBases`):
  - `nameBases` undefined → error.
  - `nameBases` null → error.
  - `nameBases` non-array (e.g., string) → error.
  - `nameBases` valid → reads through.
  - `beforeEach`/`afterEach` save & restore `globalThis.nameBases`.

## 7. Verify
- [ ] `npm test -- list-namesbases` (fast feedback) and `npm test` overall.
- [ ] `npx tsc --noEmit`.
- [ ] `npm run lint` — verify warning/info count unchanged (7/1/0).

## 8. Commit
- [ ] Stage only:
  - `src/ai/tools/list-namesbases.ts`
  - `src/ai/tools/list-namesbases.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_316.md`
  - `aiplans/tasks_316.md`
- [ ] Do **not** stage `.claude/`, `current-ralph-loop.prompt`, or
      `src/ai/chat-controller.ts` (intentionally dirty on master).
- [ ] Commit message: `feat(ai): add list_namesbases tool` with Co-Authored-By line.
- [ ] Do **not** push. Do **not** remove the worktree.

## 9. Report back
- [ ] Worktree path, branch, commit SHA, test/tsc/lint statuses, any caveats.
