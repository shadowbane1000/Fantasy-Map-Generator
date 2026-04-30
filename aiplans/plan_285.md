# Plan 285: `get_height_exponent` AI chat tool

## Use case

Add a read-side AI chat tool, `get_height_exponent`, that reports the
current value of the Options dialog's "Exponent" slider — i.e. the
height-exponent setting which controls altitude-change sharpness on the
next `regenerate_map`. It is the inverse of the existing
`set_height_exponent` tool.

This lets users (and the assistant) confirm a `set_height_exponent`
change took effect, diff before/after, or summarise the current Options
panel state alongside `get_generator_rates`, `get_geography`, etc.

Read-only — never mutates `window.options`, the DOM, or `localStorage`.
Takes no parameters.

## Read sources & resolution order

`set_height_exponent` writes to two places (the UI's own pair):

1. `document.getElementById("heightExponentInput").value` (DOM input)
2. `localStorage.setItem("heightExponent", value)` (persisted)

It does **not** populate `window.options.heightExponent` — the legacy
units-editor stores the value only in DOM + localStorage. To stay
forward-compatible with `get_generator_rates` (which checks
`window.options` first) and to surface a value if any future code path
mirrors it onto `window.options`, the getter checks all three sources
in this order:

1. `window.options.heightExponent` — if a finite number, return it.
2. The paired Input DOM element (`#heightExponentInput`) — parse
   `el.value` as a float; return if finite.
3. `localStorage.getItem("heightExponent")` — parse as a float; return
   if finite.

If none yield a usable number, return `null`.

The keys/ids are exported from `set-height-exponent.ts` as
`HEIGHT_EXPONENT_OPTION_KEY`, `HEIGHT_EXPONENT_INPUT_ID`, and
`HEIGHT_EXPONENT_STORED_KEY` so the setter and getter cannot drift.

## Return shape

```
{ ok: true, value: number | null }
```

A single `value` field (number or `null`) — the height-exponent setting
is a scalar, so the simplest matching shape is preferred over the
multi-field `{cultures, states_number, …}` shape used by
`get_generator_rates`.

## Files

- `src/ai/tools/set-height-exponent.ts` — refactor: export
  `HEIGHT_EXPONENT_OPTION_KEY`, `HEIGHT_EXPONENT_INPUT_ID`,
  `HEIGHT_EXPONENT_STORED_KEY`, `MIN_EXPONENT`, `MAX_EXPONENT`. The
  runtime continues to use these constants so behaviour is unchanged.
- `src/ai/tools/get-height-exponent.ts` — new tool, modelled after
  `get-generator-rates.ts` (single-field variant).
- `src/ai/tools/get-height-exponent.test.ts` — new tests (see below).
- `src/ai/index.ts` — alphabetical import, barrel re-export, registry
  registration.
- `README_AI.md` — add a new table row for `get_height_exponent` next to
  `set_height_exponent`, mirroring the prose style of `get_geography`
  and `get_generator_rates`.

## Test strategy

Mirror `get-generator-rates.test.ts`:

- Tool-level (with a fake runtime):
  - returns `{ ok, value }` with the runtime's number.
  - passes `null` through unchanged.
  - ignores extra input arguments.
  - tool metadata: name `get_height_exponent`, schema is `object` with
    empty properties and no `required` array.
- `defaultHeightExponentReadRuntime` integration (with `globalThis`
  patched):
  - reads from `globalThis.options.heightExponent` when present.
  - falls back to the `#heightExponentInput` DOM element value.
  - falls back to `localStorage.getItem("heightExponent")`.
  - returns `null` when no source has a usable value.
  - prefers options over DOM, DOM over localStorage.
  - ignores non-finite option values (e.g. `NaN`) and falls through.
