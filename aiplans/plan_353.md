# Plan 353 — `set_area_unit` AI chat tool

## Use case

Add an AI chat tool `set_area_unit` that updates the displayed area unit
(the value of `<input id="areaUnit">` in the units editor). The tool
accepts either:

- `"square"` — the special "derive from distance unit" mode that
  legacy callers expand into `<distanceUnit> + "²"` (e.g. `mi²`,
  `km²`); or
- any literal label like `"ha"`, `"acre"`, `"km²"`, `"sq mi"`.

Today the user can type into `<input id="areaUnit">` directly via the
units editor; the AI cannot.

### Legacy reads of `areaUnit.value`

```js
// public/modules/ui/zones-editor.js:383
const unit = areaUnit.value === "square" ? distanceUnitInput.value + "2" : areaUnit.value;
// public/modules/ui/provinces-editor.js:1087
const unit = areaUnit.value === "square" ? distanceUnitInput.value + "2" : areaUnit.value;
// public/modules/ui/biomes-editor.js:331
const unit = areaUnit.value === "square" ? distanceUnitInput.value + "2" : areaUnit.value;
// public/modules/io/save.js:48 — value persisted to the .map file
// public/modules/dynamic/export-json.js:91 — value exported in JSON
```

### Reset reference (units-editor.js)

```js
// public/modules/ui/units-editor.js:99-103
areaUnit.value = "square";
localStorage.removeItem("distanceUnit");
localStorage.removeItem("heightUnit");
localStorage.removeItem("temperatureScale");
localStorage.removeItem("areaUnit");
```

`restoreDefaultUnits` writes the DOM value and **removes** the
`localStorage["areaUnit"]` entry, which confirms two things:

1. `<input id="areaUnit">` is the source-of-truth surface — every
   editor reads `areaUnit.value`.
2. `localStorage["areaUnit"]` is the persistence layer the UI normally
   touches via the change-handler (`storeValueIfRequired` in
   `public/modules/ui/options.js:105` — fires on `change` events
   bubbling out of `byId("options")`/`byId("dialogs")` for any input
   carrying `data-stored`). The `<input id="areaUnit">` element in
   `src/index.html:5272` has `data-stored="areaUnit"`.

Because we write directly to `el.value` (not via a `change` event),
that auto-persistence will not fire for our setter. We therefore
explicitly call `localStorage.setItem("areaUnit", unit)` ourselves, on
a best-effort basis — same approach as `set_measurement_units`
(`src/ai/tools/set-measurement-units.ts:112-114`).

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 809 files in 660ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate that `unit` is a string and non-empty after `.trim()`.
2. `"square"` is a recognized special label — it tells legacy
   readers to render `distanceUnit + "²"`. We do not transform the
   string when storing it; we pass it through verbatim and report the
   `interpreted_label` in the success result.
3. Capture `previous = runtime.getAreaUnit()` **before** mutation.
4. `runtime.setAreaUnit(unit)` writes
   `document.getElementById("areaUnit").value = unit`.
5. `runtime.persist("areaUnit", unit)` is best-effort:
   - If `localStorage` is unavailable (SSR / restricted env), silently
     do nothing.
   - If `localStorage.setItem` throws (e.g. `QuotaExceededError`),
     swallow the error.
6. `runtime.getDistanceUnit()` is consulted only to compute
   `interpreted_label` when `unit === "square"`. If the distance unit
   element is missing, fall back to `null` and emit `interpreted_label
   = "²"` (degenerate but reflects what legacy code would render —
   `"" + "2"`).

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "unit": {
      "type": "string",
      "description": "Area unit label. Use 'square' for distance²-derived display (e.g. mi² / km²); otherwise any literal label like 'ha', 'acre', 'km²', 'sq mi'."
    }
  },
  "required": ["unit"]
}
```

## Validation

- `unit` is required.
- `unit` must be a string.
- `unit` must be non-empty after `.trim()`.
- No upper bound on label length — UI accepts any string.
- The `#areaUnit` DOM element must exist when we try to write.

## Errors (verbatim)

- `"unit must be a non-empty string."`
- `"#areaUnit input is not available; the units editor is not in the DOM."`
- Runtime errors are propagated as their `.message`.

## Success result

```jsonc
{
  "ok": true,
  "previous": "square",
  "unit": "ha",
  "interpreted_label": "ha"
}
```

When `unit === "square"`, `interpreted_label` is computed as
`<distanceUnit> + "²"` (e.g. `"km²"` if the distance input is `"km"`).
Otherwise `interpreted_label` equals `unit` verbatim.

## Files

### NEW

- `src/ai/tools/set-area-unit.ts` — the tool.
- `src/ai/tools/set-area-unit.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — import (alphabetically before
  `set-biome-color`), re-export, register. Insertion site for the
  registration is right next to `setMeasurementUnitsTool`.

## Tests (Vitest)

1. happy path: `previous = "square"`; set to `"ha"` →
   - DOM `#areaUnit` value is `"ha"`,
   - result `previous === "square"`,
   - `interpreted_label === "ha"`.
2. happy path: set to `"square"` —
   - DOM value is `"square"`,
   - `interpreted_label === "km²"` when distance unit is `"km"`.
3. empty `unit` → error `"unit must be a non-empty string."`.
4. whitespace-only `unit` → same error.
5. missing `unit` → same error.
6. non-string `unit` (number, `null`, object) → same error.
7. missing `#areaUnit` DOM element → error
   `"#areaUnit input is not available; the units editor is not in the DOM."`.
8. `localStorage.setItem` is called with `("areaUnit", unit)`.
9. `localStorage` absent → no error (best-effort).
10. `localStorage.setItem` throws (e.g. quota) → no error.
11. registry round-trip — `buildDefaultRegistry()` lists
    `set_area_unit`.
12. default-runtime integration with a fake `document` that has the
    input element.
13. `previous` captured BEFORE mutation — verify `previous` ≠ new
    value when both are recorded by mocking `getAreaUnit`/`setAreaUnit`
    to track call order.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

All must pass.

## Self-review

After drafting `tasks_353.md`, re-read both this plan and the tasks
file with the following checklist:

- [x] `"square"` special-case is documented in plan and covered by a
      dedicated test (test 2).
- [x] DOM-write is the source of truth — runtime writes
      `el.value`, mirroring how legacy code reads `areaUnit.value`.
- [x] `localStorage` write is best-effort — runtime swallows missing
      `localStorage` and `setItem` throws (tests 9 and 10), consistent
      with `set_measurement_units` (which uses
      `typeof localStorage !== "undefined"` guard but does not
      try/catch — we go a hair further with try/catch since this
      single setter is the most common write path; matches what the
      auto-handler does indirectly via `lock()`).
- [x] `previous` captured BEFORE mutation — explicit call-order test
      (test 13) and `setAreaUnit` is invoked **after** `getAreaUnit`
      in the implementation.
- [x] All five "Errors (verbatim)" lines match what tests assert and
      what the implementation emits.
- [x] Schema marks `unit` as `required`.

### Corrections made during review

- None at draft time — the plan started from the dispatch-instruction
  template and has remained consistent.
- One clarification recorded: when `unit === "square"` and the
  `distanceUnitInput` element is missing, `interpreted_label` becomes
  `"²"` rather than `null` — this exactly mirrors the legacy
  `distanceUnitInput.value + "2"` template-string behaviour (where
  `value` would be `""` on a missing element). Documented in
  "Behavior" §6.
