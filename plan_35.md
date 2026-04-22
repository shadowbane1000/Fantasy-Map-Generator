# Plan 35 — Use Case: Lock or unlock an entity

## Status

Iteration 35. 34 AI tools. Baseline 7 warnings / 1 info / 0 errors.
433 tests pass.

## Use Case

**"Lock (or unlock) a state, burg, culture, religion, or province to
prevent regeneration from affecting it."**

Every entity in the data model carries a `.lock` boolean. The UI
has lock icons in each overview / editor that flip it:

- States editor: `s.lock = !s.lock`
  (`public/modules/dynamic/editors/states-editor.js:1504`)
- Burgs overview: `burg.lock = !burg.lock`
  (`public/modules/ui/burgs-overview.js:188`)
- Cultures editor: `c.lock = !c.lock`
  (`public/modules/dynamic/editors/cultures-editor.js:946`)
- Religions editor: `r.lock = !r.lock`
  (`public/modules/dynamic/editors/religions-editor.js:830`)
- (Provinces editor — same pattern via `province.lock`)

No SVG redraw is needed — `.lock` is metadata consulted by the
generators during regenerate.

Unlike prior "one tool per entity" designs, lock is identical across
entity types. This is a good case for a polymorphic `type` enum —
the AI says "lock Altaria" without prefixing "state:" because the
request is unambiguous to humans, and the alternative (five separate
tools) is repetitive.

Prompts:
- *"Lock Altaria."* (state)
- *"Unlock the Stormport burg."*
- *"Lock the Highlanders culture."*

### Success criteria

1. `set_entity_lock({type: "state", entity: 1, locked: true})`
   sets `pack.states[1].lock = true`.
2. `set_entity_lock({type: "burg", entity: "stormport", locked:
   false})` resolves case-insensitively.
3. Five `type` values accepted (case-insensitive): `state`, `burg`,
   `culture`, `religion`, `province`.
4. Unknown `type` → structured error with `supported` list.
5. Index-0 (placeholder) for any type → error.
6. Unknown ref → error.
7. Non-boolean `locked` → error.
8. Idempotent: if current `.lock` matches requested value, returns
   `{ok: true, noop: true}`.
9. Runtime throws → structured error.

## Scope

In-scope:
- `set_entity_lock` tool with `EntityLockRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Locking rivers, routes, markers, or smaller entities (they use
  `.lock` too but UI surface is thinner; future iterations can
  extend).

## Design

New file: `src/ai/tools/set-entity-lock.ts`.

```ts
export type LockableEntityType =
  | "state" | "burg" | "culture" | "religion" | "province";
export const LOCKABLE_TYPES: LockableEntityType[] = [...];

export interface EntityLockRef {
  type: LockableEntityType;
  i: number;
  name: string;
  previousLocked: boolean;
}
export interface EntityLockRuntime {
  find(type: LockableEntityType, ref: number | string):
    | EntityLockRef
    | null;
  setLock(type: LockableEntityType, i: number, locked: boolean): void;
}
```

Default runtime dispatches to the right `pack.<collection>` via an
internal lookup and uses `findEntityByRef` from `_shared`. `setLock`
writes `collection[i].lock = locked`.

Executor:
1. Validate `type` via case-insensitive match against LOCKABLE_TYPES.
2. Validate `entity` (integer > 0 or non-empty string).
3. Validate `locked` is a boolean.
4. Find → null → error; i === 0 → error (shouldn't happen if find
   uses `findEntityByRef`, but defensive).
5. If `previousLocked === locked` → return noop.
6. `setLock(...)` → catch throws.
7. Return okResult.

## Files

Create: `plan_35.md`, `tasks_35.md`,
`src/ai/tools/set-entity-lock.ts`,
`src/ai/tools/set-entity-lock.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-entity-lock.test.ts`):

1. Lock a state by id.
2. Unlock a culture by name.
3. Each of the five types accepted (case-insensitive).
4. Unknown type → error + supported list.
5. Unknown entity → error.
6. Non-boolean locked → error.
7. Already-locked (idempotent no-op) → `{noop: true}`, setLock not
   called.
8. Runtime throws → error.
9. Invalid ref types rejected.

Plus a default-runtime integration test that dispatches to the
right collection by type (using a fake `window.pack` with one entry
per type).

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Type dispatch gets integration-level
coverage in the default-runtime test.

Lint / test / build gates in tasks_35.md.
