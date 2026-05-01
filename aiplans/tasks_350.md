# Tasks 350 — `remove_coastline_group`

Plan ref: `aiplans/plan_350.md`. Worktree:
`/workspace/.claude/worktrees/plan-350` on branch
`plan-350-remove-coastline-group`, based on master @ ecc80ef.

## Setup

- [x] Verify worktree on branch `plan-350-remove-coastline-group`.
- [x] Capture lint baseline → `aiplans/plan_350.md` (clean: 805 files
  checked, no fixes / warnings / errors).

## Plan + tasks + self-review

- [x] Write `aiplans/plan_350.md`.
- [x] Write `aiplans/tasks_350.md`.
- [x] Self-review: re-read both, verify
  - both default groups (`sea_island` AND `lake_island`) are rejected,
  - the case where `sea_island` itself is missing is handled distinctly,
  - `moved_count` reflects actual children moved (returned by the runtime),
  - the dropdown best-effort path is exercised both ways,
  - sanitization re-uses `sanitizeGroupName` (no reinvention),
  - children move ORDER is preserved.
  Document any corrections in `plan_350.md` "## Self-review".

## Implementation

- [ ] Create `src/ai/tools/remove-coastline-group.ts`:
  - Imports from `./_shared`, `./add-route-group` (for
    `sanitizeGroupName`), and `./index`.
  - Re-export `sanitizeGroupName` for symmetry with sibling files.
  - Export `DEFAULT_COASTLINE_GROUPS = ["sea_island", "lake_island"]`.
  - Types: `RemoveCoastlineGroupRuntime`.
  - Helpers: `getDocument`, `findDirectGroupChild`,
    `resolveCoastlineRoot` (D3 selection → `.node()` →
    `document.getElementById("coastline")` fallback).
  - `defaultRemoveCoastlineGroupRuntime` implementing
    `coastlineLayerExists`, `groupExists`, `seaIslandExists`,
    `moveChildrenAndRemoveGroup`, `removeDropdownOption`. The move loop
    matches the legacy `while (groupEl.childNodes.length) sea.appendChild(groupEl.childNodes[0])`
    via `groupEl.firstChild`.
  - `createRemoveCoastlineGroupTool(runtime?)` factory.
  - Exported `removeCoastlineGroupTool` instance.
  - Tool description references the editor's "Remove" button
    (coastline-editor.js → removeCoastlineGroup), the `sanitizeGroupName`
    pipeline, the default-group rejection rule, the move-into-sea_island
    behaviour, and notes that coastline features are NOT mirrored in
    `pack` so there is no pack-side reassignment.
- [ ] Create `src/ai/tools/remove-coastline-group.test.ts` with all 24
  test cases enumerated in plan section "Tests".
- [ ] Wire into `src/ai/index.ts`:
  - Add import alphabetically (after `removeBurgGroupTool`, before
    `removeCultureTool`).
  - Add re-export block alphabetically (between `remove-burg-group` and
    `remove-culture`).
  - Add `registry.register(removeCoastlineGroupTool);` adjacent to
    `removeLakeGroupTool` / `removeLabelGroupTool` registrations.

## Verification

- [ ] `npm test` — all green, no regressions.
- [ ] `npm run lint` — clean (matches baseline exactly).
- [ ] `npx tsc --noEmit` — clean.

## Commit

- [ ] Stage only:
  - `src/ai/tools/remove-coastline-group.ts`
  - `src/ai/tools/remove-coastline-group.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_350.md`
  - `aiplans/tasks_350.md`
- [ ] Commit message:
  ```
  feat(ai): add remove_coastline_group tool

  Implements plan 350. Adds an AI chat tool that removes a custom
  coastline <g> from #coastline (moving children into the default
  sea_island group), mirroring the "Remove" button in the coastline
  editor. Refuses to remove the default sea_island and lake_island.
  ```
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  other pre-existing dirty file outside the worktree.

## Caveats / open questions

- Coastline features are NOT mirrored in `pack` (unlike lakes which use
  `pack.features[i].group`). This tool is purely DOM-side; no pack
  mutation. Documented in the tool description.
- The legacy UI calls `byId("coastlineGroup").value = "sea_island"` after
  removing the option — this resets the editor's currently-displayed
  selection. The AI tool skips that UI-state assignment because it runs
  non-interactively (no editor dialog open). The dropdown option removal
  itself is preserved (best-effort) so the editor stays consistent if
  later opened.
