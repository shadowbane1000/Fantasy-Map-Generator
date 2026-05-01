# Tasks 345: `generate_namesbase_examples` tool

Plan: `aiplans/plan_345.md`. Branch:
`plan-345-generate-namesbase-examples`, worktree at
`/workspace/.claude/worktrees/plan-345`.

## 1. Implement `src/ai/tools/generate-namesbase-examples.ts`

- New file. Export:
  - `interface GenerateNamesbaseExamplesResult { index: number; name: string; requested_count: number; examples: string[]; examples_truncated: boolean; }`
  - `interface GenerateNamesbaseExamplesRuntime { getNameBases(): NameBaseLike[]; generateOne(index: number): string | undefined; }`
  - `defaultGenerateNamesbaseExamplesRuntime` per plan §Files.
    - `getNameBases()`: read `getGlobal<unknown>("nameBases")`, throw
      `"window.nameBases is unavailable. Generate or load a map first."`
      when missing or non-array.
    - `generateOne(index)`: read `getGlobal<{ getBase?: (i: number) => unknown }>("Names")`;
      throw `"Names.getBase is not available; the map hasn't finished loading."`
      if the module / method is missing; otherwise return
      `typeof value === "string" ? value : undefined`.
  - `createGenerateNamesbaseExamplesTool(runtime?)` returning a `Tool`
    with name `"generate_namesbase_examples"` and the described
    execute flow.
  - `generateNamesbaseExamplesTool` — default-runtime instance.
- Imports go through `_shared` (`errorResult`, `okResult`,
  `getGlobal`) and `./rename-namesbase` (`findNamesbaseByIndex`,
  `findNamesbasesByName`, type `NamesbaseRenameRef`).
- Description string mentions: mirrors the "Examples" button in the
  Namesbase Editor, calls `Names.getBase(i)` N times, default 7
  (1–50 cap), pure read.

## 2. Implement `src/ai/tools/generate-namesbase-examples.test.ts`

- Mirror the layout of `analyze-namesbase.test.ts` (unit + integration
  + registry round-trip describe blocks).
- Implement all 36 tests from plan §Tests.
- Use `vi.fn()` for spy assertions on `getNameBases` and `generateOne`.
- Save/restore `globalThis.nameBases` and `globalThis.Names` in the
  integration block.
- The purity test (§25) MUST capture array identity, entry identity,
  AND the corpus value before the call.
- The truncation tests (§10, §11) MUST assert exact `generateOne`
  call count to verify the loop breaks early.
- The default-count tests (§1, §9) MUST assert `requested_count: 7`
  and `examples.length === 7` to verify the default is applied.

## 3. Modify `src/ai/index.ts`

- Add import (between line 90 `focusOnMapTool` and line 91
  `getBiomeDistributionTool`):
  ```ts
  import { focusOnMapTool } from "./tools/focus-on-map";
  import { generateNamesbaseExamplesTool } from "./tools/generate-namesbase-examples";
  import { getBiomeDistributionTool } from "./tools/get-biome-distribution";
  ```
- Add re-export block immediately after the `focus-on-map` re-export
  block (around line 1196):
  ```ts
  export {
    createGenerateNamesbaseExamplesTool,
    defaultGenerateNamesbaseExamplesRuntime,
    type GenerateNamesbaseExamplesResult,
    type GenerateNamesbaseExamplesRuntime,
    generateNamesbaseExamplesTool,
  } from "./tools/generate-namesbase-examples";
  ```
- Add `registry.register(generateNamesbaseExamplesTool);` at the end
  of the registration block (after the last `registry.register(...)`
  call), matching the convention used by recent plan tools.

## 4. Verify

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint` — still 0 errors, 0 warnings, 0 info. Baseline must
  hold.

## 5. Commit on branch

```
feat(ai): add generate_namesbase_examples tool

Implements plan 345. Adds an AI chat tool that calls Names.getBase(i)
N times to generate preview names from a single namesbase, mirroring
the "Examples" button in the namesbase editor. Pure read; defaults to
7 examples; stops early if the generator returns undefined.
```

Do NOT push.
