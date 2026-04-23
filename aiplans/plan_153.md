# Plan 153 — `add_biome` AI tool

## Use case
Create a new biome entry by extending the parallel arrays on `biomesData` — the same side-effect as clicking the "Add biome" button (`biomesAdd` → `addCustomBiome`) in the Biomes Editor. The editor appends a biome with a random colour, default habitability of 50, name "Custom", zero icons density / empty icons, and cost 50. For AI use we require the caller to pass the meaningful fields explicitly (name / color / habitability / cost) and accept optional `iconsDensity` + `icons`.

## biomesData shape (confirmed)

`window.biomesData` is the SoA (struct-of-arrays) returned by `Biomes.getDefault()` in `src/modules/biomes.ts` (and then mutated by the editor). The arrays that matter for "add biome" (`public/modules/ui/biomes-editor.js:277` — `addCustomBiome`):

```js
function addCustomBiome() {
  const b = biomesData, i = biomesData.i.length;
  if (i > 254) { /* cap */ return; }
  b.i.push(i);
  b.color.push(getRandomColor());
  b.habitability.push(50);
  b.name.push("Custom");
  b.iconsDensity.push(0);
  b.icons.push([]);
  b.cost.push(50);

  b.rural.push(0);
  b.urban.push(0);
  b.cells.push(0);
  b.area.push(0);
  // ... then appends a DOM row
}
```

So eleven arrays are extended in total. The UI-stats arrays (`rural`, `urban`, `cells`, `area`) are lazy — only populated after the Biomes Editor runs `biomesEditorAddLines` — but `addCustomBiome` eagerly extends them with `0` to keep every array length-aligned. We mirror that behaviour because `list_biomes` walks them by index (`src/ai/tools/list-biomes.ts:44`).

`biomesData.icons` in Module-default shape is `string[][]` (parsed from a weighted-object map). The editor's `addCustomBiome` pushes `[]` (an empty `string[]`). We mirror that — a flat `string[]` per biome, not the weighted-map form. The caller's `icons` input is treated as a list of icon-name strings (e.g. `["conifer", "swamp"]`).

Derived facts:
- `biomesData.i[k] === k` is an invariant the editor preserves (it uses `i = biomesData.i.length` as both the new index and the position — so the two are tied). We follow the same invariant: new biome's `i` is `biomesData.i.length` before the push.
- Cap: `biomesData.i.length > 254` aborts (max 255 biomes because cells store biome as `Uint8Array`). We surface the same 255 cap.
- "removed" sentinel tombstones: a slot whose `name === "removed"` is still indexed and still counts against the 255 cap. We don't attempt to reuse tombstoned slots — matches the editor.

## Tool contract

Inputs:
- `name` (string, required) — biome display name. Non-empty after trim. Rejected if equals "removed" (that's the deletion sentinel used by `remove_biome`).
- `color` (string, required) — CSS color (hex / rgb / hsl / named). Reuse `isValidCssColor` from `set-state-color` (same validator already used by `set_biome_color`).
- `habitability` (number, required) — integer in [0, 9999]. Same range used by `set_biome_habitability`.
- `cost` (number, required) — integer in [0, 100000]. Same range used by `set_biome_cost`.
- `iconsDensity` (number, optional, default 0) — integer in [0, 9999]; the relief-icon density multiplier. Editor default when adding a custom biome is 0.
- `icons` (string[], optional, default `[]`) — list of icon names (mirrors the **parsed** shape — flat strings — rather than the weighted-object form of `getDefault()`). Every entry must be a non-empty trimmed string; duplicates preserved (icons may legitimately repeat in the parsed array to control relative weighting).

Outputs:
```
{
  ok: true,
  i: number,
  name: string,
  color: string,
  habitability: number,
  cost: number,
  iconsDensity: number
}
```

(We intentionally don't echo `icons` — the input is already reported back implicitly by the index, and keeping the return small matches `add_zone` / `add_state` which echo only the scalar fields.)

## Validation / rejection rules

- `name` missing / non-string / empty after trim → error.
- `name === "removed"` (case-sensitive — that's the exact sentinel) → error.
- `color` missing / not a valid CSS color → error (reuses `isValidCssColor`).
- `habitability` not an integer in [0, 9999] → error.
- `cost` not an integer in [0, 100000] → error.
- `iconsDensity`, if provided, not an integer in [0, 9999] → error.
- `icons`, if provided:
  - must be an array,
  - every entry must be a non-empty trimmed string.
- Runtime-level: `biomesData` missing or lacking the required arrays → error. Hitting the 255 cap (`biomesData.i.length > 254`) → error with a clear message.

## Runtime-seam split (pattern match for `add-zone`)

```ts
export interface AddBiomeInput {
  name: string;
  color: string;
  habitability: number;
  cost: number;
  iconsDensity: number;
  icons: string[];
}

export interface NewBiome {
  i: number;
  name: string;
  color: string;
  habitability: number;
  cost: number;
  iconsDensity: number;
  icons: string[];
}

export interface AddBiomeRuntime {
  add(input: AddBiomeInput): NewBiome;
}
```

- `defaultAddBiomeRuntime.add(input)`:
  - Reads `globalThis.biomesData` via `getGlobal`.
  - Rejects if `biomesData` / `biomesData.i` / `biomesData.name` / `biomesData.color` / `biomesData.habitability` / `biomesData.cost` / `biomesData.iconsDensity` / `biomesData.icons` are missing or not arrays.
  - Computes `i = biomesData.i.length` (mirrors the editor's invariant).
  - Rejects if `i > 254` (the editor caps at 254 too; pushing one more would make length 255, which is still valid, but the editor's guard is `i > 254` BEFORE push — we replicate exactly).
  - Appends: `i` → `biomesData.i`; `name` → `name`; `color` → `color`; `habitability` → `habitability`; `iconsDensity` → `iconsDensity`; `icons` → `icons`; `cost` → `cost`. Also extends `rural` / `urban` / `cells` / `area` with `0` **when those arrays exist** (they are present after the editor has opened; we don't create them if they're missing — that would interfere with the editor's lazy init).
  - Returns the new biome data.
- The tool layer handles input validation and wraps `runtime.add` in try/catch. No redraw call — the Biomes Editor's own UI refresh is DOM-only; changes become visible on the next map render or when the editor is opened. Matches how `set_biome_cost` is data-only.

## Integration test (globalThis seam)

Mimic `add-zone.test.ts` / `remove-biome.test.ts` integration blocks:
- Install `globalThis.biomesData` with the 13 default entries (populated arrays for `i`, `name`, `color`, `habitability`, `iconsDensity`, `icons`, `cost`), plus optional `rural`/`urban`/`cells`/`area` pre-sized to 13.
- Verify:
  - minimal call (required-only) appends with `i = 13`, default `iconsDensity: 0`, default `icons: []`, values echoed in arrays.
  - second call appends at `i = 14`; arrays stay aligned in length.
  - explicit `iconsDensity` / `icons` preserved.
  - when `rural` / `urban` / `cells` / `area` arrays are present, each is extended with `0`.
  - when those stats arrays are **missing**, the add still succeeds (no synthesis).
  - errors: missing `biomesData`, missing `biomesData.i`, cap hit (`biomesData.i.length === 255`).

Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

## Files touched

- `src/ai/tools/add-biome.ts` (new)
- `src/ai/tools/add-biome.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near `remove_biome`
