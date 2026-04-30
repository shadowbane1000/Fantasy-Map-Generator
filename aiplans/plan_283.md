# Plan 283 — `get_wind` Tool

## Goal
Add a read-only AI tool `get_wind` that is the inverse of `set_wind`. It
reports the current prevailing-wind direction (degrees) for every one of
the six 30°-wide latitude bands the World Configurator's globe arrows
control. Returning the snapshot lets the assistant honestly answer
"what direction is the wind blowing in tropical latitudes?" without
guessing or regenerating.

## Why
`set_wind` already mutates `options.winds`, the matching
`#globeWindArrows path[data-tier]` transform, and `localStorage["winds"]`,
but the assistant has no way to *read* those values. Round-trip
conversations ("flip the polar wind, what was it before?", "is the
tropical_north wind easterly?") all need a readback. We follow the same
runtime-seam pattern used by `get_climate`, `get_geography`,
`get_world_rates`, `get_year_and_era`, and `get_generator_rates`.

## Source of truth resolution (per band)
For each band 0..5 (`polar_north`, `temperate_north`, `tropical_north`,
`tropical_south`, `temperate_south`, `polar_south`), in order:
1. `window.options.winds[band]` — if a finite `number`.
2. `localStorage.getItem("winds")` — comma-joined 6-tuple parsed as
   floats; band index pulled out if finite.
3. Otherwise `null`.

This mirrors `defaultSetWindRuntime.read` already in `set-wind.ts`. We
deliberately do **not** read the SVG arrow's transform attribute — that
is a derived view, not a source of truth, and parsing it back into a
direction would duplicate `set_wind`'s `parseTransformCenter` regex
without any reliability benefit.

## Design decisions
- **Reuse existing constants** from `./set-wind`: `WIND_BAND_COUNT`,
  `WIND_STORED_KEY`, `DEFAULT_WINDS`. Do NOT duplicate them.
- **Reuse band ordering**: the snapshot keys are the canonical band
  aliases in tier order — `polar_north`, `temperate_north`,
  `tropical_north`, `tropical_south`, `temperate_south`, `polar_south`.
  We define a single `WIND_BAND_NAMES` constant exported from
  `get-wind.ts` (since `set-wind.ts` only stores the alias→band map,
  not a band→canonical-name map) and reuse it in tests.
- **`WindReadRuntime`** with `read(): WindSnapshot` so tests can inject
  fakes — same shape as `GeneratorRatesReadRuntime` /
  `ClimateReadRuntime`.
- **Default runtime** iterates bands 0..5, runs the 2-tier resolution,
  returns a snake_case-keyed snapshot.
- **No parameters required**; unexpected input keys are ignored.
- **Numeric values are passed through unchanged** (no rounding); the
  UI may legitimately store fractional degrees.

## Tool response shape
```json
{
  "ok": true,
  "polar_north": 225,
  "temperate_north": 45,
  "tropical_north": 225,
  "tropical_south": 315,
  "temperate_south": 135,
  "polar_south": 315
}
```
Each value may be `null` if neither `options.winds[band]` nor
`localStorage["winds"]` resolved.

For convenience and parallelism with `set_wind`'s `directions` array,
the response also includes `directions: [d0..d5]` (same six values, in
tier order, with `null` allowed) so callers that already think in terms
of `set_wind`'s `{directions: [...]}` form get a round-trippable shape.

## Files
- New: `src/ai/tools/get-wind.ts`
- New: `src/ai/tools/get-wind.test.ts`
- Edit: `src/ai/index.ts` — import, register on registry, re-export.
- Edit: `README_AI.md` — new row next to `set_wind`.
- New: `aiplans/plan_283.md`, `aiplans/tasks_283.md`.

## Architecture
- `WindSnapshot` = `Record<BandName, number | null>`.
- `WindReadRuntime { read(): WindSnapshot }`.
- `defaultWindReadRuntime` — options → localStorage per band.
- `createGetWindTool(runtime?)` returns a `Tool`.
- `getWindTool` singleton.

Input schema: `{ type: "object", properties: {} }`. No `required`.

## Validation / edge cases
- `window.options` missing → skip step 1.
- `options.winds` not a 6-element array → skip step 1.
- Per-band value not a finite number → skip that band's step 1.
- `localStorage` undefined → skip step 2.
- Stored value missing / wrong arity / contains a non-finite entry →
  treat the whole tuple as unusable for any band that step-1 didn't
  resolve.
- Extra input keys are ignored.

## Tests
Pure / seam (via `createGetWindTool(runtimeStub)`):
- returns all six bands from a happy-path snapshot, including the
  parallel `directions` array.
- returns nulls when the runtime provides nulls.
- tolerates extra input args.
- tool metadata spot-check (name, input_schema empty).

Integration (`defaultWindReadRuntime`):
- reads from `globalThis.options.winds` when present.
- falls back to `localStorage["winds"]` when options is missing.
- returns null per band when neither source has a usable value.
- prefers options over localStorage.
- ignores non-finite option entries and falls through.
- ignores malformed localStorage tuples (wrong arity, NaN entries).

Use `as unknown as { ... }` casts when stubbing globals (consistent
with the rest of the repo).

## Baseline (captured before any edits)
- `npm run lint`: **7 warnings, 1 info, 0 errors** (Checked 664 files).
- `npm test`: **294 test files, 5076 tests passing**.

After implementing, lint must not get worse (≤ 7 warnings, no new
errors). Test-count delta should be exactly the new tests added by
`get-wind.test.ts`; all suites green.

## Verification
- `npm run lint` ≤ baseline.
- `npm run build` succeeds.
- `npm test` all pass; new suite adds the only delta.

## Out of scope
- Mutations — this tool is read-only.
- Reading the SVG arrow transform attribute (derived view).
- Reading any other Configurator knob (each gets its own tool).

## Review
The task list mirrors the established generator-rates / climate /
geography readback workflow and covers: read references, capture
baselines, write tool + tests, register in barrel, document in
README_AI.md, run gates, commit, push. The plan would let a chat
user ask "what direction is the wind blowing in tropical latitudes?"
because `get_wind` returns a snapshot keyed by the same band aliases
`set_wind` accepts (`tropical_north` / `tropical_south`) — the
assistant can name the band, look up the value, and answer in
degrees. The proposed integration tests stub `globalThis.options`
and `globalThis.localStorage` exactly the way the user-facing
runtime resolves bands, so the same code path that answers the
question in production is exercised in tests.
