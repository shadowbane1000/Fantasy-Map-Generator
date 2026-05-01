# Tasks — Plan 289 (`list_burg_groups`)

1. Capture lint baseline by running `npm run lint`. Numbers already
   recorded in `plan_289.md` (7 warnings, 1 info, 0 errors, 676
   files).
2. Create `src/ai/tools/list-burg-groups.ts`:
   - Define the `BurgGroup` (input shape, partial / unknown-flavored)
     and `BurgGroupSummary` (output shape) types.
   - Define the `BurgGroupsPackLike` interface (just `burgs?:
     RawBurg[]`-like) and a minimal `RawBurgLike = { removed?:
     boolean; group?: unknown }` so we don't pull in the full RawBurg
     shape just for one filter.
   - Implement `countBurgsForGroup(burgs, name)`.
   - Implement `mapBurgGroup(group, burgCount)` — handles all field
     normalization rules from the plan.
   - Implement `readBurgGroupsFromState(options, pack)` returning
     either `{ groups: BurgGroupSummary[]; packBurgsMissing: boolean }`
     or `{ error: string }`.
   - Define `ListBurgGroupsRuntime` with two methods: `readGroups()`
     (returns the raw groups array or undefined/error indicator) and
     `readBurgs()` (returns the raw burgs array or undefined). For
     simplicity, fold both into a single `readState()` that returns
     `{ groups, burgs }` so the tool doesn't have to coordinate two
     calls. (Match list-burgs.ts shape — keep it minimal.)
   - Define `defaultListBurgGroupsRuntime` using `getGlobal` for
     `options` and `getPack` for `pack`.
   - Define `createListBurgGroupsTool(runtime?)` returning a `Tool`
     with name `list_burg_groups`, a description that calls out the
     editor parity, and an `input_schema` accepting only
     `include_inactive`.
   - Export the `listBurgGroupsTool` default-runtime instance.
3. Create `src/ai/tools/list-burg-groups.test.ts` covering all 15 test
   cases listed in the plan's Test plan section (cases 14-15 added
   during self-review).
4. Wire into `src/ai/index.ts`:
   - Add import of `listBurgGroupsTool`.
   - Add re-export block for `createListBurgGroupsTool,
     listBurgGroupsTool, type BurgGroupSummary` (mirroring sibling
     re-export blocks).
   - Add `registry.register(listBurgGroupsTool);` immediately before
     `registry.register(listBurgsTool);`.
5. Run `npm test` — must pass clean.
6. Run `npx tsc --noEmit` — must be clean.
7. Run `npm run lint` — counts must match baseline (7 warnings, 1
   info, 0 errors).
8. Stage only:
   - `src/ai/tools/list-burg-groups.ts`
   - `src/ai/tools/list-burg-groups.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_289.md`
   - `aiplans/tasks_289.md`
9. Commit with message `feat(ai): add list_burg_groups tool` plus the
   standard `Co-Authored-By` line. Do NOT push. Do NOT touch
   `.claude/`, `current-ralph-loop.prompt`, or `src/ai/chat-controller.ts`.
