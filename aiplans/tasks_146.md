# Tasks 146 — `set_precipitation`

- [ ] 1. Create `src/ai/tools/set-precipitation.ts`.
  - [ ] Export `PRECIPITATION_MIN = 0`, `PRECIPITATION_MAX = 500`.
  - [ ] Export `PRECIPITATION_INPUT_ID = "precInput"`,
         `PRECIPITATION_OUTPUT_ID = "precOutput"`,
         `PRECIPITATION_STORED_KEY = "prec"`.
  - [ ] `SetPrecipitationRuntime` interface with `read()` → `number | null`
         and `apply(value: number)` → `void`.
  - [ ] `defaultSetPrecipitationRuntime`:
     - `read()` — reads `#precOutput` first, then `#precInput`, then
       `localStorage["prec"]`, returning the first parseable finite number
       or `null`.
     - `apply(value)` — writes both DOM inputs (wrapped in try/catch so we
       still hit localStorage), then `localStorage.setItem("prec", String(value))`.
       Does **not** touch `window.options` (matches `set-climate` with `optionKey: null`).
  - [ ] `createSetPrecipitationTool(runtime?)`:
     - name: `set_precipitation`.
     - description: explains it's passive (takes effect on next
       `regenerate_map`), bounds, side-effects, and references `set_climate`.
     - input_schema: `{ value: number, min: 0, max: 500, required }`.
     - execute: validates finite number in `[0, 500]`, reads previous,
       applies, returns `okResult({ previousValue, value })`.
  - [ ] Export `setPrecipitationTool = createSetPrecipitationTool()`.

- [ ] 2. Create `src/ai/tools/set-precipitation.test.ts`.
  - [ ] Unit block using a mocked runtime:
     - applies a valid value and returns `{ ok, previousValue, value }`.
     - rejects missing value (no `value` prop).
     - rejects non-number / non-finite / out-of-range (`-1`, `501`, `NaN`,
       `Infinity`, string).
     - accepts boundary values `0` and `500`.
     - surfaces runtime errors via `errorResult`.
     - passes `previousValue: null` when runtime.read returns null.
  - [ ] Integration block for `defaultSetPrecipitationRuntime` (mirror
         `set-climate.test.ts`'s style):
     - stub `document.getElementById` + `localStorage.setItem` /
       `.getItem` on `globalThis`.
     - applies value → both DOM elements updated + localStorage set.
     - reads previous value from `#precOutput` when present.
     - falls back to localStorage when DOM absent.
     - returns `null` previous when nothing set.
  - [ ] Use `as unknown as { ... }` for casts, matching house style.

- [ ] 3. Register in `src/ai/index.ts`:
  - [ ] Add `import { setPrecipitationTool } from "./tools/set-precipitation";`
         in alphabetical position (between `set-onload-behavior` and
         `set-province-capital`).
  - [ ] Add re-export block after `setOnloadBehaviorTool`:
         `export { createSetPrecipitationTool, setPrecipitationTool } from "./tools/set-precipitation";`.
  - [ ] Call `registry.register(setPrecipitationTool);` in `buildDefaultRegistry()`
         near the other Options-dialog tools (after `setOnloadBehaviorTool`).

- [ ] 4. Add README_AI.md row.
  - [ ] Insert a row for `set_precipitation` directly above or below
         `set_climate`, matching the table format. Describe bounds [0,500],
         that it writes DOM + localStorage only (no options object), returns
         `{previousValue, value}`, and note it's passive (takes effect on
         next `regenerate_map`).

- [ ] 5. Verify.
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` — total count increases (baseline: 1900 tests / 158 files).
  - [ ] `npm run lint` — matches baseline (7 warnings, 1 info, 0 errors).

- [ ] 6. Commit.
  - [ ] Stage only plan, tasks, tool, test, index, README.
  - [ ] `feat(ai): add set_precipitation tool` with 1–2 line body.
