# Tasks 329 — `regenerate_relief_icons`

1. Capture lint baseline (`npm run lint 2>&1 | tail -50`) — recorded
   in `plan_329.md` (clean: 0 warnings, 0 errors, 0 info).
2. Read sibling tools for pattern parity:
   `src/renderers/draw-relief-icons.ts`,
   `src/ai/tools/clear-relief-icons.ts`,
   `src/ai/tools/count-relief-icons.ts`,
   `src/ai/tools/add-relief-icon.ts`,
   `src/ai/tools/regenerate-zones.ts`,
   `src/ai/tools/regenerate-emblems.ts`, plus their `.test.ts`
   siblings. Confirm runtime-seam shape, error-message conventions,
   alphabetical wiring slots.
3. Write `aiplans/plan_329.md` (use case, lint baseline, behavior,
   schema, errors, success result, files, tests, verification,
   self-review).
4. Write `aiplans/tasks_329.md` (this file).
5. Self-review: re-read both files. Verify
   - tasks would actually accomplish the plan,
   - the plan would actually accomplish the use case,
   - the tests would actually verify the use case (especially:
     `previous_count` is captured BEFORE `drawReliefIcons` runs, then
     `count` is computed AFTER),
   - error messages and field names match neighbouring relief-icon
     tools and the brief.
   Document any corrections at the bottom of `plan_329.md`'s
   `## Self-review` section.
6. Implement `src/ai/tools/regenerate-relief-icons.ts`:
   - `interface RegenerateReliefIconsRuntime` with two methods:
     - `getTerrainRoot(): Element | null` — same shape as the
       sibling tools.
     - `regenerate(): void` — invokes `window.drawReliefIcons()`,
       throws if missing.
   - `defaultRegenerateReliefIconsRuntime`:
     - `getTerrainRoot`: try `getGlobal<{ node?: () => Element |
       null }>("terrain").node()`; fall back to
       `document.getElementById("terrain")`.
     - `regenerate`: look up `getGlobal<() => void>("drawReliefIcons")`;
       throw `"window.drawReliefIcons is not available."` if not a
       function; otherwise invoke it.
   - `createRegenerateReliefIconsTool(runtime?)` factory.
   - Eager `regenerateReliefIconsTool`.
   - `execute` flow:
     1. `root = runtime.getTerrainRoot()`. If null →
        `errorResult("terrain SVG layer is not available.")`.
     2. `previous_count = root.querySelectorAll("use").length`.
     3. `try { runtime.regenerate(); } catch (err) { return errorResult(err.message); }`
     4. Re-resolve `root2 = runtime.getTerrainRoot() ?? root`.
     5. `count = root2.querySelectorAll("use").length`.
     6. `return okResult({ count, previous_count });`
7. Implement `src/ai/tools/regenerate-relief-icons.test.ts` covering
   every case in the plan's Tests section:
   - tool metadata (name, schema, description keywords)
   - factory equivalence + registry round-trip
   - 4 stub-runtime happy-path cases (5→8, 0→0, 0→12, 4→0) — the
     5→8 case has the load-bearing `previous_count === 5` assertion
   - missing terrain root error
   - regenerate throw (Error and non-Error/string)
   - default-runtime: D3 selection path, document fallback, missing
     `drawReliefIcons`, non-function `drawReliefIcons`, missing both,
     `getTerrainRoot()` returns null when nothing is present.
8. Wire into `src/ai/index.ts`:
   - Import `regenerateReliefIconsTool` alphabetically between
     `regenerateRegimentNamesTool` and `regenerateReligionNamesTool`.
   - Add re-export block for `createRegenerateReliefIconsTool`,
     `defaultRegenerateReliefIconsRuntime`,
     `RegenerateReliefIconsRuntime`,
     `regenerateReliefIconsTool` between
     `regenerate-regiment-names` and `regenerate-religion-names`
     re-export blocks.
   - Add `registry.register(regenerateReliefIconsTool);` in
     `createDefaultRegistry` immediately after
     `registry.register(regenerateZonesTool);` and before
     `registry.register(clearReliefIconsTool);` so the relief
     family stays grouped.
9. Run the full gate from the worktree:
   - `npm test` — all green.
   - `npx tsc --noEmit` — clean.
   - `npm run lint` — still 0 warnings, 0 info, 0 errors.
10. Commit with message:
    ```
    feat(ai): add regenerate_relief_icons tool

    Implements plan 329. Adds an AI chat tool that wipes terrain
    and calls drawReliefIcons() to re-place all relief icons
    procedurally, mirroring the "Regenerate Relief Icons" button.
    ```
    Stage:
    - `src/ai/tools/regenerate-relief-icons.ts`
    - `src/ai/tools/regenerate-relief-icons.test.ts`
    - `src/ai/index.ts`
    - `aiplans/plan_329.md`
    - `aiplans/tasks_329.md`
    Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or any
    other dirty file outside this plan.
11. Do NOT push. Report final commit SHA, gate results, and any
    open issues.
