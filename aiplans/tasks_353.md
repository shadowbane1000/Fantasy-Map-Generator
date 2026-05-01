# Tasks — Plan 353 (`set_area_unit`)

## 1. Implement the tool

- [ ] Create `src/ai/tools/set-area-unit.ts`.
  - Export interface `AreaUnitRuntime` with:
    - `getAreaUnit(): string | null`
    - `setAreaUnit(value: string): void`
    - `getDistanceUnit(): string | null`
    - `persist(key: string, value: string): void`
  - Export `defaultAreaUnitRuntime` that:
    - reads `document.getElementById("areaUnit").value` for getter,
    - reads `document.getElementById("distanceUnitInput").value` for
      distance,
    - throws
      `"#areaUnit input is not available; the units editor is not in the DOM."`
      from `setAreaUnit` if the element is missing,
    - calls `localStorage.setItem(key, value)` inside a `typeof
      localStorage !== "undefined"` guard wrapped in `try/catch`
      (best-effort).
  - Export `createSetAreaUnitTool(runtime?)` returning a `Tool`:
    - name: `set_area_unit`
    - description: explains square vs literal, mentions
      `<input id="areaUnit">` and `localStorage["areaUnit"]`,
      cross-references `set_measurement_units`.
    - input_schema as in plan.
    - execute:
      1. validate `unit` (non-empty string after trim — error
         `"unit must be a non-empty string."`).
      2. `previous = runtime.getAreaUnit()`.
      3. `runtime.setAreaUnit(unit)` (try/catch → propagate `.message`).
      4. `runtime.persist("areaUnit", unit)` (always inside try/catch
         in the runtime — call site doesn't catch).
      5. compute `interpreted_label`:
         - if `unit === "square"`: `(getDistanceUnit() ?? "") + "²"`
         - else: `unit`.
      6. return
         `okResult({ previous, unit, interpreted_label })`.
  - Export `setAreaUnitTool = createSetAreaUnitTool()`.

## 2. Tests

- [ ] Create `src/ai/tools/set-area-unit.test.ts`.
  - Build a `makeRuntime()` helper that returns a runtime + mock fns
    + state record (`{ areaUnit: string; distanceUnit: string }`).
  - Cover all 13 cases enumerated in plan §"Tests".

## 3. Wire up registry

- [ ] In `src/ai/index.ts`:
  - Import `setAreaUnitTool` alphabetically — insert above
    `import { setBiomeColorTool } …`.
  - Re-export `createSetAreaUnitTool, setAreaUnitTool, type
    AreaUnitRuntime, defaultAreaUnitRuntime` from
    `./tools/set-area-unit` — insert above the
    `set-biome-color` re-export block.
  - Register `setAreaUnitTool` inside `buildDefaultRegistry()` next
    to `setMeasurementUnitsTool` (line ~2952).

## 4. Verify

- [ ] `npm test` — all tests green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.

## 5. Commit

- [ ] Stage `src/ai/tools/set-area-unit.ts`,
  `src/ai/tools/set-area-unit.test.ts`, `src/ai/index.ts`,
  `aiplans/plan_353.md`, `aiplans/tasks_353.md`.
- [ ] Commit with message:

```
feat(ai): add set_area_unit tool

Implements plan 353. Adds an AI chat tool that sets the displayed area
unit (the #areaUnit input). Accepts "square" for distance²-derived
display or any literal label like 'ha' / 'km²'. Mirrors the area unit
field in the units editor.
```

- [ ] Do NOT push.
