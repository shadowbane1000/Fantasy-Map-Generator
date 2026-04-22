# Tasks 65 — set_zone_type AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-zone-type.ts`:
  - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
    type `RawZone` from `_shared`; `findZoneByRef` from
    `./set-zone-visibility`.
  - Types:
    - `ZoneTypeRef { i, name, previousType }`.
    - `ZoneTypeRuntime { find, apply }`.
  - `defaultZoneTypeRuntime.find`: `findZoneByRef(getPack()?.zones,
    ref)` → `{ i, name: zone.name ?? "", previousType: zone.type
    ?? null }`.
  - `defaultZoneTypeRuntime.apply(id, type)`:
    - Refind; throw if null.
    - `zone.type = type`.
    - If document available:
      `document.getElementById("zone" + id)?.setAttribute("data-type",
      type)`.
  - Tool schema: `zone` (int|string required), `type` (string
    required non-empty).
  - Execute: `parseEntityRef(zone)`; validate type is non-empty
    trimmed; `find` → 404; try `apply`; return
    `{ i, name, previousType, type }`.

## Task 2 — Register

- [ ] Import; barrel re-export; `registry.register(setZoneTypeTool)`
  after `setZoneColorTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-zone-type.test.ts`:
  - Runtime-injected:
    - Set by id → apply called with type.
    - Set by case-insensitive name.
    - Trim type before writing.
    - Reject unknown ref.
    - Reject invalid zone ref (null, 0, -1, 1.5, "").
    - Reject invalid type (null, "", "   ", 42).
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.zones` with non-contiguous ids.
    - Stub `globalThis.document` with a fake `#zone5`
      setAttribute spy.
    - Apply type → `zone.type` updated + `setAttribute` called.
    - Missing element → still succeeds, zone.type updated.

## Task 4 — README

- [ ] Row under `rename_zone`:
  ```
  | `set_zone_type`         | Reclassify a zone (writes `zone.type` and the `#zone{i}` SVG `data-type` attribute — same as the Zones Editor type field). Free-form text: common values are Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, Flood; anything non-empty is accepted. Matches by `zone.i` or case-insensitive name. | "Reclassify zone 5 as Rebels", "Change the Plague zone to Famine" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-zone-type` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_zone_type tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Zones Editor type field, unreachable by AI.
- Plan writes the same `zone.type` and mirrors to
  `data-type` — exactly what `changeType` does. The Zones
  Overview's group-by-type and its style selector both read from
  these two places.
- findZoneByRef handles non-contiguous ids, consistent with the
  rest of the zone tool family.

## Verification that tests prove the use case

- Injected-runtime tests cover every validation branch.
- Integration test asserts both the data mutation AND the
  data-type attribute update — the two side-effects the UI
  produces.
- Missing-SVG test confirms graceful fallback (the tool runs even
  if the zone SVG hasn't rendered yet).
