# Plan 276 — `get_measurement_units` AI tool

## Goal
Add a read-only AI tool `get_measurement_units` that reports the current
Options-panel display units for distance, area, height, and temperature. It is
the inverse / readback analog of `set_measurement_units`.

## Shape
- No required params. Accepts no arguments.
- Success: `{ ok: true, units: { distance, area, height, temperature } }` — the
  same four string fields `set_measurement_units` accepts.
- Read-only — never mutates DOM, `window.options`, or `localStorage`.

## Reuse
- Reuses the same DOM input ids as `set-measurement-units.ts`
  (`distanceUnitInput`, `areaUnit`, `heightUnit`, `temperatureScale`) and the
  same `localStorage` keys (`distanceUnit`, `areaUnit`, `heightUnit`,
  `temperatureScale`). Read order: DOM input's `.value` first; fall back to
  `localStorage.getItem(storedKey)`; finally `null` when neither is present.
- Runtime seam `MeasurementUnitsReadRuntime { readUnit(elementId, storedKey) }`
  mirrors the `setUnit` half of `MeasurementUnitsRuntime` and keeps the node-
  test surface pure.

## File layout
- `src/ai/tools/get-measurement-units.ts` — tool + factory + runtime seam.
- `src/ai/tools/get-measurement-units.test.ts` — unit tests (mock runtime) +
  `defaultMeasurementUnitsReadRuntime (integration)` block poking
  `globalThis.document` / `globalThis.localStorage` via `as unknown as { ... }`
  casts.
- Register `getMeasurementUnitsTool` in `src/ai/index.ts` (import block, public
  re-exports, `registry.register` next to `setMeasurementUnitsTool` /
  `getLayerVisibilityTool`).
- Add row in `README_AI.md` immediately after the `set_measurement_units` row.

## Risks / edge cases
- Values may be missing (DOM element not mounted, no localStorage entry). Emit
  `null` for that field rather than erroring — the tool is informational.
- `localStorage` and `document` can be undefined in SSR/node test contexts.
  Default runtime must handle both cases gracefully (returning `null`).
- Tool must **not** touch `window.options` / DOM — pure read.

## Out of scope
- Converting between units or returning derived numeric scales (distanceScale,
  heightExponent, etc.) — tool mirrors only what `set_measurement_units`
  writes.
