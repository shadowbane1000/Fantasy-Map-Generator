# Tasks 255 — `find_largest_religions`

## Implementation

- [ ] Create `src/ai/tools/find-largest-religions.ts`:
  - Exported constants: `DEFAULT_FIND_LARGEST_RELIGIONS_N = 10`, `MAX_FIND_LARGEST_RELIGIONS_N = 500`, `FIND_LARGEST_RELIGIONS_METRICS = ["area","cells","population"] as const`, `DEFAULT_FIND_LARGEST_RELIGIONS_BY = "area"`.
  - Exported types: `FindLargestReligionsMetric`, `FindLargestReligionsHit`, `FindLargestReligionsPayload`, `FindLargestReligionsResult`, `FindLargestReligionsRuntime`.
  - `findLargestReligionsInPack(pack, n, by)` pure ranker — mirrors `find-largest-states.ts` but iterates `pack.religions`, skips `i=0` + `removed: true`, uses `rural+urban` for population.
  - `defaultFindLargestReligionsRuntime` reading from `getPack<PackLike>()`.
  - `createFindLargestReligionsTool(runtime)` factory + exported `findLargestReligionsTool` instance.
  - Description mirrors `find_largest_states` but adapted for religions (skip index-0 = "No religion").

## Tests

- [ ] Create `src/ai/tools/find-largest-religions.test.ts` mirroring `find-largest-states.test.ts`:
  - Pure ranker block: ranks by area/cells/population, slices to top `n`, large `n` returns all, skips `i=0` placeholder + removed, populates name/color/type/form, `not-ready` when pack missing, `not-ready` when `pack.religions` missing, empty religions yields empty result, missing numeric fields treated as 0.
  - Tool surface block: ok=true top-N default (area), defaults `n`/`by` when omitted, case-insensitive `by`, ranks by cells, rejects invalid `by`, rejects invalid `n`, empty result shape, surfaces not-ready as structured error, exports tool with expected schema, exposes DEFAULT + MAX constants, echoes `requested_n` and `by`.
  - `defaultFindLargestReligionsRuntime` integration block: set `globalThis.pack`, assert happy path ranking by area, ranking by population, tool uses default runtime, not-ready when pack undefined.
  - Use `as unknown as { ... }` casts on test pack fixtures (matches `find-largest-states.test.ts`).

## Registration

- [ ] `src/ai/index.ts`: import `findLargestReligionsTool`, add re-export block (constants, types, runtime, factory, inPack fn, tool), `registry.register(findLargestReligionsTool)` near `findLargestStatesTool`.

## README

- [ ] `README_AI.md`: add a `find_largest_religions` row immediately below the `find_largest_states` row. Must mention API-key setup line ("Requires an Anthropic API key (see 'Getting an API key' below).") and include usage examples.

## Verify

- [ ] Lint baseline BEFORE (already recorded: 7 warnings / 1 info / 0 errors).
- [ ] `npm run build` passes.
- [ ] `npm test` all pass (baseline 4480 → expected ~4520).
- [ ] `npm run lint` unchanged (7 warnings / 1 info / 0 errors).

## Commit

- [ ] `feat(ai): add find_largest_religions tool` with 1-2 line body; stage only the specific files created/modified.
