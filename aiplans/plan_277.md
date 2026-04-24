# Plan 277 — `get_world_rates` AI tool

## Goal
Add a read-only AI tool `get_world_rates` that reports the current world-wide
population scaling values (`population_rate`, `urbanization`, `urban_density`)
as displayed in the Units Editor sliders. It is the inverse / readback analog
of `set_world_rates`.

## Shape
- No required (or optional) parameters.
- Success: `{ ok: true, populationRate, urbanization, urbanDensity }` — each
  field a number or `null` when the underlying input is missing / unparseable.
- No error branch for "missing values"; `null` communicates "not available"
  (consistent with `defaultWorldRatesRuntime.read()`'s existing contract in
  `set-world-rates.ts`, which already returns `null` when the DOM is absent or
  an input can't be parsed).

## Reuse
- Re-uses `WorldRates` type and `WorldRatesRuntime.read()` from
  `./set-world-rates.ts`. The default runtime is
  `defaultWorldRatesRuntime` — imported, not duplicated.
- The tool only consumes the `read()` half of the runtime (no `write`), so
  a narrower runtime seam (`GetWorldRatesRuntime { read(): WorldRates }`) is
  defined locally to keep the tool surface small and testable in isolation.

## File layout
- `src/ai/tools/get-world-rates.ts` — tool + factory + narrow runtime seam.
- `src/ai/tools/get-world-rates.test.ts` — unit tests (mock runtime) +
  `defaultRuntime integration` block poking `globalThis.document`. Uses
  `as unknown as { ... }` casts.
- Register `getWorldRatesTool` in `src/ai/index.ts` near `setWorldRatesTool`.
  Re-export in the public surface block.
- Add row in `README_AI.md` immediately after the `set_world_rates` row.

## Risks / edge cases
- `document` absent in test/SSR → `defaultWorldRatesRuntime.read()` already
  returns `{null, null, null}`; tool surfaces that verbatim (still `ok: true`).
- Tool must NOT mutate anything — only reads.
- Do NOT duplicate `WorldRates` / `WorldRatesRuntime` exports; import them.

## Out of scope
- Reading directly from `window.options` or `pack` (the Units Editor inputs
  are the authoritative source of truth for these three rates in the current
  UI; `set_world_rates` writes to the inputs and dispatches `change`, so
  parity with that write path is preserved by reading the same inputs).
