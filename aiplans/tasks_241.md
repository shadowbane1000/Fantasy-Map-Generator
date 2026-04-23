# Tasks 241 — `get_diplomacy_between`

- [ ] T1. Create `src/ai/tools/get-diplomacy-between.ts`:
  - Types: `DiplomacyBetween` result shape, `ReadDiplomacyBetweenResult` union (`not-ready | not-found | neutral | same-state | DiplomacyBetween`), `DiplomacyBetweenRuntime` seam.
  - `readDiplomacyBetweenFromPack(pack, aRef, bRef)` pure reader reusing `resolveStateRefInPack` from `./list-burgs`.
  - Normalize the `"x"` self-sentinel to `null`.
  - `defaultDiplomacyBetweenRuntime` pulling `pack` via `getPack<BurgPackLike>()`.
  - `createGetDiplomacyBetweenTool(runtime)` returning a `Tool` whose `execute` validates both refs (positive int or non-empty string), rejects `0` explicitly (Neutrals), resolves the seam, and returns `okResult` / `errorResult`.
  - Export the default singleton `getDiplomacyBetweenTool`.
- [ ] T2. Create `src/ai/tools/get-diplomacy-between.test.ts` covering all pure/seam cases from the plan plus a `defaultDiplomacyBetweenRuntime (integration)` block using `as unknown as { ... }` casts on `globalThis.pack`.
- [ ] T3. Register in `src/ai/index.ts`:
  - Import alphabetically (between `get-culture-info` and `get-entity-bbox`).
  - Add `export { ... } from "./tools/get-diplomacy-between";` adjacent to other `get-*-info` re-exports.
  - `registry.register(getDiplomacyBetweenTool);` near the block of `get_*_info` registrations.
- [ ] T4. Add README_AI.md row near `list_diplomacy` / `set_diplomacy` describing the tool + API-key requirement + examples.
- [ ] T5. Verify: `npm run build` passes, `npm test` green, `npm run lint` still 7 warnings / 1 info / 0 errors (baseline).
- [ ] T6. Commit with `feat(ai): add get_diplomacy_between tool`, staging only the newly-added files.
