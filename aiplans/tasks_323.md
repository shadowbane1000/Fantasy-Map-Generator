# Tasks: Plan 323 — `count_relief_icons` AI tool

1. Capture lint baseline (`npm run lint`) — done in plan_323.md (7 warnings, 0 errors).
2. Write `aiplans/plan_323.md` (done).
3. Write `aiplans/tasks_323.md` (this file).
4. Self-review plan + tasks; record any edits in plan's Review section.
5. Implement `src/ai/tools/count-relief-icons.ts`:
   - `interface CountReliefIconsRuntime { getTerrainRoot(): Element | null; }`
   - `defaultCountReliefIconsRuntime` — try `window.terrain.node()`, fall back to `document.getElementById("terrain")`, else `null`.
   - `createCountReliefIconsTool(runtime?)` returns `Tool`.
   - `countReliefIconsTool` default export.
   - Validation: optional `type` string, must start with `#`.
   - Iterate `root.querySelectorAll("use")`, tally per-type via `getAttribute("href")`, skip null/empty hrefs.
   - Sort `by_type` count desc, type asc.
   - Filter: returns single entry `{ type, count }` (count may be 0).
   - Returns `{ ok, total, by_type, filtered_type? }`.
6. Implement `src/ai/tools/count-relief-icons.test.ts` covering cases 1–16 from plan.
7. Wire into `src/ai/index.ts`:
   - Import `countReliefIconsTool` near `listIceTool` / `listRouteGroupsTool`.
   - Add `countReliefIconsTool,` to the exported tools array.
   - Register with `registry.register(countReliefIconsTool);`.
8. Verify:
   - `npm test` — all green.
   - `npm run lint` — 7 warnings, 0 errors (no regression).
   - `npx tsc --noEmit` — clean.
9. Commit: `feat(ai): add count_relief_icons tool`. Stage only the new files + the touched lines in `src/ai/index.ts`. Don't stage `.claude/`, `current-ralph-loop.prompt`, or pre-existing dirty files.
10. Do not push.
