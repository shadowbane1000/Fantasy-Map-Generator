# Plan 11 — Use Case: Set the world's year and era

## Status

Iteration 11. Existing tools: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`,
`list_states`, `rename_state`, `focus_on_map`, `list_burgs`,
`rename_burg`. Baseline 7 warnings / 1 info / 0 errors. 155 tests
pass.

## Use Case

**"Change the world's in-fiction year and/or era."**

The user does this in the Options panel under "Year and era"
(`#yearInput`, `#eraInput`). Changing either triggers the global
`changeYear()` / `changeEra()` handlers in
`public/modules/ui/options.js:684-697`, which write to
`window.options.year` / `window.options.era`.

`window.options.eraShort` is the uppercase-initials abbreviation of
`era` ("Bright Era" → "BE"), derived at init and on era regenerate
(`public/modules/ui/options.js:669-672, 678-681`). The editor doesn't
update it from `changeEra` directly, but `eraShort` is consumed in
several exports (`SVG`, `JSON`), so our tool should keep it in sync
when the era text changes — matches user expectation "set the era".

Prompts:
- *"Set the year to 1247"*
- *"Change the era to 'Second Age'"*
- *"Set the date to 1247 Bright Era"*

### Success criteria

1. `set_year_and_era({year: 1247})` sets `window.options.year = 1247`
   and updates `#yearInput.value` to `"1247"`. Leaves era untouched.
2. `set_year_and_era({era: "Second Age"})` sets
   `window.options.era = "Second Age"` and
   `window.options.eraShort = "SA"`, updates `#eraInput.value`. Leaves
   year untouched.
3. Both args together update both + eraShort.
4. At least one of `year`/`era` must be provided — otherwise error.
5. `year` must be an integer (or an all-digits string the tool will
   parse). Non-integer / non-finite / NaN → error.
6. `era` must be a non-empty trimmed string. Whitespace-only → error.
7. Pre-load (no `window.options`) → structured error.

## Scope

In-scope:
- Tool `set_year_and_era` with `WorldDateRuntime` seam.
- Registry + README.
- Unit tests.

Out-of-scope:
- Changing `eraShort` directly (derived; user-facing UI doesn't let
  you set it independently).
- Year/era regeneration (`regenerateEra` button) — could be a future
  tool.

## Design

New file: `src/ai/tools/set-year-and-era.ts`.

```ts
export interface WorldDateState { year: number | null; era: string | null; eraShort: string | null; }
export interface WorldDateRuntime {
  read(): WorldDateState | null;
  writeYear(year: number): void;
  writeEra(era: string, eraShort: string): void;
}
```

`eraShort` derivation: `era.split(/\s+/).filter(Boolean).map(w =>
w[0].toUpperCase()).join("")`. Same algorithm as
`public/modules/ui/options.js:669-672`, guarded against empty strings.

Default runtime:
- `read()`: returns `{year, era, eraShort}` from `window.options` or
  null if `window.options` missing.
- `writeYear(y)`: sets `window.options.year = y`; sets
  `#yearInput.value = String(y)` if the element exists.
- `writeEra(era, short)`: sets `window.options.era = era`;
  `window.options.eraShort = short`; sets `#eraInput.value = era` if
  present.

Executor:
1. Validates inputs (see success criteria 4–6).
2. Calls `runtime.read()`. If null → error.
3. Applies `writeYear` / `writeEra` as appropriate.
4. Returns `{ok, previous, current}` where both show the year/era/eraShort
   triple.

## Files

Create: `plan_11.md`, `tasks_11.md`,
`src/ai/tools/set-year-and-era.ts`,
`src/ai/tools/set-year-and-era.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing plan

Unit (`set-year-and-era.test.ts`):

1. Sets year only — runtime.writeYear called, writeEra not called.
2. Sets era only — runtime.writeEra called with correct eraShort
   ("Second Age" → "SA"). writeYear not called.
3. Sets both — both writes called.
4. No fields → `{isError: true}`, no writes.
5. `year: "1247"` → accepted as integer (coerced).
6. `year: 12.5` / `year: "abc"` / `year: NaN` / `year: null` → errors.
7. `era: ""` / `era: "   "` / `era: 42` → errors.
8. Runtime.read returns null → error.
9. eraShort derivation handles single-word ("Modern" → "M") and
   multi-word with punctuation ("The Age of Gold" → "TAOG").

Plus pure helper tests: `deriveEraShort(era: string)` exported for
direct coverage.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 year only | executor | 1 |
| #2 era only + eraShort | executor + deriveEraShort | 2, 9 |
| #3 both | executor | 3 |
| #4 require one | executor guard | 4 |
| #5/6 coercion/validation | executor guards | 5, 6, 7 |
| #7 no options | runtime.read null | 8 |

Lint / test / build gates in tasks_11.md.
