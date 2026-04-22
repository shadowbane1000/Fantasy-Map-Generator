# Plan 39 — Use Case: Tune state / culture / religion expansionism

## Status

Iteration 39. 38 AI tools. Baseline 7 warnings / 1 info / 0 errors.
468 tests pass.

Previous iteration added `set_state_expansionism` (narrow). This
iteration generalizes to all three entity types and retires the
narrow variant.

## Use Case

**"Tune the expansionism of a state, culture, or religion."**

All three have an identical side-effect in their editor handlers:

```js
// states-editor.js:568
pack.states[i].expansionism = value; recalculateStates();

// cultures-editor.js:357
pack.cultures[i].expansionism = value; recalculateCultures();

// religions-editor.js:477
pack.religions[i].expansionism = value; recalculateReligions();
```

The `recalculate*` functions are module-scoped in each dynamic
editor and not globally callable. As with iter 38, the tool is
passive: the value is read by `regenerate_map`.

Prompts:
- *"Set the Highlanders culture expansionism to 3."*
- *"Make the Old Faith religion more aggressive."*
- *"Double Altaria's expansionism."* (state, same as before)

### Success criteria

1. `set_entity_expansionism({type: "state", entity: 1,
   expansionism: 2.5})` → `pack.states[1].expansionism = 2.5`.
2. Same shape for `type: "culture"` → `pack.cultures[i].expansionism`.
3. Same shape for `type: "religion"` → `pack.religions[i].expansionism`.
4. Type aliases: singular + plural + a couple of synonyms (`faith`
   → religion).
5. Unknown type → structured error listing supported types.
6. Rejects index 0 for any type.
7. Rejects unknown entity.
8. Rejects invalid expansionism (≤ 0, > 100, non-finite,
   non-number).
9. Response:
   `{type, i, name, previousExpansionism, expansionism}`.

## Scope

In-scope:
- Rename / replace `set_state_expansionism` with
  `set_entity_expansionism`.
- Delete `set-state-expansionism.ts` and its test.
- Update registry + README + `src/ai/index.ts` exports.

Out-of-scope:
- Triggering recalculate functions (not exposed).
- Entity-specific semantics — expansionism means the same thing
  across types (how aggressively it expands during regeneration).

## Design

Replace `src/ai/tools/set-state-expansionism.ts` with
`src/ai/tools/set-entity-expansionism.ts`:

```ts
export type ExpansionableType = "state" | "culture" | "religion";
export const EXPANSIONABLE_TYPES: ExpansionableType[] = [...];
export interface EntityExpansionismRef {
  type: ExpansionableType;
  i: number;
  name: string;
  previousExpansionism: number;
}
export interface EntityExpansionismRuntime {
  find(type: ExpansionableType, ref: number | string):
    | EntityExpansionismRef
    | null;
  apply(type: ExpansionableType, i: number, expansionism: number): void;
}
```

Pure `resolveExpansionableType(s)` alias map:
`state/states` → state; `culture/cultures` → culture;
`religion/religions/faith/faiths` → religion.

Default runtime dispatches by type to the right pack collection via
a `COLLECTION_KEY` map (same pattern as `set_entity_lock`), uses
`findEntityByRef`, and writes `.expansionism`. Range validation in
the executor: finite, > 0, ≤ 100.

## Files

Create: `plan_39.md`, `tasks_39.md`,
`src/ai/tools/set-entity-expansionism.ts`,
`src/ai/tools/set-entity-expansionism.test.ts`.

Delete: `src/ai/tools/set-state-expansionism.ts`,
`src/ai/tools/set-state-expansionism.test.ts`.

Modify: `src/ai/index.ts` (swap import/export/register),
`README_AI.md` (replace the narrow-tool row).

## Testing

Unit (`set-entity-expansionism.test.ts`):

1. `state` id + value → `apply("state", 1, 2.5)`.
2. `culture` name → `apply("culture", <id>, value)`.
3. `religion` by id → `apply("religion", ...)`.
4. Aliases (`faiths`, `states`, `CULTURES`) resolve correctly.
5. Unknown type → error + supported list.
6. Unknown entity → error.
7. Invalid expansionism values rejected.
8. Invalid ref types rejected.
9. Runtime throws → error.
10. Reject index 0 for each type.

Plus default-runtime dispatch test:

11. `defaultEntityExpansionismRuntime` writes the right field across
    all three collections.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Replaces last iteration's narrow tool
with a strictly more capable one — no new behaviour is lost.

Lint / test / build gates in tasks_39.md.
