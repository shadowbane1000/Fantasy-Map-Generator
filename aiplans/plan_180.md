# Plan 180 — `measure_distance` AI tool

## Goal
Add a read-only AI tool that measures the Euclidean distance between two
points on the map. Points can be expressed as cell indices, burg references
(numeric id or case-insensitive name), or raw coordinate pairs. Returns the
distance both in SVG pixels and in scaled real-world units (using
`distanceScale` / `distanceUnit` from the legacy globals), mirroring how
`public/modules/ui/measurers.js` labels its straight rulers with
`rn(length * distanceScale) + " " + distanceUnitInput.value`.

## Use case
Given two point specs, the tool:
1. Resolves each spec to an `(x, y)` pair in SVG pixel space.
2. Computes `Math.hypot(dx, dy)` — the straight-line pixel distance
   (matches `Ruler.getLength` for a 2-point ruler).
3. Multiplies by the current `distanceScale` to get a scaled value.
4. Reads `distanceUnit` from the DOM input (fallback to `window.options`
   or `"mi"`) as a label.

The result is a number the AI can use for reasoning about travel / spacing
without having to drop a ruler, parallel to the `add_ruler` tool but
side-effect-free.

## Shape
- **Tool name**: `measure_distance`
- **Inputs** (exactly one of the three forms):
  - Cell form:
    - `from_cell` (non-negative integer) + `to_cell` (non-negative integer).
      Reads `pack.cells.p[cell]` as the point.
  - Burg form:
    - `from_burg` (integer id or case-insensitive name/fullName)
    - `to_burg` (integer id or case-insensitive name/fullName)
      Uses `findEntityByRef` — rejects index-0 placeholder / `removed`.
  - Coordinate form:
    - `from_x`, `from_y`, `to_x`, `to_y` (all finite numbers).
- **Output** (on success):
  ```
  {
    ok: true,
    pixels: <number>,      // raw Euclidean distance in SVG px
    scaled: <number>,      // pixels * distanceScale
    unit:   <string>,      // distance unit label, e.g. "mi" / "km"
    from:   { x: <number>, y: <number> },
    to:     { x: <number>, y: <number> }
  }
  ```
- **Errors**:
  - Mixed forms / zero forms → `Provide exactly one of: (from_cell + to_cell), (from_burg + to_burg), or (from_x + from_y + to_x + to_y).`
  - Incomplete coord form (missing one) → same message.
  - Non-finite coord / non-integer cell → `from_x must be a finite number.` etc.
  - `from_cell` / `to_cell` out of bounds → `cell <n> is out of bounds.`
  - Cell has no point in `pack.cells.p` → `cell <n> has no coordinates.`
  - Missing pack → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - Unknown burg / removed burg → `burg <ref> not found.`

## Runtime seam
```ts
export interface MeasureDistanceRuntime {
  resolvePoint(spec: PointSpec): ResolvedPoint | PointError;
  readScale(): { distanceScale: number; distanceUnit: string };
}
```
- `defaultMeasureDistanceRuntime`:
  - `resolvePoint` reads `globalThis.pack` for cell / burg forms.
  - `readScale` reads `globalThis.distanceScale` (number fallback 1) and the
    DOM input `#distanceUnitInput` (fallback `window.options?.distanceUnit`
    or `"mi"`).

Internally a pure helper `measureDistanceInPack(pack, from, to)` does the
cell/burg lookups so unit tests can exercise it without touching globals.

## Tests (Vitest, node env)

### Pure / seam block
1. Coordinate form → correct `pixels` (3-4-5 triangle → 5).
2. Cell form resolves `pack.cells.p[cell]` for both endpoints.
3. Burg form resolves by numeric id and by case-insensitive name.
4. Burg form rejects `removed: true` and index-0 placeholder.
5. `scaled = pixels * distanceScale` applied correctly.
6. Out-of-bounds cell → `out-of-bounds` sentinel.
7. Cell with no point → `no-cell-point` sentinel.
8. Missing pack → `not-ready` sentinel.

### Tool-surface block
9. Rejects when no form supplied.
10. Rejects when two forms supplied simultaneously.
11. Rejects incomplete coordinate form.
12. Rejects non-finite coordinates.
13. Rejects non-integer / negative cell.
14. Surfaces `not-ready` / `out-of-bounds` / `no-cell-point` / unknown-burg
    as structured errors.
15. Happy path returns `{ok, pixels, scaled, unit, from, to}` with correct
    shape.
16. Schema has correct property definitions; `required` omitted (runtime
    validates which form).

### defaultRuntime integration block
Using `(globalThis as unknown as { pack?, distanceScale?, options? })` writes:
17. Reads real pack for a cell form.
18. Reads real `distanceScale` global for `scaled`.
19. Falls back to `options.distanceUnit` when DOM input absent.

## Registration
- Import + register `measureDistanceTool` in `src/ai/index.ts` next to
  `findNearestBurgTool`.
- Add re-export block for `createMeasureDistanceTool`,
  `defaultMeasureDistanceRuntime`, `measureDistanceInPack`,
  `measureDistanceTool`, and related types.

## README_AI.md
Add one row right after `find_nearest_burg`, with API-key note + 2–3
example prompts.

## Verification
- `npm run build` — succeeds.
- `npm test` — all pass, test count increases.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- Straight-line distance only (not pathed). Users can drop a full ruler via
  `add_ruler` or compute a route via future tools.
- Does NOT mutate the map or add any SVG.
- Does NOT recompute `distanceScale` — respects whatever the user has set.
