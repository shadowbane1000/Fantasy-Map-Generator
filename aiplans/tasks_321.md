# Tasks 321: `set_namesbase_duplication`

## Setup
- [x] Worktree `/workspace/.claude/worktrees/plan-321` exists, branch
  `plan-321`, working tree clean, based on master @ 86a0ed6.
- [x] Capture `npm run lint` baseline in `aiplans/plan_321.md`
  ("Found 7 warnings. Found 1 info.").

## Plan + review
- [x] Write `aiplans/plan_321.md` (use case, behavior, schema,
  validation, files, tests; document no-trim, no-sanitize,
  no-updateChain decisions).
- [x] Write `aiplans/tasks_321.md` (this file).
- [x] Self-review pass: re-read both files, edit if needed, record
  outcome.

## Implementation
- [ ] Create `src/ai/tools/set-namesbase-duplication.ts`:
  - `interface NameBaseLike { name?: unknown; d?: unknown }`.
  - `interface SetNamesbaseDuplicationRuntime` with `getNameBases()`
    and `setDuplication(index, value)`.
  - `defaultSetNamesbaseDuplicationRuntime` reading
    `window.nameBases` via `getGlobal`.
  - Tool name `"set_namesbase_duplication"`, schema with
    `required: ["duplicate_chars"]`.
  - Reuse `findNamesbaseByIndex` / `findNamesbasesByName` from
    `rename-namesbase`.
  - `okResult({ ok: true, index, name, old_duplicate_chars,
    new_duplicate_chars })` on success.

- [ ] Wire into `src/ai/index.ts`:
  - Import statement near `setNamesbaseLengthRangeTool` /
    `setNamesbaseNamesTool` (alphabetical).
  - `export { createSetNamesbaseDuplicationTool,
    defaultSetNamesbaseDuplicationRuntime, type
    SetNamesbaseDuplicationRuntime, setNamesbaseDuplicationTool }
    from "./tools/set-namesbase-duplication";` in alphabetical
    position.
  - `registry.register(setNamesbaseDuplicationTool);` in
    `defaultToolRegistry()` near the other namesbase registrations.

## Tests
- [ ] Create `src/ai/tools/set-namesbase-duplication.test.ts` covering:
  - Happy path: index → set → result {old, new}.
  - Empty string accepted (clears all chars).
  - Old defaults to "" when `.d` missing on entry.
  - Special chars `/`, `|`, etc. preserved verbatim.
  - Whitespace preserved verbatim (no trim).
  - `duplicate_chars` missing → error.
  - `duplicate_chars` non-string types (number, null, true, object) →
    error.
  - Index out of range → error.
  - Index negative / non-integer / NaN / Infinity / numeric string →
    error.
  - `current_name` not found → error.
  - `current_name` ambiguous → error with `candidates`.
  - `index` + `current_name` disagree → error.
  - `current_name` agrees with `index` (case-insensitive) → success.
  - Neither identifier → error.
  - `current_name` empty / whitespace / non-string → error.
  - Default runtime mutates `globalThis.nameBases[i].d`.
  - Default runtime errors when `nameBases` missing or non-array.
  - Registry round-trip succeeds.
  - Tool name asserts.
  - Runtime `getNameBases` failure surfaces.
  - Runtime `setDuplication` failure surfaces.

## Verify
- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` does not regress (7 warnings, 1 info baseline).

## Commit
- [ ] Stage only `src/ai/tools/set-namesbase-duplication.ts`,
  `src/ai/tools/set-namesbase-duplication.test.ts`,
  `src/ai/index.ts`, `aiplans/plan_321.md`, `aiplans/tasks_321.md`.
- [ ] `git commit -m "feat(ai): add set_namesbase_duplication tool"`
  with Co-Authored-By trailer.
- [ ] Do not commit `.claude/`, `current-ralph-loop.prompt`, or any
  pre-existing dirty file.
- [ ] Do not push.
