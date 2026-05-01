# Tasks 346: `set_emblem_shield` tool

Plan: `aiplans/plan_346.md`. Branch:
`plan-346-set-emblem-shield`, worktree at
`/workspace/.claude/worktrees/plan-346`.

## 1. Implement `src/ai/tools/set-emblem-shield.ts`

- New file. Export:
  - `type EmblemShieldEntityType = "state" | "province" | "burg"`.
  - `interface EmblemShieldRef { i: number; name: string;
    previousShield: string | null; }`.
  - `interface EmblemShieldRuntime { find(type, ref); apply(type, i,
    shield); }` per plan §Files.
  - `defaultEmblemShieldRuntime` per plan §Files:
    - `find(type, ref)`: dispatches on `type` to call
      `findEntityByRef(getPackCollection<...>(...))`. Returns
      `{i, name: entry.name ?? "", previousShield: entry.coa?.shield ?? null}`.
    - `apply(type, i, shield)`: looks up the entity, initialises
      `entity.coa = entity.coa ?? {}`, sets `entity.coa.shield = shield`,
      then best-effort DOM removal + `COArenderer.trigger(id, coa)`
      where `id = "${type}COA${i}"`.
  - `createSetEmblemShieldTool(runtime?)` returning a `Tool`
    with name `"set_emblem_shield"` and the described execute flow.
  - `setEmblemShieldTool` — default-runtime instance.
- Imports go through `_shared`
  (`errorResult`, `okResult`, `getGlobal`, `getPack`,
  `getPackCollection`, `findEntityByRef`, `parseEntityRef`, types
  `Pack`, `RawState`, `RawProvince`, `RawBurg`, `RawCoa`) and
  `./set-culture-shield` (`CULTURE_SHIELDS`, `resolveCultureShield`).
  Do NOT redeclare the shield list.
- Description string mentions: mirrors the "Shape" select in the
  Emblem Editor's per-entity panel; sets `coa.shield` on a single
  state / province / burg; preserves all other coa fields; best-effort
  refreshes the `#${type}COA${i}` DOM node via `COArenderer.trigger`;
  refuses entity 0 / removed entities; complements
  `set_default_emblem_shape` (global) and `set_culture_shield`
  (per-culture).

## 2. Implement `src/ai/tools/set-emblem-shield.test.ts`

- Mirror the layout of `set-culture-shield.test.ts` and
  `regenerate-burg-coa.test.ts` (unit + integration + registry
  round-trip describe blocks).
- Implement all 39 tests from plan §Tests.
- Use `vi.fn()` for spy assertions on `find` and `apply`.
- Save/restore `globalThis.pack`, `globalThis.COArenderer`, and
  `globalThis.document` in the integration block.
- The previous_shield-before-mutation tests (§23, §29) MUST pin down
  ordering at both unit and integration level.
- The "preserves other coa fields" test (§28) MUST include reference
  equality on a sub-object (e.g. `charges` array) to rule out
  spread-into-new-object implementations.
- The "missing coa" test (§27) MUST assert `previous_shield: null`
  AND that `coa` is now `{ shield: <new value> }`.
- The error message tests (§13, §17) MUST match the exact verbatim
  strings from plan §Errors.

## 3. Modify `src/ai/index.ts`

- Add import alphabetically between `setDiplomacyTool` (line 272)
  and `setEntityExpansionismTool` (line 273):
  ```ts
  import { setDiplomacyTool } from "./tools/set-diplomacy";
  import { setEmblemShieldTool } from "./tools/set-emblem-shield";
  import { setEntityExpansionismTool } from "./tools/set-entity-expansionism";
  ```
- Add re-export block alphabetically between the `set-diplomacy`
  re-export (lines 2342-2348) and the `set-entity-expansionism`
  re-export (line 2349):
  ```ts
  export {
    createSetEmblemShieldTool,
    defaultEmblemShieldRuntime,
    type EmblemShieldEntityType,
    type EmblemShieldRef,
    type EmblemShieldRuntime,
    setEmblemShieldTool,
  } from "./tools/set-emblem-shield";
  ```
- Add `registry.register(setEmblemShieldTool);` at the end of the
  registration block (after the last `registry.register(...)` call,
  matching recent plan convention — same row as
  `generateNamesbaseExamplesTool` from plan 345).

## 4. Verify

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — still 0 errors, 0 warnings, 0 info. Baseline must
  hold.

## 5. Commit on branch

```
feat(ai): add set_emblem_shield tool

Implements plan 346. Adds an AI chat tool that sets the per-entity COA
shield (state/province/burg), then triggers a re-render via
COArenderer.trigger, mirroring the "Shape" select in the emblem editor.
```

Do NOT push.
