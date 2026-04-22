# Plan 62 — set_biome_color AI tool

## Use case

The Biomes Editor color swatch (`biomeChangeColor` in
`public/modules/ui/biomes-editor.js:182`) writes
`biomesData.color[i] = newFill` and updates the `#biome{i}` SVG
element's `fill` + `stroke` attributes to refresh the overlay.

The chat has `list_biomes` (reads) and `rename_biome` (writes
name) but no way to recolour. A prompt like "make Hot desert
#ff9933" or "match the grassland colour to the culture palette"
has no AI path.

## Scope

Add one tool: `set_biome_color(biome, color)`.

- `biome` required — numeric biome id (0 = Marine is valid) OR
  case-insensitive current name; resolved via the `findBiomeByRef`
  helper added for `rename_biome`.
- `color` required — any CSS color (same `isValidCssColor`
  validation used by state/culture/religion/province/zone color
  tools).
- Writes `biomesData.color[k] = color` and updates the
  `#biome{id}` SVG element's `fill` + `stroke` attributes (matching
  the editor's own callback).
- Refuses to recolour biomes whose name slot is `"removed"` (the
  Biomes Editor's deletion sentinel) — same hygiene
  `rename_biome` enforces.

## Implementation

1. **New file `src/ai/tools/set-biome-color.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult`;
     `isValidCssColor` from `./set-state-color`;
     `findBiomeByRef` from `./rename-biome`.
   - `BiomeColorRef { i, name, previousColor }`.
   - `BiomeColorRuntime { find(ref), applyColor(id, color) }`.
   - `defaultBiomeColorRuntime.find`: `findBiomeByRef` → shape with
     `previousColor: biomesData.color[k] ?? null`.
   - `defaultBiomeColorRuntime.applyColor(id, color)`:
     - re-resolve via `findBiomeByRef`; throw if null.
     - Write `biomesData.color[k] = color`.
     - If `document` present: `#biome{id}` setAttribute fill + stroke.
   - Tool schema: `biome` (int|string required), `color` (string
     required).
   - Execute: validate biome ref (non-negative int OR non-empty
     string); `isValidCssColor(color)`; run `find` → 404; try
     `applyColor`; respond.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-biome-color.test.ts`**:
   - Runtime-injected:
     - Recolor by id.
     - Recolor by case-insensitive name.
     - Reject invalid biome ref (null, -1, 1.5, "").
     - Reject invalid colors (loop over bad strings / non-string).
     - Accept every canonical color form (smoke-test hex, rgb(),
       hsl(), named).
     - Error when biome unknown.
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.biomesData` with 4 biomes (including one
       "removed").
     - Stub `globalThis.document` with a `#biome1` fake element
       (setAttribute spy).
     - Recolor biome 1 → `biomesData.color[1]` updated +
       setAttribute("fill", "#ff9933") + setAttribute("stroke",
       "#ff9933").
     - Recoloring a removed biome → error, no mutation.
     - Missing SVG element → tool still succeeds (soft fail).

4. **README_AI.md** — new row under `rename_biome`.

## Verification

- `npm test -- --run src/ai/tools/set-biome-color` green.
- `npm test -- --run` — 770 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can issue `set_biome_color({ biome: "Hot desert", color:
  "#ff9933" })` and both the data + the overlay reflect the
  change.
- Removed biomes are protected.
- Consistent with `rename_biome`'s ref semantics.
