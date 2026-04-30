# Plan 282 — `get_precipitation` Tool

## Goal
Add a read-only AI tool `get_precipitation` that is the inverse of `set_precipitation`. It reports the current precipitation slider value so a chat user can ask "what's the precipitation set to?" and get a number back. Mirrors the resolution pattern used by `get_climate`, `get_geography`, `get_world_rates`, `get_year_and_era`, and `get_generator_rates`.

## Baselines (captured before any code changes)
- `npm run lint` — `Found 7 warnings.` `Found 1 info.` 0 errors. Checked 664 files.
- `npm test` — Test Files 294 passed (294); Tests 5076 passed (5076).

## Source of truth resolution
Precipitation has a single value (no per-field map needed). In order:
1. `window.options.prec` — if a finite `number` (forward-compat: the legacy UI does not currently write this, but `get_climate`-style options pathway is the agreed convention).
2. DOM: `document.getElementById(PRECIPITATION_OUTPUT_ID).value` parsed as float — matches `set_precipitation.read()` (output first, then input — output is the `<input type="number">` reflecting the canonical value the UI keeps in sync).
3. DOM: `document.getElementById(PRECIPITATION_INPUT_ID).value` parsed as float.
4. `localStorage.getItem(PRECIPITATION_STORED_KEY)` parsed as float — matches the UI's `data-stored` persistence.
5. Otherwise `null`.

Order 2-4 is exactly the order `defaultSetPrecipitationRuntime.read()` already uses. Step 1 is added to keep the runtime parallel to `defaultGeneratorRatesReadRuntime` / `defaultClimateReadRuntime` — finite-only check so legacy UIs that don't populate `options.prec` simply fall through.

## Design decisions
- Reuse `PRECIPITATION_INPUT_ID`, `PRECIPITATION_OUTPUT_ID`, `PRECIPITATION_STORED_KEY` from `./set-precipitation` — do NOT duplicate constants. (We choose `prec` as the options key; matches the localStorage key used by `set_precipitation` and the `grid.cells.prec` data-model term.)
- `PrecipitationReadRuntime` interface with `read(): PrecipitationSnapshot` allows tests to inject fakes (mirrors `ClimateReadRuntime`, `GeneratorRatesReadRuntime`).
- `PrecipitationSnapshot = { value: number | null }` — a single-field object, so the tool response shape is symmetric with the others (`{ ok: true, value: <num|null> }`).
- Default runtime resolves options → DOM-output → DOM-input → localStorage → null and returns the snapshot.
- No parameters required; unexpected input keys are ignored.
- Read-only: never mutates `window.options`, the DOM, or `localStorage`.

## Tool response shape
```json
{ "ok": true, "value": 100 }
```
Or, when nothing resolves:
```json
{ "ok": true, "value": null }
```

## Files
- New: `src/ai/tools/get-precipitation.ts`
- New: `src/ai/tools/get-precipitation.test.ts`
- Edit: `src/ai/index.ts` — import, register, re-export (alphabetical placement next to `getPopulationStatsTool` / `getProvinceDistributionTool`).
- Edit: `README_AI.md` — new row near `set_precipitation` and `get_geography`.
- New: `aiplans/plan_282.md`, `aiplans/tasks_282.md`.

## Tests (verify the use case)
Unit tests using a fake runtime cover:
- Returns `{ ok: true, value: <num> }` for a non-null snapshot.
- Passes `null` through unchanged.
- Ignores unexpected input arguments.
- Tool metadata: `name === "get_precipitation"`, empty `input_schema.properties`, no `required`.

Integration tests for `defaultPrecipitationReadRuntime` cover (using `globalThis` swaps):
- Reads from `globalThis.options.prec` when present.
- Falls back to DOM `precOutput` value when options is missing.
- Falls back to DOM `precInput` when options + `precOutput` missing.
- Falls back to `localStorage.prec` when options + DOM are missing.
- Returns `null` when no source is present.
- Prefers options over DOM; prefers DOM-output over DOM-input over localStorage.
- Skips non-finite options values and falls through.

The "what's the precipitation set to?" use case is covered by the metadata test (proves the tool registers with the right name and zero-arg schema, so the model can invoke it) plus the integration test that proves the default runtime returns the slider value in the live runtime.

## Non-goals
- Does not validate the observed value against `[PRECIPITATION_MIN, PRECIPITATION_MAX]` — reports what the UI actually has (consistent with `get_generator_rates`).
- Does not mutate state.
- Does not read other Options/World-Configurator fields — `get_climate` and `get_geography` cover those.

## Review
The tasks (read references, write tool with three-tier resolution, write unit + integration tests, register on the registry barrel, document in README) directly produce the file deliverables this plan requires; the plan answers the use case because the tool is registered with the canonical `get_precipitation` name and zero-arg schema (so the model can invoke it from "what's the precipitation set to?") and returns a finite-or-null number from the same DOM/localStorage surface `set_precipitation` writes to. The proposed integration tests prove the resolution chain works against `globalThis`-swapped fakes that mimic the real `window.options` / DOM / `localStorage` surface, so they verify the question-answer path end-to-end. No gaps identified.
