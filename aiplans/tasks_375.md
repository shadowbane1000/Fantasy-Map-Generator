# Tasks for Plan 375 — `regenerate_all_route_names`

1. **Establish lint baseline.** Run `npm run lint` from the worktree
   root and confirm clean output. Capture the result in `plan_375.md`.

2. **Create `src/ai/tools/regenerate-all-route-names.ts`.** Exports:
   - `interface RouteLike { i, name?, group?, points?, lock?, removed? }`
   - `interface RegenerateAllRouteNamesRuntime { getRoutes(): RouteLike[]; generateName(route: RouteLike): string; }`
   - `defaultRegenerateAllRouteNamesRuntime` — `getRoutes()` reads
     `getPackCollection<RawRoute>("routes")`; `generateName(route)`
     calls `getGlobal<RoutesModuleLike>("Routes")?.generateName({ group, points })`.
   - `createRegenerateAllRouteNamesTool(runtime?)`
   - `regenerateAllRouteNamesTool` (default-runtime instance).
   - Internal `applyName(i, name)` helper that mutates the live
     `pack.routes[k]` whose `i === k`.

3. **Implement the tool body.** Tool name
   `"regenerate_all_route_names"`; empty `input_schema.properties`;
   description that explains the family-completion intent, the
   `Routes.generateName({ group, points })` call, lock-honoring,
   index-0 skip, no-redraw, and "Unnamed route" pass-through. Loop
   skips `i <= 0` and `removed`; increments `total / regenerated /
   locked`; returns
   `okResult({ total, regenerated, locked })`. Errors as listed in
   plan §Errors with the exact strings.

4. **Create `src/ai/tools/regenerate-all-route-names.test.ts`** with
   the 15 cases enumerated in plan §Tests:
   1. Happy path (3 unlocked, all rolled).
   2. Locked routes preserved.
   3. Mixed locked + unlocked.
   4. Routes with no current name.
   5. Empty `pack.routes` → `"pack.routes is empty."`.
   6. Missing `pack.routes` → `"pack.routes is not available."`.
   7. Skips index 0 (placeholder convention).
   8. Tool name === `"regenerate_all_route_names"`.
   9. Stub runtime: `getRoutes` × 1, `generateName` × N (unlocked
      non-zero count) with the right `i`.
   10. Registry round-trip mutates `pack.routes[i].name`.
   11. Default-runtime integration with live `globalThis.pack.routes`
       + `globalThis.Routes`.
   12. `generateName` throws → `"Route ${i}: <msg>"`.
   13. Empty/whitespace generator output → trimmed-empty error.
   14. Generator output is trimmed before storing.
   15. Removed routes ignored.

   Stub-runtime tests must populate `globalThis.pack.routes` in
   `beforeEach` because apply writes through the live pack.

5. **Wire `src/ai/index.ts`.** Add (alphabetical order):
   - Import `regenerateAllRouteNamesTool` between
     `regenerateAllProvinceNamesTool` and
     `regenerateAllStateNamesTool`.
   - Re-export block (between the same two existing blocks)
     re-exporting `createRegenerateAllRouteNamesTool`,
     `defaultRegenerateAllRouteNamesRuntime`,
     `RegenerateAllRouteNamesRuntime`, `RouteLike`, and
     `regenerateAllRouteNamesTool`.
   - `registry.register(regenerateAllRouteNamesTool);` between the
     `regenerateAllProvinceNamesTool` and `regenerateAllStateNamesTool`
     registrations.

6. **Run the verification suite.** From the worktree root:
   - `npx tsc --noEmit` — must succeed.
   - `npm run lint` — must remain clean (matches baseline).
   - `npm test` — full Vitest suite must stay green.

7. **Self-review pass.** Walk plan ↔ tasks ↔ implementation; fix any
   gaps. In particular check: tool name string, registry order, types
   re-exported, all 15 tests present, error strings match the plan
   verbatim.

8. **Commit on branch `plan-375-regenerate-all-route-names`.** Stage
   only the new tool file, its test file, the modified
   `src/ai/index.ts`, `aiplans/plan_375.md`, and `aiplans/tasks_375.md`.
   Commit message:

   ```
   feat(ai): add regenerate_all_route_names tool

   Implements plan 375. Fills the last gap in the "regenerate all names"
   tool family: bulk-regenerates every non-locked route's name via
   Routes.generateName({ group, points }), honoring route.lock and
   skipping index 0 by convention.
   ```

   Do NOT push.
