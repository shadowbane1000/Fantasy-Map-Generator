# Tasks — Plan 226 (`find_states_by_type`)

1. [x] Read analog files: `find-states-by-culture.ts` (+test), `find-burgs-by-type.ts` (+test), `set-state-type.ts` (+test), `list-states.ts`, `_shared/index.ts`.
2. [x] Capture baseline: 7 warnings / 1 info / 0 errors; 3632 tests passing.
3. [ ] Write `src/ai/tools/find-states-by-type.ts`:
   - `DEFAULT_FIND_STATES_BY_TYPE_LIMIT = 10000`, `MAX_FIND_STATES_BY_TYPE_LIMIT = 100000`.
   - `FindStatesByTypeHit`, `FindStatesByTypePayload`, `FindStatesByTypeResult` types.
   - `findStatesByTypeInPack(pack, type, limit)` pure scanner. Case-insensitive compare on `state.type`. Populates capital via `pack.burgs[state.capital].name` or `null`.
   - `FindStatesByTypeRuntime` + `defaultFindStatesByTypeRuntime`.
   - `parseLimit` helper.
   - `createFindStatesByTypeTool(runtime)` → Tool with rich description (include canonical types list, Anthropic API key note).
   - Import `STATE_TYPES` + `resolveStateType` from `./set-state-type` — DO NOT re-declare.
   - Export bound `findStatesByTypeTool`.
4. [ ] Write `src/ai/tools/find-states-by-type.test.ts`:
   - Fake pack with mix of state types, removed entries, neutrals, missing type, varied casing.
   - Pure-scanner block: matches case-insensitively, no cross-contamination, empty for unmatched, skips i=0/removed/no-type, truncation, populates all fields, not-ready paths.
   - Tool-surface block: canonical echoing, case variants, invalid/missing/empty/unknown `type`, supported list echoed, not-ready surfaced, limit validation, default limit, boundaries, empty-list match, schema export, constants.
   - `defaultFindStatesByTypeRuntime (integration)` block: stash/restore `globalThis.pack`, end-to-end via bound tool, not-ready surfacing.
   - Use `as unknown as { ... }` casts on globalThis.
5. [ ] Register in `src/ai/index.ts`:
   - Import `findStatesByTypeTool`.
   - Re-export symbols in alphabetical block near `findStatesByCulture`.
   - `registry.register(findStatesByTypeTool)` near `findStatesByCultureTool` line.
6. [ ] Add README_AI.md row near `find_states_by_culture` — include Anthropic API key note + example prompts.
7. [ ] Verify: `npm run build`, `npm test` (expect previous+~30), `npm run lint` (baseline unchanged).
8. [ ] Commit specific files with `feat(ai): add find_states_by_type tool`.
9. [ ] Report.
