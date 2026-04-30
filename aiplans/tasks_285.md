# Tasks for plan 285 — `get_height_exponent`

1. **Refactor `src/ai/tools/set-height-exponent.ts`** to export the
   shared keys/ids:
   - `HEIGHT_EXPONENT_OPTION_KEY = "heightExponent"`
   - `HEIGHT_EXPONENT_INPUT_ID = "heightExponentInput"`
   - `HEIGHT_EXPONENT_STORED_KEY = "heightExponent"`
   - Also export `MIN_EXPONENT`, `MAX_EXPONENT`.
   - The default runtime body uses these constants. Behaviour
     unchanged; existing tests still pass.

2. **Create `src/ai/tools/get-height-exponent.ts`** following the
   `get-generator-rates.ts` pattern, with a single field:
   - Export `HeightExponentReadRuntime` interface (`read(): number | null`).
   - Export `defaultHeightExponentReadRuntime` reading
     options → DOM → localStorage in that order, returning `null` when
     none have a usable finite number. Use `getGlobal` from `_shared`.
     Reuse the constants exported from `set-height-exponent.ts`.
   - Export `createGetHeightExponentTool(runtime?)` returning a `Tool`
     with name `"get_height_exponent"`, empty `input_schema.properties`,
     and `execute()` that returns `okResult({ value })`.
   - Export `getHeightExponentTool` (default singleton).

3. **Create `src/ai/tools/get-height-exponent.test.ts`** covering:
   - Tool-level cases (fake runtime): mid value, null, ignore extra
     input, metadata.
   - Default-runtime integration tests with patched `globalThis`:
     options-hit, DOM fallback, localStorage fallback, all-null,
     options-over-DOM-over-localStorage precedence, ignores `NaN` from
     options.

4. **Wire into `src/ai/index.ts`**:
   - Add `import { getHeightExponentTool } from
     "./tools/get-height-exponent";` alphabetically (between
     `get-geography` and `get-layer-style`).
   - Add a barrel re-export block (between `get-geography` and
     `get-layer-style`) exporting:
     - `createGetHeightExponentTool`
     - `defaultHeightExponentReadRuntime`
     - type `HeightExponentReadRuntime`
     - `getHeightExponentTool`
   - Add `registry.register(getHeightExponentTool);` next to
     `registry.register(getGeneratorRatesTool);` /
     `registry.register(getGeographyTool);` in `buildDefaultRegistry`.

5. **Add a README row** in `README_AI.md` immediately after the
   `set_height_exponent` row, matching the prose style of
   `get_generator_rates` / `get_geography`.

6. **Verify**:
   - `npm test -- get-height-exponent` (must pass).
   - `npm test` (must not regress).
   - `npx tsc --noEmit` (clean).
   - `npm run lint` (no worse than baseline: 0 errors, 7 warnings, 1 info).

7. **Commit** only the files touched: plan, tasks, the two new source
   files, the modified `set-height-exponent.ts`, `src/ai/index.ts`, and
   `README_AI.md`. Subject: `feat(ai): add get_height_exponent tool`.
   Push to `origin/plan-285` (no `--force`).

## Review (mandatory)

- Plan covers the use case: yes — read-only, inverse of
  `set_height_exponent`, takes no params, returns `{ok, value}`.
- Resolution order matches setter's write order (plus optional
  forward-compatible options check).
- Tests would catch regressions: mid-range read, each fallback layer,
  precedence ordering, and the all-null degenerate case. Yes.
- Reuses setter constants so the pair cannot drift. Yes.
- Schema and shape mirror existing read-tools (`get_generator_rates`,
  `get_geography`). Yes.

No corrections needed.
