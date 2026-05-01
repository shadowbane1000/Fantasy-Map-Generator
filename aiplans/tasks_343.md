# Tasks 343: `toggle_lock_all_burgs` tool

Plan: `aiplans/plan_343.md`. Branch: `plan-343-toggle-lock-all-burgs`,
worktree at `/workspace/.claude/worktrees/plan-343`.

## 1. Implement `src/ai/tools/toggle-lock-all-burgs.ts`

- New file. Export:
  - `interface ToggleLockAllBurgsResult { active_count: number; previously_all_locked: boolean; now_locked: number; now_unlocked: number; skipped_removed: number; }`
  - `interface ToggleLockAllBurgsRuntime { getBurgs(): RawBurg[] | undefined; setLock(i: number, lock: boolean): void; addLines?: () => void; setLockAllIcon?: (className: string) => void; }`
  - `defaultToggleLockAllBurgsRuntime` per plan §Files.
  - `createToggleLockAllBurgsTool(runtime?)` returning a `Tool` with
    name `"toggle_lock_all_burgs"` and the described execute flow.
  - `toggleLockAllBurgsTool` — default-runtime instance.
- Imports go through `_shared` (`errorResult`, `okResult`, `getPack`,
  `getGlobal`, type `RawBurg`).
- Description string matches the plan: explicit "toggle to a single
  state" wording, references the burgs overview lock-all button.

## 2. Implement `src/ai/tools/toggle-lock-all-burgs.test.ts`

- Mirror the layout of `invert-marker-pins.test.ts` (unit + integration
  describe blocks).
- Implement all 29 tests from plan §Tests, with the corrected
  fixtures for §5 and §6 (see plan §Corrections).
- Use `vi.fn()` for spy assertions on `getBurgs`, `setLock`,
  `addLines`, `setLockAllIcon`.
- Save/restore `globalThis.pack`, `globalThis.document`,
  `globalThis.burgsOverviewAddLines` in the integration block.

## 3. Modify `src/ai/index.ts`

- Add import (line 348, immediately after `splitRegimentTool`):
  ```ts
  import { toggleLockAllBurgsTool } from "./tools/toggle-lock-all-burgs";
  ```
- Add re-export block immediately after the `split-regiment`
  re-export (around line 2746):
  ```ts
  export {
    createToggleLockAllBurgsTool,
    defaultToggleLockAllBurgsRuntime,
    type ToggleLockAllBurgsResult,
    type ToggleLockAllBurgsRuntime,
    toggleLockAllBurgsTool,
  } from "./tools/toggle-lock-all-burgs";
  ```
- Add `registry.register(toggleLockAllBurgsTool);` at the end of the
  registration block (after the last `registry.register(...)` call).

## 4. Verify

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — still 0 errors, 0 warnings, 0 info. Baseline must
  hold.

## 5. Commit on branch

```
feat(ai): add toggle_lock_all_burgs tool

Implements plan 343. Adds an AI chat tool that toggles every active
burg's lock to a single state (lock all if any are unlocked, unlock
all if every active burg is currently locked), mirroring the lock-all
button in the burgs overview.
```

Do NOT push.
