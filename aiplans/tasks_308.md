# Tasks — Plan 308 `remove_burg_group`

## 1. Author `src/ai/tools/remove-burg-group.ts`

- Export types:
  - `RemoveBurgGroupGroup` (loose, with index signature) — same shape pattern as `SetBurgGroupDefaultGroup`.
  - `RemoveBurgGroupBurg` — minimal `{ group?: unknown; removed?: unknown; [key: string]: unknown }`.
- Export `RemoveBurgGroupRuntime` interface with `getGroups`, `getBurgs`, `persist`.
- Export `defaultRemoveBurgGroupRuntime` reading from `globalThis.options.burgs.groups`, `globalThis.pack.burgs`, and writing `localStorage["burg-groups"]`. Throw on missing localStorage from inside `persist`.
- Export `createRemoveBurgGroupTool(runtime?)`:
  - Schema: `{ type: "object", properties: { name: { type: "string", description } }, required: ["name"] }`.
  - Description references the trash icon in `burg-group-editor.js`, the `localStorage["burg-groups"]` persistence, and the auto-promotion / migration semantics.
  - `execute` flow:
    1. Validate input.name is non-empty string (after trim).
    2. `groups = runtime.getGroups()`; bail if undefined / not array.
    3. `targetIndex = groups.findIndex((g) => g && g.name === name)`. Error if `< 0`.
    4. `target = groups[targetIndex]`.
    5. If `groups.length < 2` → error "Cannot remove the last group.".
    6. If `target.active === true` AND no OTHER group has `active === true` → error "Cannot remove the last active group; activate another first.".
    7. Compute `removed = { ...target }` (shallow snapshot for the response).
    8. Build `survivors = groups.filter((_, i) => i !== targetIndex)` (a plain array view; we still mutate `groups` in step 10).
    9. Determine `newDefault`:
       - If `target.isDefault === true`: pick `survivors[0]` and set its `isDefault = true`; clear `isDefault` on every other survivor.
       - Else: find the (first) survivor with `isDefault === true`. If none, self-heal: pick `survivors[0]`, set `isDefault = true`, clear on others.
    10. Migrate burgs: `burgs = runtime.getBurgs()`. If undefined/not-array, set `migratedCount = 0` and a `note`. Else iterate, for each `b` with `b.removed !== true && b.group === name`, set `b.group = newDefault.name` and increment.
    11. Splice: `groups.splice(targetIndex, 1)`.
    12. Try `runtime.persist(groups)`; catch → `persisted: false` + note with err.message.
    13. Return `okResult({ name, removed, migrated_burg_count, new_default: newDefault.name, changed: true, persisted, note? })`.
- Export `removeBurgGroupTool = createRemoveBurgGroupTool()`.

## 2. Author `src/ai/tools/remove-burg-group.test.ts`

Mirror the structure of `set-burg-group-default.test.ts`. Each test builds a `groups` array (and optionally `burgs`) and instantiates the tool with a fake runtime.

Test cases:

1. Happy path — non-default group with burgs.
2. Happy path — removing the default group auto-promotes the first remaining group; burgs migrate to it.
3. Happy path — removing a group with zero burgs in it.
4. Removing the last group → error.
5. Removing the last active group → error.
6. Removing an inactive group when no other group is active → still allowed (target wasn't active, so the count of active groups doesn't drop below 1) — verifies the check is correctly conditional on `target.active === true`.
7. Group not found → error; persistence not called.
8. Group not found — case-sensitive.
9. `options.burgs.groups` missing → error.
10. `options.burgs.groups` not an array → error.
11. `pack.burgs` missing → success; `migrated_burg_count: 0`; note set.
12. Burgs with `removed: true` are not migrated.
13. Persist throws → success with `persisted: false` and note.
14. Persist non-Error throw value is stringified into the note.
15. Tool name: `removeBurgGroupTool.name === "remove_burg_group"`.
16. Registry round-trip: register + run via globalThis.options + globalThis.pack + globalThis.localStorage with vi.fn() setItem.
17. Default-runtime smoke test: reads from `globalThis.options`, `globalThis.pack`; writes to `globalThis.localStorage`.
18. localStorage missing → success with `persisted: false`.
19. Input validation: name missing / non-string / empty / whitespace / null input.
20. The `removed` field captures the full pre-removal group config including `active` and `isDefault`.

## 3. Wire into `src/ai/index.ts`

- Add `import { removeBurgGroupTool } from "./tools/remove-burg-group";` near the other `remove*` imports (alphabetical — between `removeBurgTool` and `removeCultureTool`, since `remove-burg-group` sorts after `remove-burg`).
- Re-export from the appropriate barrel-export block (alphabetical placement near `removeBurgTool`):
  ```ts
  export {
    createRemoveBurgGroupTool,
    removeBurgGroupTool,
  } from "./tools/remove-burg-group";
  ```
- Add `registry.register(removeBurgGroupTool);` near the other `remove*` registrations (next to `removeBurgTool`).

## 4. Verify

- `npm test` — full suite passes.
- `npm run lint` — does NOT regress (still 0 errors; 7 warnings as in baseline).
- `npx tsc --noEmit` — clean.

## 5. Commit

`feat(ai): add remove_burg_group tool`. Stage only `src/ai/tools/remove-burg-group.ts`, `src/ai/tools/remove-burg-group.test.ts`, `src/ai/index.ts`, `aiplans/plan_308.md`, `aiplans/tasks_308.md`. Don't push.

## Self-review

- Step 1.5 / 1.6 ordering matters: check "last group" before "last active group" so the more fundamental error message wins for a single-group array.
- Step 1.6: if removing an INACTIVE group, the active-count is preserved, so we should NOT reject. The test case in section 2 #6 verifies this. The error message in the plan says "activate another first" which only makes sense when removing an active group.
- Step 1.9: when target.isDefault, we explicitly set survivors[0].isDefault = true AND clear it on others — this self-heals if multiple survivors had isDefault: true. Same defensive style as plan 307.
- Step 1.9 self-heal branch (target was not the default but no surviving group has isDefault: true) — defensive, matches the plan 307 self-heal.
- Step 1.10 vs 1.11 ordering: migrate burgs BEFORE splice. The new_default is identified in step 1.9 (already determined), so we can reassign while target is still in the array. Either order works; doing migrate-first means the splice happens at the very end and groups stays consistent for tests that observe state mid-flow if any.
- Test case #6 confirms inactive-group removal works when no other group is active.
- Test case #20 ensures we shallow-clone the target into the response BEFORE clearing isDefault on other survivors (which doesn't affect target since it's being spliced anyway, but be safe).
