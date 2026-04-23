# Plan 200 — `list_style_presets` AI tool

## Goal

Add a read-only AI tool `list_style_presets` that lists the style preset
identifiers accepted by `set_style_preset`. This is the discovery companion to
`set_style_preset`, letting the assistant enumerate themes before switching.

## Motivation

`set_style_preset` hard-codes a closed set of 12 built-in themes (plus any
custom `fmgStyle_*` entries a user has saved into `localStorage`). The Options
panel's Style Preset selector populates its `<option>` list the same way — the
legacy code lives in `public/modules/ui/style-presets.js`:

```js
const systemPresets = [
  "default", "ancient", "gloom", "pale", "light",
  "watercolor", "clean", "atlas", "darkSeas",
  "cyberpunk", "night", "monochrome"
];
const customPresetPrefix = "fmgStyle_";
// <select> is built from systemPresets + localStorage keys starting with fmgStyle_
```

Without a discovery tool the AI would have to memorise that list or risk a
stale request. Mirroring the structure of `list_heightmap_templates` (plan
199) keeps the pattern consistent.

## Data sources

1. **Built-in presets** — reuse the `STYLE_PRESETS` constant already exported
   from `src/ai/tools/set-style-preset.ts`. It intentionally matches the
   `systemPresets` array in `public/modules/ui/style-presets.js`. We must NOT
   duplicate the constant (per the task's "Do NOT duplicate-export shared
   constants" rule).
2. **Custom presets** — scan `localStorage` keys for the `fmgStyle_` prefix.
   The display name is the key with the prefix stripped (same transform the
   legacy UI does: `styleName.replace(customPresetPrefix, "")`).

`localStorage` is available in the browser runtime. When running under Node
(unit tests), we gate access through a runtime seam so tests can stub it.

## Output shape

```
{
  ok: true,
  presets: [
    { id: "default", name: "default", builtin: true },
    …
    { id: "fmgStyle_my_theme", name: "my_theme", builtin: false }
  ],
  count: 13
}
```

- `id` — the exact string `set_style_preset` expects (case-insensitive on
  built-ins; exact on custom).
- `name` — human label (same as `id` for built-ins; prefix-stripped for
  custom).
- `builtin` — `true` for the 12 system presets, `false` for `fmgStyle_*`.
- Order: built-ins first in their canonical order (matches `STYLE_PRESETS`
  and the `<select>` order), then custom presets sorted by id ascending
  (stable, matches `Object.keys(localStorage).filter(...)` behaviour closely
  enough — we explicitly sort to be deterministic across browsers).

## Runtime seam

```ts
export interface StylePresetListRuntime {
  readCustomPresetIds(): string[];
}
```

`defaultStylePresetListRuntime.readCustomPresetIds()` reads
`globalThis.localStorage` keys starting with `fmgStyle_`, returning `[]` when
`localStorage` is absent or throws (Safari private mode, Node tests without a
shim, etc.). Tests override the runtime directly; an integration block
stubs `globalThis.localStorage` with a minimal mock that satisfies the three
methods we touch (`length`, `key(i)`, nothing more — we only read keys).

## Registration

- Create `src/ai/tools/list-style-presets.ts` following the
  `list-heightmap-templates.ts` pattern.
- Create `src/ai/tools/list-style-presets.test.ts` with a
  `defaultStylePresetListRuntime (integration)` describe block that stubs
  `globalThis.localStorage`.
- Register `listStylePresetsTool` in `src/ai/index.ts` near
  `setStylePresetTool`; re-export the create-fn, tool, runtime type, and
  default runtime (mirroring `list-heightmap-templates`).
- Do NOT duplicate-export `STYLE_PRESETS` — it's already exported from
  `set-style-preset`.
- Add a README_AI.md row right after `set_style_preset` (line 27).

## Tests

Unit tests (no globals touched):

- returns the 12 built-in presets in canonical order when no custom presets
- appends custom presets sorted by id
- marks `builtin` correctly
- returns `count` matching `presets.length`
- no-params input (`{}`, `null`, `undefined`) all work
- ignores `fmgStyle_` entries whose value is an empty / non-string key (edge
  case — defensive)
- runtime that throws is treated as "no custom presets"

Integration block:

- stubs `globalThis.localStorage` with three entries (`fmgStyle_alpha`,
  `fmgStyle_beta`, `unrelated_key`), asserts only the two `fmgStyle_*`
  entries appear and `unrelated_key` does not
- removes the stub after each test to avoid cross-test pollution

## Non-goals

- Reading the JSON body of custom presets — listing only.
- Validating that a custom preset's JSON is well-formed (legacy code's job
  when applied).
- Exposing anything about the system preset JSON (base URL, version, …).
