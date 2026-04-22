# Tasks 44 — set_zone_color AI tool

## Task 1 — Implement tool

- [ ] Create `src/ai/tools/set-zone-color.ts` exporting:
  - `ZoneColorRef { i, name, previousColor }`.
  - `ZoneColorRuntime { find, applyColor }`.
  - `defaultZoneColorRuntime`:
    - `find`: reuse `findZoneByRef(getPack()?.zones, ref)`.
    - `applyColor(i, color)`: find by `i`; throw if missing; set
      `zone.color = color`; best-effort call `getGlobal<() => void>("drawZones")?.()`.
  - `createSetZoneColorTool(runtime)` factory + `setZoneColorTool`.
- [ ] Tool schema: `zone` (int|string, required), `color` (string,
  required).
- [ ] Validate color via `isValidCssColor` (imported from
  `./set-state-color`) using the same error message as other color
  tools.

## Task 2 — Register in ai/index

- [ ] `import { setZoneColorTool } from "./tools/set-zone-color";`.
- [ ] Barrel re-export block mirroring other set-*-color tools.
- [ ] `registry.register(setZoneColorTool)` right after
  `setProvinceColorTool`.

## Task 3 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/set-zone-color.test.ts`:
  - `recolors a zone by numeric id` — applyColor called with `(i,
    newColor)` and response echoes previousColor.
  - `resolves zone by case-insensitive name`.
  - `errors when the zone is unknown`.
  - `rejects invalid zone refs (null, 0, -1, 1.5, "")`.
  - `rejects invalid colors` — loop over
    `[null, undefined, "", "not-a-color", 42, {}]`.
  - `accepts hex, rgb, rgba, hsl, named colors` (trust isValidCssColor
    already has full tests; here just smoke test each canonical form).
  - `surfaces runtime failures`.

## Task 4 — Default-runtime integration test

- [ ] describe("defaultZoneColorRuntime (integration)"):
  - beforeEach: set `globalThis.pack.zones` with non-contiguous ids,
    set `globalThis.drawZones` to a mock.
  - afterEach: restore both.
  - Test: set zone 5 color to `"#ff00ff"` → asserts `pack.zones[1].color
    === "#ff00ff"` and `drawZones` called once.
  - Test: unknown zone throws via runtime, surfaced as error from tool.

## Task 5 — README

- [ ] New row under `rename_zone`:
  ```
  | `set_zone_color`        | Change a zone's colour (same as the Zones Overview swatch). Writes `zone.color` and calls `drawZones()`. Accepts hex, rgb(), hsl(), or named CSS colors. Matches by `zone.i` or current name. | "Recolor the Plague zone purple", "Make zone 3 #ff0000" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/set-zone-color` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — baseline intact.
- [ ] `npm run build` — succeeds.

## Task 7 — Commit

- [ ] Stage and commit. Message: `feat(ai): add set_zone_color tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (injected-runtime tests) → Task 3.
- Plan step 4 (default-runtime test) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user recolors zones via swatch, AI cannot.
- Plan writes the exact same `zone.color` field and calls the exact
  same `drawZones()` the UI does — overlay refresh is identical to a
  user-driven change.
- Reuses the shared `isValidCssColor` so accepted color formats are
  consistent with every other set-*-color tool.

## Verification that tests prove the use case

- Injected-runtime tests cover input validation and resolution logic
  (the bits that are tool-specific).
- Default-runtime integration test proves the end-to-end effect
  (mutation + redraw trigger) using real globals, so the live in-app
  behaviour is validated.
- `findZoneByRef` itself is already fully tested by plan 42's suite,
  so we don't duplicate that coverage here.
