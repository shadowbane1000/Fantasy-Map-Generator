# Tasks 349 — `add_coastline_group`

Plan ref: `aiplans/plan_349.md`. Worktree:
`/workspace/.claude/worktrees/plan-349` on branch
`plan-349-add-coastline-group`, based on master @ 1b44de5.

## Setup

- [x] Verify worktree on branch `plan-349-add-coastline-group`.
- [x] Capture lint baseline → `aiplans/plan_349.md` (clean: 801 files
  checked, no fixes / warnings / errors).

## Plan + tasks + self-review

- [x] Write `aiplans/plan_349.md`.
- [x] Write `aiplans/tasks_349.md`.
- [x] Self-review: re-read both, verify
  - sanitization re-uses `sanitizeGroupName` from
    `add-route-group.ts` (no reinvention),
  - id collision check is DOM-wide (`byId` semantics),
  - sea_island clone fallback is tested both ways,
  - the new id is set explicitly after cloning so the new group does
    not collide with `sea_island`.
  Document any corrections in `plan_349.md` "## Self-review".

## Implementation

- [x] Create `src/ai/tools/add-coastline-group.ts`:
  - Imports from `./_shared`, `./add-route-group` (for
    `sanitizeGroupName`), and `./index`.
  - Re-export `sanitizeGroupName` for symmetry with
    `add-lake-group.ts`.
  - Types: `IdExistsCheck`, `AppendGroupResult`,
    `AddCoastlineGroupRuntime`.
  - Helpers: `resolveCoastlineRoot`, `findSeaIslandTemplate`,
    `buildBareG`.
  - `defaultAddCoastlineGroupRuntime` reading
    `globalThis.coastline` (D3 selection) → `.node()`, falling back
    to `document.getElementById("coastline")`. Append behavior matches
    plan section "Behavior" step 6.
  - `createAddCoastlineGroupTool(runtime?)` factory.
  - Exported `addCoastlineGroupTool` instance.
  - Tool description references the editor's "Add group" button
    (coastline-editor.js → createNewGroup), the `sanitizeGroupName`
    pipeline, the no-prefix rule, the DOM-wide collision semantics,
    the `sea_island` clone-fallback behaviour, and the divergence
    from the editor (this primitive doesn't move any
    currently-selected coastline path; pair with a future
    `set_coastline_group`).
- [x] Create `src/ai/tools/add-coastline-group.test.ts` with all 19
  test cases enumerated in plan section "Tests".
- [x] Wire into `src/ai/index.ts`:
  - Add import alphabetically (after `addBurgGroupTool`, before
    `addCultureTool`).
  - Add re-export block alphabetically.
  - Add `registry.register(addCoastlineGroupTool);` adjacent to
    `addLakeGroupTool` / `addBurgGroupTool` registrations.

## Verification

- [ ] `npm test` — all green, no regressions.
- [ ] `npm run lint` — clean (matches baseline exactly).
- [ ] `npx tsc --noEmit` — clean.

## Commit

- [ ] Stage only:
  - `src/ai/tools/add-coastline-group.ts`
  - `src/ai/tools/add-coastline-group.test.ts`
  - `src/ai/index.ts`
  - `public/main.js` (one-char fix: `let coastline` → `var
    coastline`, mirroring the 1d137af fix for 14 sibling layers; see
    plan 349 "Post-implementation correction")
  - `aiplans/plan_349.md`
  - `aiplans/tasks_349.md`
- [ ] Commit message:
  ```
  feat(ai): add add_coastline_group tool

  Implements plan 349. Adds an AI chat tool that creates a new <g>
  under the #coastline SVG layer (cloning attrs from #sea_island when
  present), mirroring the "Add group" button in the coastline editor.
  ```
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  other pre-existing dirty file outside the worktree.

## Caveats / open questions

- The runtime's `appendGroup` returns a small struct
  `{ clonedFrom: string | null }` rather than `void` (as in
  `add-lake-group.ts`). This is so the success result can include the
  `cloned_from` field accurately without re-walking the DOM. Document
  this small divergence in the source comments.
- Per-feature `set_coastline_group` and `remove_coastline_group` are
  out of scope for this plan; they are follow-up work.
