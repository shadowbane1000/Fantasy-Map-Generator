# Plan 360 — `set_cell_culture` AI chat tool

## Use case

Add an AI chat tool `set_cell_culture` that overrides the culture
assignment of a single cell — the missing per-cell culture setter.
This mirrors the per-cell write inside the legacy
`applyCultureManualAssignent` function in
`public/modules/dynamic/editors/cultures-editor.js` (around lines
759–773):

```js
function applyCultureManualAssignent() {
  const changed = cults.select("#temp").selectAll("polygon");
  changed.each(function () {
    const i = +this.dataset.cell;
    const c = +this.dataset.culture;
    pack.cells.culture[i] = c;
    if (pack.cells.burg[i]) pack.burgs[pack.cells.burg[i]].culture = c;
  });

  if (changed.size()) {
    drawCultures();
    refreshCulturesEditor();
  }
  exitCulturesManualAssignment();
}
```

The user can already trigger this via the Cultures Editor's
"Manual" mode (paints cultures by dragging a brush over cells).
The AI cannot per-cell. We have `set_cell_height`, `set_cell_biome`
(plan 359, just merged) but no per-cell culture setter.

We already ship the culture family (`set_culture_color`,
`set_culture_type`, `set_culture_center`, `set_culture_base`,
`set_culture_origins`, `set_culture_shield`), `set_burg_culture`
(per-burg culture), and `recalculate_cultures` (plan 334 — bulk
recalc). This plan adds the missing **per-cell culture** setter — a
primitive for fine-grained AI edits, peer to `set_cell_biome` and
`set_cell_height`.

Note: writing `pack.cells.culture[i]` directly is a low-level edit;
the cell will keep that culture even after `recalculate_cultures`
runs UNLESS the cell is far from the new culture's center (in which
case `Cultures.expand` will reassign it). The tool exposes the
primitive — the caller decides whether to follow up with
`recalculate_cultures` or not.

We also deliberately SKIP the legacy editor's secondary write
(`if (pack.cells.burg[i]) pack.burgs[pack.cells.burg[i]].culture = c`).
A per-cell setter that silently mutates a sibling burg's culture
would be surprising — the caller can invoke `set_burg_culture`
explicitly if a co-located burg should follow. Keeps `set_cell_culture`
atomic. Documented in Behavior §10.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 825 files in 661ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate `cell` is a non-negative integer.
2. Validate `culture` is a non-negative integer.
3. Read `pack.cells.culture` (typed array). If missing →
   `"window.pack.cells.culture is not available; the map hasn't finished loading."`.
4. Read `pack.cultures` (array). If missing →
   `"window.pack.cultures is not available; the map hasn't finished loading."`.
5. Validate `cell` is in `[0, pack.cells.culture.length - 1]`.
6. Validate `culture` is in `[0, pack.cultures.length - 1]` (i.e.
   an existing culture id; ids are dense 0..N-1 by construction in
   `Cultures.generate` and `add_culture`). `culture=0` (Wildlands)
   is VALID and accepted — cells with culture=0 are normal for wild
   cells (uninhabited or unassigned). Do NOT reject 0.
7. After the id range check, look up `pack.cultures[culture]`. If
   the entry is missing or its `removed` flag is truthy, reject with
   `\`Culture ${culture} has been removed.\``. (Removed cultures
   keep their slot for stable ids but cannot be assigned to.)
8. Capture `previous = pack.cells.culture[cell]` BEFORE mutation.
9. Write `pack.cells.culture[cell] = culture` IN PLACE (typed-array
   identity preserved).
10. **Skip the burg co-write**: do NOT mutate
    `pack.burgs[pack.cells.burg[cell]].culture` even if the cell
    hosts a burg. Caller can invoke `set_burg_culture` explicitly.
    Atomic primitive only.
11. Best-effort: call `drawCultures()` if it exists on the global.
    Wrap in try/catch — the data mutation already succeeded so
    render failures are non-fatal. Skipped in tests by stubbing.
12. **Skip `recalculatePopulation()` and `Cultures.expand()`** —
    keep tool atomic. Caller can invoke `recalculate_cultures` to
    propagate.
13. Return summary including `previous_culture` (numeric, captured
    pre-mutation), `previous_culture_name` (looked up against
    `pack.cultures[previous].name`, or `""` if out of range / not
    present), `culture` (numeric, the new value), and
    `culture_name` (`pack.cultures[culture].name`, or `""`).

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "cell":    { "type": "integer", "minimum": 0, "description": "Cell index in pack.cells (0-based)." },
    "culture": { "type": "integer", "minimum": 0, "description": "Culture id (0 = Wildlands)." }
  },
  "required": ["cell", "culture"]
}
```

## Validation

- `cell` integer (`typeof number`, `Number.isInteger`, `>= 0`).
- `culture` integer (`typeof number`, `Number.isInteger`, `>= 0`).
- `cell` in `[0, pack.cells.culture.length - 1]`.
- `culture` in `[0, pack.cultures.length - 1]`.
- `pack.cultures[culture]` exists and is not `removed`.
- `pack.cells.culture` exists (typed array — has numeric `length`).
- `pack.cultures` exists (array).

## Errors (verbatim, consistent with `set-cell-biome.ts` peer)

- `"cell must be a non-negative integer."`
- `"culture must be a non-negative integer."`
- `"cell ${i} is out of range (max ${len-1})."`
- `"culture ${id} is not a valid culture id (max ${maxId})."`
- `"Culture ${id} has been removed."`
- `"window.pack.cells.culture is not available; the map hasn't finished loading."`
- `"window.pack.cultures is not available; the map hasn't finished loading."`
- Runtime errors propagated via `err.message`.

## Success result

```jsonc
{
  "ok": true,
  "cell": 1234,
  "previous_culture": 5,
  "previous_culture_name": "Elvish",
  "culture": 3,
  "culture_name": "Dwarvish"
}
```

When `previous_culture` is out of range of `pack.cultures` or the
slot is missing, `previous_culture_name` is `""` (empty string) —
matches the defensive behaviour in `findEntityByRef` and sibling
tools.

## Files

### NEW

- `src/ai/tools/set-cell-culture.ts` — implementation.
- `src/ai/tools/set-cell-culture.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — add import / re-export / registry call,
  alphabetically slotted IMMEDIATELY AFTER `setCellBiomeTool` and
  BEFORE `setCellHeightTool` (set-cell-biome < set-cell-culture
  < set-cell-height).

## Tests (Vitest)

Stub-runtime suite:

1. **happy path**: cell 7 with culture=2 → set to culture=5; verify
   stub `setCellCulture` called with `(7, 5)`; result body has
   `ok: true, cell: 7, previous_culture: 2, previous_culture_name: "Elvish",
   culture: 5, culture_name: "Dwarvish"`. (Use a 6-element cultures
   list: 0=Wildlands, 1=Common, 2=Elvish, 3=Orcish, 4=Halfling,
   5=Dwarvish — adjust expected names accordingly.)
2. **culture=0 (Wildlands) accepted**: cell=7 culture=0 → success;
   `culture_name === "Wildlands"`. setCellCulture called with
   `(7, 0)`. Verifies the spec carve-out vs. set-burg-culture's
   placeholder rejection.
3. **same-culture no-op**: cell=7 with culture=2 → set culture=2;
   `previous_culture === culture === 2`; still succeeds; setCellCulture
   still called.
4. **previous_culture captured BEFORE mutation**: stub
   `getCellCultures` returns a fresh typed-array snapshot; stub
   `setCellCulture` mutates that array; assert returned
   `previous_culture` equals the pre-mutation value.
5. **culture_name lookup against pack.cultures**: stub
   `getCultures` returns a custom array of `{i,name,removed?}`;
   assert `previous_culture_name` and `culture_name` come from that
   array.
6. **previous_culture_name "" when out of range**: stub
   `getCellCultures` returns `[99]` (id 99 not in cultures);
   assert `previous_culture_name` is `""`. (Defensive — should not
   normally happen but the lookup must be safe.)
7. **previous_culture_name "" when slot is undefined/null**:
   stub `getCultures` returns `[null, undefined, {i:2, name:"OK"}]`;
   set cell with previous=1 (undefined slot) → empty name; works.
8. **drawCultures called when present**: stub `drawCultures` is a
   `vi.fn`; assert called once after the write.
9. **drawCultures best-effort: missing → no error**: stub
   `drawCultures` is `undefined`; tool still returns success.
10. **drawCultures best-effort: throws → no error**: stub
    `drawCultures` throws; tool still returns success (data already
    written).
11. **rejects missing cell**: cell undefined / null → error
    `"cell must be a non-negative integer."`. setCellCulture not
    called.
12. **rejects missing culture**: culture undefined / null → error
    `"culture must be a non-negative integer."`. setCellCulture not
    called.
13. **rejects non-numeric cell**: cell = "1", true, {}, NaN, ±Infinity
    → error. setCellCulture not called.
14. **rejects non-integer cell**: cell = 1.5, 2.1 → error
    `"cell must be a non-negative integer."`.
15. **rejects negative cell**: cell = -1 → error.
16. **rejects non-numeric culture**: culture = "1", true, {}, NaN,
    ±Infinity → error.
17. **rejects non-integer culture**: culture = 1.5 → error.
18. **rejects negative culture**: culture = -1 → error.
19. **cell out of range**: stub `getCellCultures` returns array of
    length 5; cell = 5, 10 → error
    `"cell ${i} is out of range (max 4)."`. setCellCulture not
    called.
20. **culture out of range**: stub `getCultures` returns array of
    length 6; culture = 6, 99 → error
    `"culture ${id} is not a valid culture id (max 5)."`.
    setCellCulture not called.
21. **removed culture rejected**: stub `getCultures` returns array
    where `cultures[3].removed === true`; culture=3 → error
    `"Culture 3 has been removed."`. setCellCulture not called.
22. **missing pack.cells.culture**: stub `getCellCultures` returns
    `null` → error
    `"window.pack.cells.culture is not available; the map hasn't finished loading."`.
23. **missing pack.cultures**: stub `getCultures` returns
    `null` → error
    `"window.pack.cultures is not available; the map hasn't finished loading."`.
24. **typed-array mutation in-place**: stub `setCellCulture` writes
    into a real `Uint8Array` returned by `getCellCultures`; assert
    the same typed array reference is used (no reassignment).
25. **runtime errors propagate**: stub `setCellCulture` throws →
    error result with the message.
26. **registry round-trip**: register `setCellCultureTool` in fresh
    `ToolRegistry`; dispatch via `registry.run("set_cell_culture",
    {cell, culture})`; verify success body.
27. **tool shape sanity**: `setCellCultureTool.name === "set_cell_culture"`;
    `input_schema.required === ["cell", "culture"]`.

Default-runtime integration suite:

28. **default runtime reads globalThis.pack**: populate
    `globalThis.pack.cells.culture = new Uint8Array([0,1,2,3,4])`,
    `globalThis.pack.cultures = [{i:0,name:"Wildlands"},...]`,
    invoke tool with cell=2 culture=4 → `pack.cells.culture[2] === 4`;
    typed array identity preserved (capture reference before, assert
    after).
29. **previous_culture captured BEFORE mutation (default runtime)**:
    cell=2 was 2, set to 4 → returned `previous_culture: 2`,
    `culture: 4`. Matches the snapshot, not post-mutation.
30. **same-culture no-op (default runtime)**: cell=2 stays 2 → both
    previous and new are 2; succeeds.
31. **culture=0 accepted (default runtime)**: cell=2 set to culture=0
    → success; `culture_name === "Wildlands"`.
32. **default runtime: missing pack.cells.culture** → error message.
33. **default runtime: missing pack.cultures** → error message.
34. **default runtime: removed culture rejected** — set
    `pack.cultures[3].removed = true`; invoke with culture=3 →
    error `"Culture 3 has been removed."`. Cells array NOT mutated.
35. **default runtime: drawCultures called when present**: install
    `globalThis.drawCultures = vi.fn()`; invoke tool; assert called.
    Cleanup in afterEach.
36. **default runtime: drawCultures missing** → no error.
37. **default runtime: drawCultures throws** → no error; data still
    written.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — no errors.
- `npm run lint` — no warnings.

## Self-review

After drafting `tasks_360.md`, re-read both files with the following
checklist:

- [x] Typed-array IN-PLACE write tested (test 24 stub + test 28
      default-runtime — both assert the same array reference).
- [x] `culture=0` (Wildlands) accepted in BOTH stub (test 2) AND
      default-runtime (test 31). Spec carve-out vs. set-burg-culture's
      placeholder rejection.
- [x] Removed culture rejected in BOTH stub (test 21) AND default-
      runtime (test 34). Cells array left untouched in both cases.
- [x] `previous_culture` captured BEFORE mutation (test 4 stub +
      test 29 default-runtime).
- [x] `culture_name` lookup against `pack.cultures` tested
      (test 5 stub) plus default-runtime variant (tests 28/29 use
      a real cultures list).
- [x] Same-culture no-op tested (test 3 stub + test 30 default).
- [x] `previous_culture_name` defensive `""` fallback tested
      (tests 6 + 7).
- [x] All "Errors (verbatim)" lines match what tests assert.
- [x] Pattern matches `set-cell-biome.ts` (runtime injection,
      single integer-validation helper, in-place typed-array
      mutation, best-effort draw).
- [x] Atomic-primitive note: NO burg co-write (use-case note +
      Behavior §10), NO `recalculatePopulation()` /
      `Cultures.expand()` (Behavior §12).
- [x] Index registration alphabetically slotted between
      `setCellBiomeTool` and `setCellHeightTool`
      (set-cell-biome < set-cell-culture < set-cell-height).
- [x] `drawCultures()` best-effort (missing/throws) tested in both
      stub (tests 8–10) and default-runtime (tests 35–37) suites.

### Corrections made during review

- Initial draft considered following the legacy editor's secondary
  write (`pack.burgs[pack.cells.burg[i]].culture = c`). Reversed:
  silently mutating a sibling burg from a per-cell setter is a
  surprise side-effect; we keep the primitive narrow. Caller can
  invoke `set_burg_culture` explicitly. Documented in use-case +
  Behavior §10.
- Initial draft considered allowing `pack.cultures[culture]` to be
  removed (matching `set-cell-biome`'s permissive name-slot policy).
  Reversed: cultures are not just label slots — a removed culture
  means the entity is decommissioned and no cell should be assigned
  to it. The brief explicitly requires the rejection. Test 21 and
  test 34 cover both stub and default-runtime paths.
- Initial draft considered rejecting `culture=0` to match
  `set-burg-culture`'s rejection of `burg=0` (placeholder). Reversed:
  `culture=0` is the Wildlands culture, used legitimately for
  uninhabited / wild cells. The legacy `applyCultureManualAssignent`
  has no such check. Tests 2 and 31 explicitly cover this carve-out.
- Initial draft considered `previous_culture_name` lookup that
  would crash when the previous slot is `null`/`undefined`
  (e.g. mid-mutation by another tool). Hardened the lookup to use
  `pack.cultures[previous]?.name ?? ""`. Test 7 covers this.
- Initial draft used `findEntityByRef` to resolve the culture —
  dropped because `set-cell-culture` only takes an integer id (peer
  `set_cell_biome` takes integer biome id, not a "ref"). Keeps the
  interface minimal and the validation symmetric.
