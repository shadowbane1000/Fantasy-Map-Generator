# Tasks — Plan 195 (`find_cells_in_radius`)

1. Baseline: `npm run lint` = 7 warnings / 1 info / 0 errors;
   `npm test` = 2832 passing.

2. Write `src/ai/tools/find-cells-in-radius.ts`:
   - `FindCellsInRadiusHit` interface with `cells`, `count`, `center`.
   - `FindCellsInRadiusQuery` union (coords / cell) carrying
     `radius` + `limit` through to the scanner.
   - `FindCellsInRadiusResult = FindCellsInRadiusHit | "not-ready" |
     "out-of-bounds" | "no-cell-point"`.
   - `PackLike` shape: `cells?: { i?: ArrayLike<number>; p?: ArrayLike<[number, number] | undefined> }`.
   - `resolveCenterPoint(pack, query)` helper — returns
     `[number, number] | "out-of-bounds" | "no-cell-point"`.
   - `findCellsInRadiusInPack(pack, query)`:
     - `"not-ready"` when `pack?.cells?.p` missing.
     - Resolve center via helper.
     - Scan `pack.cells.p`: skip non-array entries, use
       `dx*dx + dy*dy <= r2` to collect indices; only push to
       `cells` while `cells.length < limit`, but always increment
       `count`.
     - Return `{ cells, count, center: { x, y } }`.
   - `FindCellsInRadiusRuntime` + `defaultFindCellsInRadiusRuntime`
     using `getPack<PackLike>()` from `_shared/globals`.
   - `parseInput(rawInput)` helper:
     - Reject neither / both (x,y) vs cell.
     - Reject partial x / y.
     - Validate `radius` is finite and >= 0 (required).
     - Validate `limit` is integer in [1, 100000] (default 10000).
     - Validate `cell` non-negative integer.
     - Validate `x` / `y` finite numbers.
     - Return `{ query }` or `{ error }`.
   - `createFindCellsInRadiusTool(runtime)` → Tool:
     - name `find_cells_in_radius`
     - schema with `x`, `y`, `cell`, `radius`, `limit` (no top-level
       `required`; runtime validates the oneOf + `radius` required).
     - `"not-ready"` → "Map is not ready…"
     - `"out-of-bounds"` → `cell <N> is out of bounds.`
     - `"no-cell-point"` → `cell <N> has no coordinates.`
     - ok path → `okResult({ cells, count, center })`.
   - `findCellsInRadiusTool = createFindCellsInRadiusTool()` default
     export.

3. Write `src/ai/tools/find-cells-in-radius.test.ts`:
   - Import from `./find-cells-in-radius` including types + default
     runtime.
   - `asPack()` uses `as unknown as Parameters<typeof ...>[0]` so the
     FakePack stays lean.
   - `makePack()` fixture with a 5×5 grid of cells (positions chosen
     so radius boundaries are easy to reason about) plus `cells.i`,
     and a few additional edge-case cells (undefined entry, off-grid).
   - suite "pure / seam":
     - coordinate query inside grid returns expected cells (validate
       count + membership).
     - cell-form resolves `pack.cells.p[cell]` then scans.
     - radius 0 returns only cells exactly at center.
     - boundary point (dist === radius) is included.
     - `limit` truncates `cells` but `count` reports full total.
     - skips `undefined` entries in `pack.cells.p`.
     - `"not-ready"` when pack.cells.p missing.
     - `"out-of-bounds"` when cell >= cells.i.length.
     - `"no-cell-point"` when cells.p[cell] is undefined.
   - suite "tool surface":
     - rejects both / neither / partial inputs.
     - rejects non-finite x / y.
     - rejects non-integer / negative cell.
     - rejects missing / non-finite / negative radius.
     - rejects out-of-range limit (0, 100001, 1.5, "10").
     - accepts radius = 0 (returns ok with empty or single-cell list).
     - surfaces `not-ready` / `out-of-bounds` / `no-cell-point` as
       structured errors (runtime stubs).
     - happy path: `{ ok: true, cells, count, center }`.
     - schema spot-check (properties + no top-level required).
   - suite "defaultFindCellsInRadiusRuntime (integration)":
     - set `globalThis.pack = makePack()`; coord query returns real
       cells.
     - cell-form query through default runtime.
     - `globalThis.pack = undefined` → tool returns "not ready"
       structured error.

4. Wire up in `src/ai/index.ts`:
   - import `findCellsInRadiusTool` near `findCellAtCoordsTool`.
   - re-export public surface (`createFindCellsInRadiusTool`,
     `defaultFindCellsInRadiusRuntime`, `findCellsInRadiusTool`,
     `findCellsInRadiusInPack`, type exports) alpha-sorted in the
     `find_*` cluster.
   - `registry.register(findCellsInRadiusTool)` near
     `registry.register(findCellAtCoordsTool)`.

5. Add README_AI.md row near `find_cell_at_coords` (right after it),
   including input, behavior, output shape, error cases, API-key
   note, and usage examples.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests)
   - `npx biome check src/` (must still be 7 warnings / 1 info / 0 errors)

7. Commit selected files with
   `feat(ai): add find_cells_in_radius tool` +
   1-2 line body.
