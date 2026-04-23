# Plan 155 — `set_biome_icons` AI tool

## Use case

Set the icon list for a biome — the set of relief icon names (e.g. `"acacia"`, `"deciduous"`, `"swamp"`) the renderer can draw inside that biome's lowland cells. Mutates `biomesData.icons[k]` in-place and calls `drawReliefIcons()` best-effort so the change is immediately visible. Companion to `set_biome_icons_density` (which controls *how many* icons are drawn) — this tool controls *which* icons.

## Runtime shape of `biomesData.icons[k]` (confirmed)

Both `src/modules/biomes.ts` (generator) and `public/modules/ui/biomes-editor.js` (editor) agree: at runtime `biomesData.icons[k]` is a **flat `string[]`** where duplicates control relative frequency.

- `Biomes.getDefault()` in `src/modules/biomes.ts` starts with a weighted dict per biome (`{acacia: 1, grass: 9}`) and then converts it to a flat array in lines ~92–101:

  ```ts
  const parsedIcons: string[][] = [];
  for (let i = 0; i < icons.length; i++) {
    const parsed: string[] = [];
    for (const icon in icons[i]) {
      for (let j = 0; j < icons[i][icon]; j++) {
        parsed.push(icon);
      }
    }
    parsedIcons[i] = parsed;
  }
  return { …, icons: parsedIcons, … };
  ```

  So the shape *returned* (and subsequently stored on `window.biomesData`) is `string[][]`, not `Array<{[name]: weight}>`.

- `public/modules/ui/biomes-editor.js` (`addCustomBiome`, line ~290) pushes `[]` — a plain `string[]`, confirming the runtime shape.

- `public/modules/io/load.js` (line ~298) pushes `[]` on load for stat-padding — same flat form.

- Downstream consumer `src/renderers/draw-relief-icons.ts` line ~55 picks a random element:

  ```ts
  const icon = getBiomeIcon(i, biomesData.icons[biome]);
  // …
  function getBiomeIcon(cellIndex: number, b: string[]): string {
    let type = b[Math.floor(Math.random() * b.length)];
    …
  }
  ```

  The parameter is typed `string[]`. Weighting is achieved by repeating entries (e.g. `["grass","grass","grass","grass","grass","grass","grass","grass","grass","acacia"]` ≈ `{grass: 9, acacia: 1}`).

- `src/ai/tools/add-biome.ts` (line ~87) pushes the caller's flat `string[]` straight into `biomesData.icons`, and its test (line 369) asserts `biomesData.icons[13]` equals `["swamp", "palm", "palm"]` — confirming the runtime contract.

**So we write `biomesData.icons[k] = [...icons]`** — a fresh flat `string[]` copy. No dict-to-array conversion is required or desired. Duplicates are preserved (they encode relative frequency).

Empty array is a valid state (editor's `addCustomBiome` initialises to `[]`, Marine/Glacier defaults are `[]`). When `iconsDensity[k] === 0` (as it is for Marine and Glacier) the renderer skips biome icons entirely (line 32 of `draw-relief-icons.ts`), so an empty `icons` array is harmless there. For a biome whose density is >0 but whose icons array is empty the renderer would pick `undefined` from a zero-length array and emit `#relief-undefined-1` (a broken href) — we don't enforce non-empty though, because pairing empty `icons` with `iconsDensity: 0` is a legitimate "disable icons for this biome" idiom the Biomes Editor itself uses.

## Tool contract

Inputs:
- `biome` (number | string, required) — numeric id (0 = Marine) or case-insensitive current name. Same ref semantics as `set_biome_icons_density` / `set_biome_cost` (delegates to `findBiomeByRef`).
- `icons` (string[], required) — list of icon names. Empty array allowed. Every entry must be a non-empty trimmed string. Duplicates preserved (they control weight).

Outputs:
```
{
  ok: true,
  i: number,
  name: string,
  previousIcons: string[],
  icons: string[]
}
```

`previousIcons` is a defensive copy of whatever was in `biomesData.icons[k]` before the write (or `[]` if the slot was missing / non-array).

## Validation / rejection rules

- `biome` not a non-negative integer or non-empty string → error.
- `icons` not an array → error.
- Any `icons` entry not a non-empty trimmed string → error.
- `biome` not found (no live slot matches the ref) → error.
- Runtime-level: `biomesData` missing or `biomesData.icons` not an array → throw → surfaced as errorResult.

No upper cap on the icons array length — the renderer handles arbitrary-sized lists (it just `Math.floor(Math.random() * b.length)` indexes in).

## Runtime-seam split (mirrors `set-biome-icons-density.ts`)

```ts
export interface BiomeIconsRef {
  i: number;
  name: string;
  previousIcons: string[];
}

export interface BiomeIconsRuntime {
  find(ref: number | string): BiomeIconsRef | null;
  apply(id: number, icons: string[]): void;
}
```

- `defaultBiomeIconsRuntime.find(ref)`:
  - Reads `globalThis.biomesData`; delegates to `findBiomeByRef`.
  - `previousIcons`: if `biomesData.icons?.[res.k]` is an array, returns `[...that]`; else `[]`.

- `defaultBiomeIconsRuntime.apply(id, icons)`:
  - Reads `biomesData`; re-resolves the slot via `findBiomeByRef`.
  - Throws if the slot or `biomesData.icons` array is missing / not-an-array.
  - Writes `biomesData.icons[res.k] = [...icons]` (fresh copy so callers can't alias-mutate).
  - Best-effort calls `globalThis.drawReliefIcons()` inside a try/catch — same pattern as `set-biome-icons-density.ts` — because the renderer re-reads `biomesData.icons[biome]` on each pass. Swallows throws so the data mutation sticks even if the renderer errors (no map loaded etc.).

## Integration test (globalThis seam)

Mimics `set-biome-icons-density.test.ts`:

- Install `globalThis.biomesData` with:
  - `i: [0,1,2,3]`, `name: ["Marine","Hot desert","removed","Savanna"]`, `icons: [[],["dune","dune","dune","cactus","cactus","cactus","cactus","cactus","cactus","deadTree"],[],["acacia","grass","grass","grass","grass","grass","grass","grass","grass","grass"]]`.
- Install `globalThis.drawReliefIcons` as `vi.fn()`.
- Cases:
  1. Update by numeric id — `biome: 1, icons: ["swamp"]` → `biomesData.icons[1] === ["swamp"]` (and is a *copy*, not the input reference), JSON result includes `previousIcons` with the 10-entry default.
  2. Update by case-insensitive name — `biome: "SAVANNA", icons: []` → `biomesData.icons[3]` is empty array, `previousIcons` is the 10-entry default.
  3. Input-copy isolation — mutate the input after the call; the biome's stored array should be unaffected.
  4. Best-effort redraw is invoked.
  5. drawReliefIcons throws → data still mutated, no tool error.
  6. Refuses to update a `removed` biome (`biome: 2`) and leaves it untouched.
  7. Errors when `biomesData` is missing entirely.

Injected-runtime unit tests (with `vi.fn<BiomeIconsRuntime["apply"]>`):
1. Dispatches id / name correctly through `find` then `apply`.
2. Empty icons array is accepted (boundary).
3. Long list (e.g. 50 entries) is accepted (no cap).
4. Rejects invalid `biome` refs (`null`, `undefined`, `-1`, `1.5`, `""`).
5. Rejects invalid `icons` (not an array, contains non-string, contains empty/whitespace string).
6. Rejects when `find` returns null (unknown biome).
7. Surfaces runtime.apply throws as errorResult.

Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

## Files touched

- `src/ai/tools/set-biome-icons.ts` (new)
- `src/ai/tools/set-biome-icons.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near `set_biome_icons_density`
- `aiplans/plan_155.md`, `aiplans/tasks_155.md` (this planning pair)
