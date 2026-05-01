# Plan 359 — `set_cell_biome` AI chat tool

## Use case

Add an AI chat tool `set_cell_biome` that overrides the biome
assignment of a single cell — the missing per-cell biome setter.
This mirrors the per-cell write inside the legacy
`applyBiomesChange` function in
`public/modules/ui/biomes-editor.js` (around lines 438–451):

```js
function applyBiomesChange() {
  const changed = biomes.select("#temp").selectAll("polygon");
  changed.each(function () {
    const i = +this.dataset.cell;
    const b = +this.dataset.biome;
    pack.cells.biome[i] = b;
  });

  if (changed.size()) {
    drawBiomes();
    refreshBiomesEditor();
  }
  exitBiomesCustomizationMode();
}
```

The user can already trigger this via the Biomes Editor's
"Customization" mode (paints biomes by dragging a brush over cells).
The AI cannot per-cell. We have `set_cell_height` (per-cell
`grid.cells.h[i]` setter) but no per-cell biome setter.

We already ship: `add_biome`, `remove_biome`, `rename_biome`,
`set_biome_color`, `set_biome_cost`, `set_biome_habitability`,
`set_biome_icons`, `set_biome_icons_density`, `find_cells_by_biome`,
`get_biome_distribution`, `get_biome_info`, `list_biomes`. This plan
adds the missing **per-cell biome** setter — a primitive for
fine-grained AI edits, peer to `set_cell_height`.

Note: legacy `applyBiomesChange` calls `recalculatePopulation()` IF
biome habitability differs (later in the same file). We will SKIP
that recalc to keep the tool atomic — the caller (LLM) can invoke a
follow-up tool (e.g. `regenerate_states`, or any other recalc tool
that internally re-runs population) if population needs refresh.
This keeps `set_cell_biome` a pure primitive: one cell, one biome,
one redraw. Documented in Behavior §5.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 821 files in 660ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate `cell` is a non-negative integer.
2. Validate `biome` is a non-negative integer.
3. Read `pack.cells.biome` (typed array). If missing →
   `"window.pack.cells.biome is not available; the map hasn't finished loading."`.
4. Read `biomesData.name` (string array). If missing →
   `"window.biomesData.name is not available; the map hasn't finished loading."`.
5. Validate `cell` is in `[0, pack.cells.biome.length - 1]`.
6. Validate `biome` is in `[0, biomesData.name.length - 1]` (i.e. an
   existing biome id; `biomesData.name` is indexed by biome id, ids
   are dense 0..N-1 by construction in `Biomes.getDefault` and
   `add_biome`). Note: this lets `biome=0` (Marine) and biomes whose
   name slot is the sentinel `"removed"`. We deliberately do NOT
   reject "removed" slots — callers may want to reassign cells away
   from a retired biome and may still target its slot. The biome id
   range is the only constraint.
7. Capture `previous = pack.cells.biome[cell]` BEFORE mutation.
8. Write `pack.cells.biome[cell] = biome` IN PLACE (typed-array
   identity preserved).
9. Best-effort: call `drawBiomes()` if it exists on the global. Wrap
   in try/catch — the data mutation already succeeded so render
   failures are non-fatal. Skipped in tests by stubbing.
10. **Skip `recalculatePopulation()`** — see use-case note. Atomic
    primitive only.
11. Return summary including `previous_biome` (numeric, captured
    pre-mutation), `previous_biome_name` (looked up against
    `biomesData.name[previous]`, or `""` if out of range),
    `biome` (numeric, the new value), and `biome_name`
    (`biomesData.name[biome]`).

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "cell":  { "type": "integer", "minimum": 0, "description": "Cell index in pack.cells (0-based)." },
    "biome": { "type": "integer", "minimum": 0, "description": "Biome id (index into biomesData)." }
  },
  "required": ["cell", "biome"]
}
```

## Validation

- `cell` integer (`typeof number`, `Number.isInteger`, `>= 0`).
- `biome` integer (`typeof number`, `Number.isInteger`, `>= 0`).
- `cell` in `[0, pack.cells.biome.length - 1]`.
- `biome` in `[0, biomesData.name.length - 1]`.
- `pack.cells.biome` exists (typed array — has numeric `length`).
- `biomesData.name` exists (array).

## Errors (verbatim, consistent with `set-cell-height.ts` peer)

- `"cell must be a non-negative integer."`
- `"biome must be a non-negative integer."`
- `"cell ${i} is out of range (max ${len-1})."`
- `"biome ${id} is not a valid biome id (max ${maxId})."`
- `"window.pack.cells.biome is not available; the map hasn't finished loading."`
- `"window.biomesData.name is not available; the map hasn't finished loading."`
- Runtime errors propagated via `err.message`.

## Success result

```jsonc
{
  "ok": true,
  "cell": 1234,
  "previous_biome": 5,
  "previous_biome_name": "Hot desert",
  "biome": 3,
  "biome_name": "Tropical seasonal forest"
}
```

When `previous_biome` is out of range of `biomesData.name`, the
`previous_biome_name` is `""` (empty string) — matches the
defensive behaviour in `findBiomeByRef` and sibling tools.

## Files

### NEW

- `src/ai/tools/set-cell-biome.ts` — implementation.
- `src/ai/tools/set-cell-biome.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — add import / re-export / registry call,
  alphabetically slotted near `setCellHeightTool` (before
  `setCellsDensityTool`).

## Tests (Vitest)

Stub-runtime suite:

1. **happy path**: cell 7 with biome=2 → set to biome=5; verify
   stub `setCellBiome` called with `(7, 5)`; result body has
   `ok: true, cell: 7, previous_biome: 2, previous_biome_name: "Hot desert",
   biome: 5, biome_name: "Taiga"`.
2. **same-biome no-op**: cell 7 with biome=2 → set biome=2;
   `previous_biome === biome === 2`; still succeeds; setCellBiome
   still called.
3. **previous_biome captured BEFORE mutation**: stub
   `getCellBiomes` returns a fresh array snapshot; stub
   `setCellBiome` mutates that array; assert returned
   `previous_biome` equals the pre-mutation value.
4. **biome_name lookup against biomesData.name**: stub
   `getBiomeNames` returns a custom array; assert
   `previous_biome_name` and `biome_name` come from that array.
5. **previous_biome_name "" when out of range**: stub
   `getCellBiomes` returns `[99]` (id 99 not in names);
   assert `previous_biome_name` is `""`. (defensive — should not
   normally happen but the lookup must be safe.)
6. **drawBiomes called when present**: stub `drawBiomes` is a
   `vi.fn`; assert called once after the write.
7. **drawBiomes best-effort: missing → no error**: stub
   `drawBiomes` is `undefined`; tool still returns success.
8. **drawBiomes best-effort: throws → no error**: stub
   `drawBiomes` throws; tool still returns success (data already
   written).
9. **rejects missing cell**: cell undefined / null → error
   `"cell must be a non-negative integer."`. setCellBiome not
   called.
10. **rejects missing biome**: biome undefined / null → error
    `"biome must be a non-negative integer."`. setCellBiome not
    called.
11. **rejects non-numeric cell**: cell = "1", true, {}, NaN, ±Infinity
    → error. setCellBiome not called.
12. **rejects non-integer cell**: cell = 1.5, 2.1 → error
    `"cell must be a non-negative integer."`.
13. **rejects negative cell**: cell = -1 → error.
14. **rejects non-numeric biome**: biome = "1", true, {}, NaN,
    ±Infinity → error.
15. **rejects non-integer biome**: biome = 1.5 → error.
16. **rejects negative biome**: biome = -1 → error.
17. **cell out of range**: stub `getCellBiomes` returns array of
    length 5; cell = 5, 10 → error
    `"cell ${i} is out of range (max 4)."`. setCellBiome not
    called.
18. **biome out of range**: stub `getBiomeNames` returns array of
    length 13; biome = 13, 99 → error
    `"biome ${id} is not a valid biome id (max 12)."`.
    setCellBiome not called.
19. **missing pack.cells.biome**: stub `getCellBiomes` returns
    `null` → error
    `"window.pack.cells.biome is not available; the map hasn't finished loading."`.
20. **missing biomesData.name**: stub `getBiomeNames` returns
    `null` → error
    `"window.biomesData.name is not available; the map hasn't finished loading."`.
21. **typed-array mutation in-place**: stub `setCellBiome` writes
    into a real `Uint8Array` returned by `getCellBiomes`; assert the
    same typed array reference is used (no reassignment).
22. **runtime errors propagate**: stub `setCellBiome` throws →
    error result with the message.
23. **registry round-trip**: register `setCellBiomeTool` in fresh
    `ToolRegistry`; dispatch via `registry.run("set_cell_biome",
    {cell, biome})`; verify success body.
24. **tool shape sanity**: `setCellBiomeTool.name === "set_cell_biome"`;
    `input_schema.required === ["cell", "biome"]`.

Default-runtime integration suite:

25. **default runtime reads globalThis.pack and globalThis.biomesData**:
    populate `globalThis.pack.cells.biome = new Uint8Array([0,1,2,3,4])`,
    `globalThis.biomesData.name = ["Marine","Hot desert","Cold desert",...]`,
    invoke tool with cell=2 biome=4 → `pack.cells.biome[2] === 4`;
    typed array identity preserved (capture reference before, assert
    after).
26. **previous_biome captured BEFORE mutation (default runtime)**:
    cell=2 was 2, set to 4 → returned `previous_biome: 2`,
    `biome: 4`. Matches the snapshot, not post-mutation.
27. **same-biome no-op (default runtime)**: cell=2 stays 2 → both
    previous and new are 2; succeeds.
28. **default runtime: missing pack.cells.biome** → error message.
29. **default runtime: missing biomesData.name** → error message.
30. **default runtime: drawBiomes called when present**: install
    `globalThis.drawBiomes = vi.fn()`; invoke tool; assert called.
    Cleanup in afterEach.
31. **default runtime: drawBiomes missing** → no error.
32. **default runtime: drawBiomes throws** → no error; data still
    written.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — no errors.
- `npm run lint` — no warnings.

## Self-review

After drafting `tasks_359.md`, re-read both files with the following
checklist:

- [x] Typed-array IN-PLACE write tested (test 21 stub + test 25
      default-runtime — both assert the same array reference).
- [x] `previous_biome` captured BEFORE mutation (test 3 stub +
      test 26 default-runtime).
- [x] `biome_name` lookup against `biomesData.name` tested
      (test 4 stub) plus default-runtime variant (tests 25/26 use
      a real `biomesData.name`).
- [x] Same-biome no-op tested (test 2 stub + test 27 default).
- [x] `previous_biome_name` defensive `""` fallback tested
      (test 5).
- [x] All "Errors (verbatim)" lines match what tests assert.
- [x] Pattern matches `set-cell-height.ts` (runtime injection,
      single integer-validation helper, in-place typed-array
      mutation).
- [x] `recalculatePopulation()` skip is documented (use-case note +
      Behavior §10).
- [x] Index registration alphabetically slotted between
      `setCellHeightTool` and `setCellsDensityTool`.
- [x] `drawBiomes()` best-effort (missing/throws) tested in both
      stub (tests 6–8) and default-runtime (tests 30–32) suites.

### Corrections made during review

- Initial draft considered making `set-cell-biome` reject biomes
  whose name slot is `"removed"`. Reversed: a removed slot is a
  valid id and the legacy `applyBiomesChange` does not check for it
  either; we keep the per-cell setter unconstrained on name content
  and only check id range. The other biome tools that filter
  `"removed"` (e.g. `findBiomeByRef`) do so because they accept
  *names* — name-based lookup must skip retired slots. Here the
  input is an id, so we let the caller pick any valid index.
- Initial draft used `findBiomeByRef` to resolve the biome — dropped
  because `set-cell-biome` only takes an integer id (peer
  `set_cell_height` takes a numeric height, not a "ref"). Keeps the
  interface minimal and the validation symmetric with
  `set-cell-height`.
- Initial draft considered triggering `recalculatePopulation()` to
  match the editor exactly. Reversed per use-case note: tool stays
  atomic; population recalc is the caller's responsibility through
  a separate tool.
- Initial draft put error message `"cell index ${i} is out of bounds"`
  to match `set-cell-height`. Refined to the spec verbatim form
  `"cell ${i} is out of range (max ${len-1})."` per the brief — the
  brief explicitly listed this message.
