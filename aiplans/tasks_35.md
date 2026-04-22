# Tasks 35 — Execution checklist for Plan 35

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 433 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-entity-lock.ts`
      - `LockableEntityType` union + `LOCKABLE_TYPES` tuple.
      - `EntityLockRef`, `EntityLockRuntime` interfaces.
      - Pure `resolveLockableType(s)` helper (case-insensitive alias
        map: singular + plural for ergonomics — `state` / `states` /
        `burg` / `burgs` / etc.).
      - `defaultEntityLockRuntime` dispatches by type to the right
        `pack.<collection>` via `findEntityByRef` and sets `.lock`.
      - `createSetEntityLockTool(runtime?)` + `setEntityLockTool`.
      - Idempotent: returns `noop: true` when `previousLocked ===
        locked`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-entity-lock.test.ts` — 10 cases + a
      default-runtime dispatch test.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
