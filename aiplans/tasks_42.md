# Tasks 42 — set_zone_visibility AI tool

## Task 1 — Implement findZoneByRef helper

- [ ] In `src/ai/tools/set-zone-visibility.ts`, write
  `findZoneByRef(zones, ref)` that:
  - Returns null if `zones` is not an array.
  - For a numeric ref: iterate and match on `zone.i === ref`.
  - For a string ref: iterate and match on
    `zone.name?.toLowerCase() === ref.trim().toLowerCase()` (skip
    empty).
  - Returns the raw `RawZone` entry or null.
- [ ] Export it so the unit test can hit it directly.

## Task 2 — Implement the tool

- [ ] Define the types:
  - `ZoneVisibilityRef { i, name, previousHidden }`.
  - `ZoneVisibilityRuntime { find(ref), setHidden(i, hidden) }`.
- [ ] `defaultZoneVisibilityRuntime`:
  - `find`: use `findZoneByRef(getPack<Pack>()?.zones, ref)`, return
    ref with `previousHidden: !!zone.hidden`.
  - `setHidden`: find the same way, throw if not found, otherwise
    if `hidden === true` set `zone.hidden = true`; if false, delete
    the key (match UI semantics). Then best-effort call
    `getGlobal<() => void>("drawZones")?.()`.
- [ ] Build the tool via factory:
  - `name: "set_zone_visibility"`.
  - Description referencing the Zones Overview's eye toggle and the
    fact that `hidden` zones are excluded from `list_zones` by default.
  - Input schema: `zone` (integer or string, required), `visible`
    (boolean, required).
  - `execute`:
    - `parseEntityRef(input.zone, "zone")`.
    - Validate `input.visible` is boolean.
    - `runtime.find(ref)` → 404 errorResult on miss.
    - If `current.previousHidden === !input.visible` (i.e. already in
      requested state), return `okResult({ ..., noop: true })`.
    - Try/catch `runtime.setHidden(i, !input.visible)` and return
      `okResult({ ..., noop: false })`.

## Task 3 — Register in ai/index

- [ ] Add `import { setZoneVisibilityTool } from "./tools/set-zone-visibility";`
- [ ] Add barrel re-export block mirroring the list_zones one:
  ```ts
  export {
    createSetZoneVisibilityTool,
    setZoneVisibilityTool,
    findZoneByRef,
  } from "./tools/set-zone-visibility";
  ```
- [ ] Call `registry.register(setZoneVisibilityTool)` next to the
  other set-* tools.

## Task 4 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/set-zone-visibility.test.ts`:
  - `hides a visible zone by id` — assert setHidden(3, true).
  - `shows a hidden zone by id` — assert setHidden(3, false).
  - `resolves zone by case-insensitive name`.
  - `returns noop when asked to hide an already-hidden zone`.
  - `returns noop when asked to show an already-visible zone`.
  - `errors when the zone is unknown`.
  - `rejects invalid zone refs (null, 0, -1, 1.5, "")`.
  - `rejects non-boolean visible`.
  - `surfaces runtime failures from setHidden`.

## Task 5 — findZoneByRef unit tests

- [ ] In the same test file:
  - `returns null when zones array is missing`.
  - `matches by numeric i even when array order is different`
    (zones array: [{i:2}, {i:5}, {i:8}] → find 5 → the middle entry).
  - `case-insensitive name match`.
  - `trims whitespace on string refs`.
  - `returns null for unknown name/id`.

## Task 6 — Default-runtime integration test

- [ ] Use a vi.stubGlobal or direct `globalThis.pack = { zones: […] }`
  setup (mirror the style in `_shared/globals.test.ts`).
- [ ] Stub `globalThis.drawZones` with a mock so we can assert it's
  called.
- [ ] Test: hide zone 5 (middle of non-contiguous ids) → zone.hidden
  becomes true → drawZones called.
- [ ] Test: show zone 5 again → zone.hidden is undefined (deleted) →
  drawZones called.
- [ ] Test: no-op call does NOT call drawZones.
- [ ] Clean up globals in afterEach.

## Task 7 — README

- [ ] Add a table row below `list_zones`:
  ```
  | `set_zone_visibility` | Hide or show a single zone on the map (same as the eye toggle in the Zones Overview). Idempotent. | "Hide the Plague zone", "Show zone 5 again" |
  ```

## Task 8 — Verify

- [ ] `npm test -- --run src/ai/tools/set-zone-visibility` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — 7 warnings / 1 info baseline intact.
- [ ] `npm run build` — succeeds.

## Task 9 — Commit

- [ ] Stage and commit: tool + test + ai/index edit + README edit +
  aiplans/plan_42.md + aiplans/tasks_42.md. Message:
  `feat(ai): add set_zone_visibility tool`.

## Verification that tasks accomplish the plan

- Plan step 1 "new file set-zone-visibility.ts" → Tasks 1, 2.
- Plan step 2 "register" → Task 3.
- Plan step 3 "tests modelled on set-entity-lock" → Task 4.
- Plan step 4 "findZoneByRef pack-logic test" → Task 5.
- Plan step 5 "default-runtime integration test" → Task 6.
- Plan step 6 "README" → Task 7.
- Plan "Verification" section → Task 8.

## Verification that plan accomplishes the use case

- Use case: user can hide/show zones via the Zones Overview eye button,
  but AI can't.
- Plan delivers a tool that writes the exact same `zone.hidden` field
  the UI writes and calls the same `drawZones()` global — so the
  overlay updates identically regardless of whether the user or the AI
  triggered it.
- Non-contiguous id handling is explicitly tested, which is the one
  place this tool diverges from other set-* tools (they use array
  indices — zones don't).

## Verification that tests prove the use case

- `findZoneByRef` tests exercise the id-matching divergence.
- Runtime-injected tests verify every branch of the tool's decision
  tree (hide, show, noop both ways, invalid inputs, runtime error).
- Default-runtime integration test proves the actual mutation and
  redraw happen end-to-end in a jsdom/globalThis environment.
- If all three test suites pass, the live in-app behaviour is
  confirmed to match the Zones Editor's own toggle.
