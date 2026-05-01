# Tasks for plan 338

## Implementation

- [ ] **NEW** `src/ai/tools/regenerate-regiment-name.ts`
  - Re-export `findRegimentByRef` from `rename-regiment.ts` is *not* enough: the per-name ambiguity check needs to see *all* matches. Implement a small local helper `findRegimentMatches(military, regRef)` that returns either a unique regiment, `null`, or a "multiple matches" payload.
  - Define `RegenerateRegimentNameRuntime` (`find`, `generate`, `apply`, `redraw`).
  - Define a `FindResult` union with `kind: "ok" | "state-not-found" | "state-inactive" | "no-military" | "regiment-not-found" | "regiment-ambiguous"`.
  - `defaultRegenerateRegimentNameRuntime`:
    - `find` uses `getPack<BurgPackLike>()`, `resolveStateRefInPack`, and `findRegimentMatches`. Reject `state.i === 0` or `state.removed`.
    - `generate` calls `Military.getName(reg, military)` (loads `Military` via `getGlobal<MilitaryModule>("Military")`).
    - `apply` writes `regiment.name = name` and (best-effort) updates the `#regiment{stateId}-{i}` SVG `data-name` attribute.
    - `redraw` calls `getGlobal<() => void>("drawMilitary")?.()`.
  - `createRegenerateRegimentNameTool(runtime)`:
    - Validate `state` (`isValidStateRef`) and `regiment` (`isValidRef`).
    - Call `runtime.find(stateRef, regimentRef)`. Map each `kind` to its verbatim error string. Ambiguous case includes `candidates` payload.
    - Build a synthetic `RawRegiment`-shaped object only as needed for `Military.getName`; pass the actual regiment from the pack (the runtime owns the lookup).
    - Capture `previousName = current.name` BEFORE calling `apply`.
    - Try `runtime.generate(...)`. On error, surface message; do not call `apply` / `redraw`.
    - Empty / whitespace generator output → error `"Name generator returned an empty string."`.
    - Try `runtime.apply(stateId, i, newName)`. On error, surface; do not call `redraw`.
    - Try `runtime.redraw()`; swallow errors (consistent with bulk tool).
    - Return `okResult({ state: { i, name }, regiment: { i, previous_name, name } })`.
  - Export the singleton `regenerateRegimentNameTool`.

- [ ] **NEW** `src/ai/tools/regenerate-regiment-name.test.ts`
  - All 14 cases enumerated in `plan_338.md` § Tests.
  - Use `vi.fn` for runtime stubs.
  - Integration block uses `beforeEach`/`afterEach` to swap `globalThis.pack`, `globalThis.Military`, `globalThis.drawMilitary`, `globalThis.document` (mirroring the integration block in `regenerate-regiment-names.test.ts`).
  - **MUST include the `previous_name` BEFORE-mutation regression test (#14).**

- [ ] **MODIFY** `src/ai/index.ts`
  - Import: insert `import { regenerateRegimentNameTool } from "./tools/regenerate-regiment-name";` immediately *before* the existing `regenerate-regiment-names` import (alphabetical).
  - Re-export: insert an `export { createRegenerateRegimentNameTool, regenerateRegimentNameTool } from "./tools/regenerate-regiment-name";` block immediately *before* the existing `./tools/regenerate-regiment-names` re-export block.
  - Registry: insert `registry.register(regenerateRegimentNameTool);` immediately *before* the existing `registry.register(regenerateRegimentNamesTool);` line.

## Mandatory review checkpoint

- [ ] Re-read `aiplans/plan_338.md` end-to-end.
- [ ] Re-read `aiplans/tasks_338.md` end-to-end.
- [ ] Verify the **`previous_name` BEFORE mutation** regression test is present in the test list (#14).
- [ ] Document any corrections in `aiplans/plan_338.md` § Self-review.

## Verification

- [ ] `npm test` — green.
- [ ] `npx tsc --noEmit` — green.
- [ ] `npm run lint` — clean (still zero fixes / zero warnings vs. baseline).

## Commit

- [ ] `git add` only the new + modified files.
- [ ] Commit on branch `plan-338-regenerate-regiment-name` with the message specified in the prompt.
- [ ] Do NOT push.

## Final report

- [ ] Commit SHA.
- [ ] Final `npm test` summary line.
- [ ] Final `npm run lint` summary line.
- [ ] Final `npx tsc --noEmit` result.
- [ ] Any open issues.
