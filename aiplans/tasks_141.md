# Tasks 141 — `add_zone`

- [ ] T1 Create `src/ai/tools/add-zone.ts` with:
  - `AddZoneInput` (name, type, color?, cells?) and `NewZone` (i, name, type, color, cells) interfaces.
  - `AddZoneRuntime` interface with `validateCells` + `add` seams.
  - `defaultAddZoneRuntime`:
    - `validateCells(cells)` reads `pack.cells.i` (if available) and checks every index is `Number.isInteger(v) && v >= 0 && v < cells.i.length`. Returns a discriminated result.
    - `add(input)`:
      - Reads `pack.zones`; throws if not an array.
      - Computes `i = pack.zones.length ? Math.max(...zones.map(z => z.i)) + 1 : 0`.
      - Defaults `color` to `url(#hatch${i % 42})` when missing.
      - De-duplicates `cells` (preserves order).
      - Pushes `{i, name, type, color, cells}` onto `pack.zones`.
      - Best-effort calls `window.drawZones()`.
      - Returns the new zone data.
  - `createAddZoneTool(runtime?)` exports the tool; `addZoneTool` default instance.
  - `input_schema`: required `name`, `type`; optional `color`, `cells` (array of integers).
  - `execute`:
    - Validates `name` / `type` (non-empty strings).
    - Validates `color` if provided (non-empty string).
    - Validates `cells` if provided (array of non-negative integers).
    - Calls `runtime.validateCells(cells)` and surfaces its error.
    - Calls `runtime.add(...)` inside try/catch.
    - Returns `okResult({ ok: true, i, name, type, color, cells })`.

- [ ] T2 Create `src/ai/tools/add-zone.test.ts`:
  - Injected-runtime tests:
    1. minimal call (name + type) → runtime.add invoked with `cells: []`, defaults applied; result shape correct.
    2. full call (name + type + color + cells) → runtime.add receives the fields verbatim.
    3. missing `name` / empty `name` / whitespace `name` → errors before runtime.
    4. missing `type` / empty `type` → errors.
    5. `color` non-string / empty → error.
    6. `cells` non-array / contains non-integer / contains negative → error.
    7. `runtime.validateCells` returning `{ ok: false, error: "..." }` → errorResult; `runtime.add` not called.
    8. runtime.add throwing → errorResult surfaces the message.
  - `defaultAddZoneRuntime` (integration) block, using `as unknown as { ... }` globalThis casts:
    - Install pack with `zones: []` and `cells: { i: new Uint32Array(10) }`; install `drawZones` mock.
    - Minimal add creates `i: 0`, color `url(#hatch0)`, empty cells, drawZones called.
    - Second add after zone `{i: 5}` already present → new zone gets `i: 6`.
    - Explicit color / cells preserved.
    - Duplicate cells collapsed.
    - Out-of-range cell index → error, pack.zones unchanged, drawZones not called.
    - Missing `pack.zones` → error.
    - `drawZones` throwing swallowed (pack still mutated).

- [ ] T3 Register in `src/ai/index.ts`:
  - Add `import { addZoneTool } from "./tools/add-zone";` alphabetically with the other `add-*` imports.
  - Add `createAddZoneTool` / `addZoneTool` re-export block near the other `add_*` exports.
  - Add `registry.register(addZoneTool);` near the other `add*Tool` registrations.

- [ ] T4 Add `README_AI.md` row near the other `add_*` / zone tools (after `add_marker` or after `remove_zone`). Document the `name` ↔ "description" alias and the `cells` array validation.

- [ ] T5 Verify: `npm run build` succeeds, `npm test` all pass, `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).

- [ ] T6 Commit with `feat(ai): add add_zone tool` staging only the four touched files.
