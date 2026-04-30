# Tasks 283 — `get_wind`

- [ ] 1. Read `src/ai/tools/set-wind.ts` to confirm exported constants
      (`WIND_BAND_COUNT`, `WIND_STORED_KEY`, `DEFAULT_WINDS`) and the
      `defaultSetWindRuntime.read` resolution order.
- [ ] 2. Read `src/ai/tools/get-generator-rates.ts` +
      `get-generator-rates.test.ts` for the runtime-seam template.
- [ ] 3. Read `src/ai/tools/get-climate.ts` for the alternate
      runtime-seam example.
- [ ] 4. Capture lint + test baselines (7 warnings / 1 info / 0 errors;
      294 files / 5076 tests pass).
- [ ] 5. Create `src/ai/tools/get-wind.ts`:
  - Export `WIND_BAND_NAMES` — readonly `[polar_north, temperate_north,
    tropical_north, tropical_south, temperate_south, polar_south]`.
  - `WindSnapshot` keyed by band name → `number | null`.
  - `WindReadRuntime` with `read()`.
  - `defaultWindReadRuntime` — options.winds[band] → localStorage tuple
    per band, reusing `WIND_BAND_COUNT` + `WIND_STORED_KEY`.
  - `createGetWindTool(runtime?)` returning a `Tool` whose `execute`
    returns `{ ok, ...snapshot, directions: [d0..d5] }`.
  - Exported `getWindTool` singleton.
- [ ] 6. Create `src/ai/tools/get-wind.test.ts`:
  - Pure-seam tests via `createGetWindTool({ read: () => snapshot })`
    covering: happy path (all six values + `directions` array), all
    nulls, ignoring unexpected input args.
  - Metadata assertions (name = `get_wind`, empty
    `input_schema.properties`, no `required`).
  - `defaultWindReadRuntime` integration suite using `globalThis`
    stubs and `as unknown as { ... }` casts:
    - reads from `options.winds` when present.
    - falls back to `localStorage["winds"]` (comma-joined).
    - returns null when neither source resolves.
    - prefers `options.winds` over localStorage.
    - ignores non-finite `options.winds[i]` entries.
    - ignores malformed localStorage tuples (wrong arity, NaN).
- [ ] 7. Register in `src/ai/index.ts`:
  - `import { getWindTool } from "./tools/get-wind";` placed
    alphabetically.
  - Re-export `createGetWindTool`, `defaultWindReadRuntime`,
    `getWindTool`, `WIND_BAND_NAMES`, `WindReadRuntime`,
    `WindSnapshot` from the barrel.
  - `registry.register(getWindTool);` placed near the other read-tool
    registrations.
- [ ] 8. Add a README_AI.md row near the `set_wind` row describing
      `get_wind` (returns the per-band degrees, mentions the
      `directions` parallel, API-key note, example prompts).
- [ ] 9. `npm run build` — must pass.
- [ ] 10. `npm test` — all pass; only delta is the new suite.
- [ ] 11. `npm run lint` — ≤ baseline.
- [ ] 12. Stage only the plan/task/tool/test/index/README files.
- [ ] 13. Commit with subject `feat(ai): add get_wind tool` and the
      Co-Authored-By line.
- [ ] 14. `git push -u origin plan-283-wind`.
