# Plan 146 — `set_precipitation` AI tool

## Use case

Provide a dedicated AI tool that sets the **world precipitation rate slider**
from the Options dialog. This is a global generation parameter that drives
per-cell precipitation (`pack.cells.prec`) which in turn feeds river and
biome generation. The effect is passive — the value only materialises when
the user (or the AI) runs `regenerate_map`.

Existing `set_climate` already exposes `precipitation` as one of four knobs,
but a dedicated `set_precipitation` tool is useful:

- it is the most commonly-tuned single knob for "make this world wetter/drier"
  style prompts,
- it mirrors the structure of other single-value Options tools
  (`set_onload_behavior`, `set_height_exponent`),
- it returns a focused `{ ok, previousValue, value }` shape so the model can
  see what it changed from.

## UI target (verified in source)

Verified locations and values:

- `src/index.html:2619-2622` defines the precipitation row. Two paired inputs:
  - `<input id="precInput"  data-stored="prec" type="number" />` — the numeric readout
  - `<input id="precOutput" data-stored="prec" type="range" min="0" max="500" value="50" />`
- Lock icon uses `id="lock_prec"` with `data-locked="0"`.
- `public/modules/ui/options.js:608` — randomizer uses the same element:
  `precInput.value = precOutput.value = gauss(100, 40, 5, 500);`
  (default randomization centered on 100, clamped 5–500).
- `public/modules/io/save.js:64` and `public/modules/io/load.js:249`
  persist `precOutput.value` as settings[18].
- `public/modules/ui/general.js:466` — the lock handler calls
  `store(id, input.value)`, which writes to `localStorage` under the
  `data-stored` key (`"prec"`).

**There is no `window.options.prec` field.** The existing `set_climate` tool
correctly records this with `optionKey: null` for its `precipitation` field
(see `src/ai/tools/set-climate.ts:44`). The precipitation value lives only
in the DOM inputs and, when locked, in `localStorage["prec"]`. `set_precipitation`
must therefore only triple-write where the UI writes:

1. DOM `#precInput.value` (best-effort)
2. DOM `#precOutput.value` (best-effort)
3. `localStorage["prec"]`

This matches `set_climate`'s behaviour for precipitation exactly — the new
tool is a focused wrapper that additionally reports the previous value.

## Bounds

- **min**: `0` (matches `precOutput.min="0"`)
- **max**: `500` (matches `precOutput.max="500"`)
- **type**: finite integer percent (UI displays an integer readout; the tool
  accepts any finite number in range and lets the UI round as usual).

## Return shape

```
{
  ok: true,
  previousValue: number | null,   // from #precOutput, #precInput, or localStorage
  value: number                   // the applied value
}
```

Errors follow the standard `errorResult` envelope.

## Files

- `src/ai/tools/set-precipitation.ts` — tool factory, default runtime, registration export.
- `src/ai/tools/set-precipitation.test.ts` — unit tests + `defaultRuntime` integration block.
- `src/ai/index.ts` — import + register + re-export.
- `README_AI.md` — row near `set_climate` documenting the tool.

## Style

Mirror `set-climate.ts`'s runtime-seam pattern: `SetPrecipitationRuntime`
with a `read()` / `apply(value)` split, `defaultSetPrecipitationRuntime`
binding to DOM + `localStorage`, and a `createSetPrecipitationTool(runtime)`
factory. Tests use `vi.fn()` and `as unknown as { ... }` casts for globals,
matching the existing house style.
