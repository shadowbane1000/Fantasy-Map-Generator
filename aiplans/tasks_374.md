# Tasks 374: `toggle_lock_all_states` tool

Plan: `aiplans/plan_374.md`. Branch: `plan-374-toggle-lock-all-states`,
worktree at `/workspace/.claude/worktrees/plan-374`.

## 1. Implement `src/ai/tools/toggle-lock-all-states.ts`

- New file. Export:
  - `interface ToggleLockAllStatesResult { active_count: number; previously_all_locked: boolean; now_locked: number; now_unlocked: number; skipped_removed: number; }`
  - `interface ToggleLockAllStatesRuntime { getStates(): RawState[] | undefined; setLock(i: number, lock: boolean): void; addLines?: () => void; setLockAllIcon?: (className: string) => void; }`
  - `defaultToggleLockAllStatesRuntime` per plan §Files.
  - `createToggleLockAllStatesTool(runtime?)` returning a `Tool` with
    name `"toggle_lock_all_states"` and the described execute flow.
  - `toggleLockAllStatesTool` — default-runtime instance.
- Imports go through `_shared` (`errorResult`, `okResult`, `getPack`,
  `getGlobal`, type `RawState`).
- Description string: explicit "toggle to a single state" wording,
  references the per-row lock buttons in the states editor and the
  fact that locked states are honored by `regenerate_domain` (states)
  and `regenerate_all_state_names`.

## 2. Implement `src/ai/tools/toggle-lock-all-states.test.ts`

- Mirror the layout of `toggle-lock-all-burgs.test.ts` (unit +
  integration describe blocks).
- Implement all 29 tests from plan §Tests.
- Use `vi.fn()` for spy assertions on `getStates`, `setLock`,
  `addLines`, `setLockAllIcon`.
- Save/restore `globalThis.pack`, `globalThis.document`,
  `globalThis.statesEditorAddLines` in the integration block.
- Strict load-bearing fixtures for tests §5 and §6 (pre-mutation
  `allLocked === true`, toggle direction "unlock all", skipped entity
  starts at `lock=true` — so a touch would flip it to `false`).

## 3. Modify `src/ai/index.ts`

- Add import immediately after the `toggleLockAllBurgsTool` import:
  ```ts
  import { toggleLockAllStatesTool } from "./tools/toggle-lock-all-states";
  ```
- Add re-export block immediately after the `toggle-lock-all-burgs`
  re-export:
  ```ts
  export {
    createToggleLockAllStatesTool,
    defaultToggleLockAllStatesRuntime,
    type ToggleLockAllStatesResult,
    type ToggleLockAllStatesRuntime,
    toggleLockAllStatesTool,
  } from "./tools/toggle-lock-all-states";
  ```
- Add `registry.register(toggleLockAllStatesTool);` immediately after
  `registry.register(toggleLockAllBurgsTool);`.

## 4. Verify

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — still 0 errors, 0 warnings, 0 info. Baseline must
  hold.

## 5. Self-review

Read plan, tasks, implementation in turn. Confirm:
- 29 tests in the test file (count matches plan §Tests numbering).
- Both load-bearing fixtures (§5 removed state, §6 state 0) use
  pre-mutation `allLocked === true` so a touch would flip the
  skipped entity from `true` to `false`.
- In-place mutation test (§8) captures both array and per-state
  identity and asserts `===` after mutation.
- Error wording is the exact string
  `"window.pack.states is not available; the map hasn't finished loading."`.
- Tool name is `"toggle_lock_all_states"` and schema is
  `{ type: "object", properties: {} }`.
- Re-export block in `src/ai/index.ts` lists the same five symbols
  as the burg tool's re-export block (with `States` substituted for
  `Burgs`).

## 6. Commit on branch

```
feat(ai): add toggle_lock_all_states tool

Implements plan 374. Adds an AI chat tool that toggles every active
state's lock to a single state (lock all if any are unlocked, unlock
all if every active state is currently locked), mirroring
toggle_lock_all_burgs. State locks are honored by regenerate_domain
and regenerate_all_state_names.
```

Do NOT push.
