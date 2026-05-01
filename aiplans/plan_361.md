# Plan 361 — `set_cell_religion` AI chat tool

## Use case

Add an AI chat tool `set_cell_religion` that overrides the religion
assignment of a single cell — the missing per-cell religion setter.
Mirrors the per-cell write inside the legacy
`applyReligionsManualAssignent` function in
`public/modules/dynamic/editors/religions-editor.js` (lines 728–742):

```js
function applyReligionsManualAssignent() {
  const changed = relig.select("#temp").selectAll("polygon");
  changed.each(function () {
    const i = +this.dataset.cell;
    const r = +this.dataset.religion;
    pack.cells.religion[i] = r;
  });

  if (changed.size()) {
    drawReligions();
    refreshReligionsEditor();
    drawReligionCenters();
  }
  exitReligionsManualAssignment();
}
```

The user can already trigger this via the Religions Editor's "Manual"
mode (paints religions by dragging a brush over cells). The AI cannot
per-cell. We have peers `set_cell_height`, `set_cell_biome` (plan 359),
and `set_cell_culture` (plan 360, dispatched in parallel) but no
per-cell religion setter.

We already ship the religion family: `add_religion`, `remove_religion`,
`rename_religion`, `set_religion_color`, `set_religion_type`,
`set_religion_form`, `set_religion_culture`, `set_religion_deity`,
`set_religion_expansion`, `set_religion_origins`,
`set_religion_center`, `find_religions_*`, `get_religion_info`,
`list_religions`, `recalculate_religions` (plan 335 — bulk recalc).
This plan adds the missing **per-cell religion** setter — an atomic
primitive for fine-grained AI edits, peer to `set_cell_biome` /
`set_cell_culture` / `set_cell_height`.

Note: legacy `applyReligionsManualAssignent` calls `drawReligions`,
`refreshReligionsEditor`, `drawReligionCenters` only when one or more
polygons are changed. Per the brief we keep this tool atomic — best-
effort `drawReligions()` only; we do not refresh the editor and we do
not trigger `recalculate_religions`. The caller can explicitly invoke
`recalculate_religions` if expansion needs to propagate. Documented in
Behavior §10.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 825 files in 667ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate `cell` is a non-negative integer.
2. Validate `religion` is a non-negative integer.
3. Read `pack.cells.religion` (typed array). If missing →
   `"window.pack.cells.religion is not available; the map hasn't finished loading."`.
4. Read `pack.religions` (array). If missing →
   `"window.pack.religions is not available; the map hasn't finished loading."`.
5. Validate `cell` is in `[0, pack.cells.religion.length - 1]`.
6. Validate `religion` is in `[0, pack.religions.length - 1]` (i.e.
   an existing religion id). Religion 0 is the "No religion"
   placeholder — VALID. Do NOT reject 0.
7. If `pack.religions[religion]` is missing or has `removed === true`
   → reject with
   `"Religion ${id} has been removed."`. (Religion 0 is a static
   placeholder and never `removed`.)
8. Capture `previous = pack.cells.religion[cell]` BEFORE mutation.
   Lookup `previous_religion_name` against `pack.religions[previous]?.name`
   (or `""` if missing / out of range — defensive).
9. Write `pack.cells.religion[cell] = religion` IN PLACE (typed-array
   identity preserved).
10. Best-effort: call `drawReligions()` if it exists on the global.
    Wrap in try/catch — the data mutation already succeeded so render
    failures are non-fatal. Skipped in tests by stubbing. Skip
    `recalculate_religions` and `drawReligionCenters` / editor refresh
    — keep the tool atomic; the legacy editor only does those because
    a manual-assignment session may touch many cells. Caller can chain
    a `recalculate_religions` call if needed.
11. Return summary including `previous_religion` (numeric, captured
    pre-mutation), `previous_religion_name` (looked up against
    `pack.religions[previous]?.name`, or `""`), `religion` (numeric,
    the new value), and `religion_name`
    (`pack.religions[religion]?.name`).

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "cell":     { "type": "integer", "minimum": 0, "description": "Cell index in pack.cells (0-based)." },
    "religion": { "type": "integer", "minimum": 0, "description": "Religion id (0 = No religion)." }
  },
  "required": ["cell", "religion"]
}
```

## Validation

- `cell` integer (`typeof number`, `Number.isFinite`,
  `Number.isInteger`, `>= 0`).
- `religion` integer (same checks).
- `cell` in `[0, pack.cells.religion.length - 1]`.
- `religion` in `[0, pack.religions.length - 1]` AND
  `pack.religions[religion]` exists AND `removed !== true`.
- `pack.cells.religion` exists (typed array — has numeric `length`).
- `pack.religions` exists (array).

## Errors (verbatim, consistent with `set-cell-biome.ts` peer)

- `"cell must be a non-negative integer."`
- `"religion must be a non-negative integer."`
- `"cell ${i} is out of range (max ${len-1})."`
- `"religion ${id} is not a valid religion id (max ${maxId})."`
- `"Religion ${id} has been removed."` (when found but the religion's
  `removed` flag is set, OR when the slot is empty/null but in range —
  defensive case)
- `"window.pack.cells.religion is not available; the map hasn't finished loading."`
- `"window.pack.religions is not available; the map hasn't finished loading."`
- Runtime errors propagated via `err.message`.

## Success result

```jsonc
{
  "ok": true,
  "cell": 1234,
  "previous_religion": 5,
  "previous_religion_name": "Wave Worshippers",
  "religion": 3,
  "religion_name": "Forest Druids"
}
```

When `previous_religion` is out of range of `pack.religions`, the
`previous_religion_name` is `""` (empty string) — defensive. Religion
0 ("No religion" placeholder) yields the placeholder name as it
appears in `pack.religions[0]`.

## Files

### NEW

- `src/ai/tools/set-cell-religion.ts` — implementation.
- `src/ai/tools/set-cell-religion.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — add import / re-export / registry call,
  alphabetically slotted between `setCellHeightTool` and
  `setCellsDensityTool` (`set-cell-religion` sorts after
  `set-cell-height` and before `set-cells-density`).

## Tests (Vitest)

Stub-runtime suite:

1. **happy path**: cell with religion=2 → set to religion=5; verify
   stub `setCellReligion` called with `(cell, 5)`; result body has
   `ok: true, cell, previous_religion: 2, previous_religion_name`
   (matches `pack.religions[2].name`), `religion: 5, religion_name`
   (matches `pack.religions[5].name`). Verify `pack.cells.religion[cell]
   === 5` (when the stub is wired to mutate the underlying array).
2. **religion=0 (No religion) accepted**: cell with religion=3 → set
   to religion=0; success; `setCellReligion` called with `(cell, 0)`.
3. **same-religion no-op**: cell with religion=2 → set to religion=2;
   success; `previous_religion === religion === 2`.
4. **previous_religion captured BEFORE mutation**: stub
   `setCellReligion` mutates the typed array in place; assert that the
   returned `previous_religion` is the snapshot value (the value at
   `cell` before the write) and that the array now holds the new
   value.
5. **religion_name lookup against pack.religions**: stub `getReligions`
   returns a custom religions array; assert `previous_religion_name`
   and `religion_name` come from that array's `.name` fields.
6. **previous_religion_name="" when previous out of range
   (defensive)**: stale `cellReligions[0]=99` while
   `pack.religions.length === 3`. `religion=1` (in range) → success;
   `previous_religion === 99`, `previous_religion_name === ""`.
7. **drawReligions called when present**: stub `drawReligions` is a
   `vi.fn`; assert called once after the write.
8. **drawReligions best-effort: missing → no error**: runtime's
   `drawReligions` is a no-op; tool still returns success.
9. **drawReligions best-effort: throws → no error**: runtime's
   `drawReligions` throws; tool still returns success (data already
   written).
10. **rejects missing cell**: `cell` undefined / null → error
    `"cell must be a non-negative integer."`. setCellReligion not
    called.
11. **rejects missing religion**: `religion` undefined / null → error
    `"religion must be a non-negative integer."`.
12. **rejects non-numeric cell**: `cell = "1", true, {}, NaN, ±Infinity`
    → error.
13. **rejects non-integer cell**: `cell = 1.5, 2.1` → error.
14. **rejects negative cell**: `cell = -1, -100` → error.
15. **rejects non-numeric religion**: `religion = "1", true, {}, NaN,
    +Infinity` → error.
16. **rejects non-integer religion**: `religion = 1.5` → error.
17. **rejects negative religion**: `religion = -1` → error.
18. **rejects cell out of range**: `cellReligions` length=5; cell=5 →
    error `"cell 5 is out of range (max 4)."`. Also cell=10 →
    `"cell 10 is out of range (max 4)."`.
19. **rejects religion out of range**: `religions` length=4 (ids 0..3);
    religion=4 → error `"religion 4 is not a valid religion id (max 3)."`.
    Also religion=99 → similar.
20. **rejects removed religion**: `pack.religions[2].removed = true`;
    religion=2 → error `"Religion 2 has been removed."`.
21. **rejects empty religion slot**: `pack.religions[2] = null`;
    religion=2 → error `"Religion 2 has been removed."` (defensive).
22. **missing pack.cells.religion**: stub `getCellReligions` returns
    null → error
    `"window.pack.cells.religion is not available; the map hasn't finished loading."`.
23. **missing pack.religions**: stub `getReligions` returns null →
    error `"window.pack.religions is not available; the map hasn't finished loading."`.
24. **typed-array mutation in-place**: stub `setCellReligion` writes
    into a real `Uint16Array` returned by `getCellReligions`; assert
    the same reference is preserved (no replacement) and
    `arr[cell] === religion`.
25. **runtime errors propagate**: stub `setCellReligion` throws → error
    result with the message.
26. **registry round-trip**: register `setCellReligionTool` in fresh
    `ToolRegistry`; dispatch via `registry.run("set_cell_religion",
    {cell, religion})`; verify success body.
27. **tool shape sanity**: `setCellReligionTool.name === "set_cell_religion"`;
    `input_schema.required === ["cell", "religion"]`.

Default-runtime integration suite:

28. **default runtime mutates globalThis.pack.cells.religion in place**:
    populate `globalThis.pack.cells.religion = new Uint16Array([0,1,2,3,4])`,
    `globalThis.pack.religions = [...]`. Capture the typed-array
    reference. Invoke the default-runtime tool with `cell: 2,
    religion: 4`. Assert `pack.cells.religion[2] === 4` and
    the captured reference is still `===` the current
    `pack.cells.religion` (no reassignment).
29. **previous_religion captured BEFORE mutation (default runtime)**:
    cell=2 was 2, set to 4 → returned `previous_religion: 2`,
    `religion: 4`, names looked up against the real `pack.religions`.
30. **same-religion no-op (default runtime)**: cell=2 stays 2 → both
    previous and new are 2; succeeds.
31. **religion=0 accepted (default runtime)**: cell=2 was 2, set to 0
    → success; `pack.cells.religion[2] === 0`; `religion_name` is the
    No-religion placeholder name.
32. **default runtime: missing pack.cells.religion** →
    error `/pack.cells.religion is not available/`. drawReligions not
    called.
33. **default runtime: missing pack.religions** →
    error `/pack.religions is not available/`.
34. **default runtime: removed religion rejected** —
    `pack.religions[2].removed = true`; tool with `religion: 2` →
    error `"Religion 2 has been removed."`.
35. **default runtime: drawReligions called when present** — install
    `globalThis.drawReligions = vi.fn()`; invoke tool; assert called.
36. **default runtime: drawReligions missing** — delete the global;
    tool still succeeds.
37. **default runtime: drawReligions throws** — install
    `vi.fn(() => { throw new Error("boom") })`; tool still succeeds;
    data still mutated.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — no errors.
- `npm run lint` — no warnings.

## Self-review

After drafting `tasks_361.md`, re-read both files with the following
checklist:

- [x] Typed-array IN-PLACE write tested (test 24 stub + test 28
      default-runtime — both assert the same array reference).
- [x] Religion=0 (No religion) accepted — test 2 stub + test 31
      default-runtime.
- [x] Removed religion rejected — test 20 stub + test 34
      default-runtime.
- [x] Empty/null slot rejected — test 21 stub (defensive guard).
- [x] `previous_religion` captured BEFORE mutation — test 4 stub +
      test 29 default-runtime.
- [x] `religion_name` lookup against `pack.religions` — test 5 stub;
      default-runtime tests use real `pack.religions` (tests 28/29).
- [x] Same-religion no-op — test 3 stub + test 30 default-runtime.
- [x] `previous_religion_name` defensive `""` fallback — test 6.
- [x] All "Errors (verbatim)" lines match what tests assert.
- [x] Pattern matches `set-cell-biome.ts` (runtime injection,
      `validateNonNegativeInteger` helper, in-place typed-array
      mutation, best-effort `drawReligions()`).
- [x] `recalculate_religions` skip is documented (use-case note +
      Behavior §10).
- [x] Index registration alphabetically slotted between
      `setCellHeightTool` and `setCellsDensityTool` (set-cell-religion
      > set-cell-height, < set-cells-density).
- [x] `drawReligions()` best-effort (missing/throws) tested in both
      stub (tests 7–9) and default-runtime (tests 35–37) suites.

### Corrections made during review

- Initial draft considered making the tool also call
  `drawReligionCenters()` to mirror the editor exactly. Reversed:
  centers are tied to religion-center cell pointers, NOT cell-religion
  assignments — the editor calls `drawReligionCenters` because
  manual-assignment can also touch the temp polygons that re-derive
  centers, but a single per-cell religion write does not change centers
  data. Keep the tool atomic — `drawReligions()` only.
- Initial draft only checked `religion < pack.religions.length`. Added
  the explicit `removed` and empty-slot rejections per the brief —
  even though `applyReligionsManualAssignent` itself does not check
  removed (it just writes whatever the user paints), the AI tool is a
  more deliberate primitive and rejecting reassignment to a retired
  religion id matches the validation semantics of
  `set_religion_color` / `set_religion_type` peers.
- Confirmed religion 0 is the static "No religion" placeholder
  (`pack.religions[0]`) — never `removed` and always valid. Added an
  explicit test (test 2) to avoid regression.
- Initial draft used a single `Religion` type in the runtime; switched
  to importing `RawReligion` from `_shared` to match the rest of the
  religion-tool family.
