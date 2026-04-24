# Plan 281 — `get_generator_rates` Tool

## Goal
Add a read-only AI tool `get_generator_rates` that is the inverse of `set_generator_rates`. It reports the current value of every generator-count slider that `set_generator_rates` writes: `cultures`, `states_number`, `provinces_ratio`, `size_variety`, `growth_rate`, `manors`, `religions_number`.

## Source of truth resolution (per field)
For each `GENERATOR_FIELDS[name]`, in order:
1. `window.options[field.optionKey]` — if a finite `number`.
2. DOM: `document.getElementById(field.inputId).value` parsed as float.
3. `localStorage.getItem(field.storedKey)` parsed as float.
4. Otherwise `null`.

This mirrors `get_climate`'s field-resolution pattern.

## Design decisions
- Reuse `GENERATOR_FIELDS` from `./set-generator-rates` — do NOT duplicate the map.
- `GeneratorRatesReadRuntime` with `read(): Record<string, number | null>` allows in-memory tests to pass a fake runtime (mirroring `ClimateReadRuntime`).
- Default runtime iterates `GENERATOR_FIELDS` entries, runs the 3-tier resolution, and returns snake_case keys (since `GENERATOR_FIELDS` keys are already snake_case).
- No parameters required; unexpected input keys are ignored.
- Integer fields are emitted as-is (no forced rounding — we report what the UI actually has). Callers can assume `set_generator_rates` validation keeps things in range.

## Tool response shape
```json
{
  "ok": true,
  "cultures": 12,
  "states_number": 24,
  "provinces_ratio": 30,
  "size_variety": 0.5,
  "growth_rate": 1.0,
  "manors": 1000,
  "religions_number": 5
}
```
Each value may be `null` if no source resolved it.

## Files
- New: `src/ai/tools/get-generator-rates.ts`
- New: `src/ai/tools/get-generator-rates.test.ts`
- Edit: `src/ai/index.ts` — import, register, re-export.
- Edit: `README_AI.md` — new row next to `set_generator_rates`.
- New: `aiplans/plan_281.md`, `aiplans/tasks_281.md`.

## Non-goals
- Does not read other Options fields (map-size, urbanization, etc.).
- Does not mutate state.
- Does not validate the observed values (we report what's there).
