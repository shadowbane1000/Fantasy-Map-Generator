# Plan 279 — `get_year_and_era` AI tool

## Goal
Add a read-only AI tool `get_year_and_era` that reports the current in-fiction
world date shown in the Options panel: `window.options.year`, `options.era`,
and `options.eraShort`. It is the inverse / readback analog of
`set_year_and_era`.

## Shape
- No required (or optional) parameters.
- Success: `{ ok: true, year, era, era_short }` — each field a number/string or
  `null` when the underlying options value is missing / wrong type.
- No error branch for "missing map"; `null`s communicate "not available" so the
  tool stays a pure read even in pre-load / SSR / fresh-harness states.

## Reuse
- Re-uses `WorldDateState` type and `WorldDateRuntime.read()` from
  `./set-year-and-era.ts`. The `read()` half is already wired to the same
  `window.options` shape we need, so the default runtime delegates to
  `defaultWorldDateRuntime.read()` — imported, not duplicated.
- The tool only consumes the `read()` half (no `writeYear` / `writeEra`), so a
  narrower runtime seam (`GetYearAndEraRuntime { read(): WorldDateState | null }`)
  is defined locally to keep the tool surface small and testable in isolation.
- Uses `okResult` from `_shared`. No error path beyond "document missing", which
  the shared runtime already represents as `null` state.

## File layout
- `src/ai/tools/get-year-and-era.ts` — tool + factory + narrow runtime seam.
- `src/ai/tools/get-year-and-era.test.ts` — unit tests (mock runtime) plus a
  `defaultRuntime integration` block that swaps `globalThis.window.options`.
  Uses `as unknown as { ... }` casts.
- Register `getYearAndEraTool` in `src/ai/index.ts` near `setYearAndEraTool`.
  Re-export in the public surface block.
- Add row in `README_AI.md` immediately after the `set_year_and_era` row.

## Response field naming
- Returned keys: `ok`, `year`, `era`, `era_short`. Uses snake_case (`era_short`)
  for consistency with how other read-only tools like
  `get_measurement_units` / `get_layer_visibility` surface multi-word fields,
  and mirrors the way setter inputs are described in README/tool docs.

## Risks / edge cases
- `window.options` absent in test/SSR → `defaultWorldDateRuntime.read()`
  returns `null`; tool surfaces that as `{ok, year: null, era: null, era_short: null}`
  (still `ok: true`).
- `options` present but `year` / `era` / `eraShort` missing or wrong type →
  existing `read()` narrows to `null` per-field; tool passes through.
- Tool must NOT mutate anything — only reads.
- Do NOT duplicate `WorldDateState` / `WorldDateRuntime` exports from the setter.

## Out of scope
- Reading the `#yearInput` / `#eraInput` DOM values. The setter treats
  `window.options` as the source of truth (it writes options first, then
  syncs the DOM best-effort), so parity with that write path is preserved by
  reading `window.options`.
- Deriving / normalising `eraShort` — pass through whatever `options.eraShort`
  holds.
