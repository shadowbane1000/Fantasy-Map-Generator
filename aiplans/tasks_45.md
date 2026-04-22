# Tasks 45 — remove_zone AI tool

## Task 1 — Implement tool

- [ ] Create `src/ai/tools/remove-zone.ts` exporting:
  - `RemoveZoneRef { i, name }`.
  - `ZoneRemovalRuntime { find, remove }`.
  - `defaultZoneRemovalRuntime`:
    - `find`: reuse `findZoneByRef(getPack()?.zones, ref)`.
    - `remove(i)`:
      - `const zones = getPack<{ zones?: RawZone[] }>()?.zones`.
      - If not an array: throw `pack.zones is not available.`.
      - `const idx = zones.findIndex(z => z && z.i === i)`.
      - If idx < 0: throw `Zone ${i} not found.`.
      - `zones.splice(idx, 1)`.
      - If `document` defined: `document.getElementById(\`zone${i}\`)?.remove()`.
      - `const unfog = getGlobal<(key: string) => void>("unfog")`; try
        `unfog?.("focusZone" + i)` in a try/catch.
  - `createRemoveZoneTool(runtime)` factory + `removeZoneTool` default.
- [ ] Tool schema: `zone` (int|string, required).
- [ ] Description explains mutation + SVG + unfog side-effects and
  mentions the UI confirm-dialog is skipped (tools are non-interactive).

## Task 2 — Register in ai/index

- [ ] `import { removeZoneTool } from "./tools/remove-zone";`.
- [ ] Barrel re-export `createRemoveZoneTool` / `removeZoneTool`.
- [ ] `registry.register(removeZoneTool)` next to `removeMarkerTool`.

## Task 3 — Unit tests (runtime-injected)

- [ ] `src/ai/tools/remove-zone.test.ts`:
  - Removes by numeric id.
  - Removes by case-insensitive name.
  - Errors when the zone is unknown.
  - Rejects invalid `zone` (null, 0, -1, 1.5, "").
  - Surfaces runtime failures.

## Task 4 — Default-runtime integration test

- [ ] `describe("defaultZoneRemovalRuntime (integration)")`:
  - beforeEach: set `globalThis.pack.zones` with non-contiguous ids,
    stub `globalThis.document.getElementById` with a vi.fn returning
    `{ remove: vi.fn() }` for `"zone5"` and null otherwise, stub
    `globalThis.unfog` with a vi.fn.
  - afterEach: restore original globals.
  - Test: remove zone 5 →
    - `pack.zones.length` went from 3 to 2.
    - No entry with i===5 left.
    - The returned fake element's `remove` method was called.
    - `unfog("focusZone5")` was called.
  - Test: unknown zone → error surfaced.
  - Test: when `document.getElementById` returns null, still succeeds
    and drops the zone from the array.
  - Test: when `unfog` is not defined on globalThis, still succeeds.

## Task 5 — README

- [ ] Add below `set_zone_color`:
  ```
  | `remove_zone` | Delete a zone from the map — same side-effect as the trash icon in the Zones Overview (confirm dialog is skipped; tool runs non-interactively). Drops the entry from `pack.zones`, removes the `#zone{i}` SVG element, and unfogs any focus overlay. | "Delete the Plague zone", "Remove zone 5" |
  ```

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/remove-zone` passes.
- [ ] `npm test -- --run` — full suite passes.
- [ ] `npm run lint` — baseline intact.
- [ ] `npm run build` — succeeds.

## Task 7 — Commit

- [ ] Stage and commit. Message: `feat(ai): add remove_zone tool`.

## Verification that tasks accomplish the plan

- Plan step 1 (new file) → Task 1.
- Plan step 2 (register) → Task 2.
- Plan step 3 (injected-runtime tests) → Task 3.
- Plan step 4 (default-runtime integration) → Task 4.
- Plan step 5 (README) → Task 5.
- Plan "Verification" → Task 6.

## Verification that plan accomplishes the use case

- Use case: user can delete zones via trash icon, AI cannot.
- Plan writes the same `pack.zones` filter (via splice), removes the
  same SVG element, and calls the same `unfog()` global as the UI
  handler. Result is observationally identical.
- Reuses `findZoneByRef` for the id/name resolution (same semantics
  as every other zone tool).

## Verification that tests prove the use case

- Injected-runtime tests validate the input validation branches and
  the tool's happy-path behaviour.
- Default-runtime integration test exercises every side-effect the UI
  triggers: array mutation, SVG removal, unfog. Soft-failure branches
  (no element, no unfog) are covered so the tool's "best-effort"
  posture is proven.
