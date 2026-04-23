# Tasks 104 — regenerate_zones AI tool

- [ ] Create `src/ai/tools/regenerate-zones.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPackCollection, okResult, type RawZone.
  - Exports:
    - `DEFAULT_ZONES_MULTIPLIER = 1`.
    - `RegenerateZonesRuntime`:
      - `regenerate(multiplier)`.
      - `countActive()` → number of non-removed zones.
    - `defaultRegenerateZonesRuntime`:
      - regenerate:
        - Get `window.Zones`. Throw if missing or
          missing `.generate` function.
        - `Zones.generate(multiplier)`.
        - Best-effort `drawZones()` if global present
          (try/catch swallowed).
      - countActive: sum non-removed entries in
        `pack.zones`.
    - `createRegenerateZonesTool(runtime?)` and
      `regenerateZonesTool`.
  - Tool name: `regenerate_zones`.
  - Description: references Tools panel Regenerate
    Zones, notes default multiplier 1, mentions
    drawZones refresh.
  - Schema: `multiplier` (number, optional, minimum 0,
    maximum 100, description with default note).
  - Validation:
    - If multiplier provided: must be number, finite,
      0 ≤ m ≤ 100.
    - Otherwise default to DEFAULT_ZONES_MULTIPLIER.
  - Return payload: `{ multiplier, zones: <count after regen> }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other regenerate tools.
  - Barrel re-export.
  - `registry.register(regenerateZonesTool)`.

- [ ] Write `src/ai/tools/regenerate-zones.test.ts`:
  - Unit (stubbed):
    - delegates with provided multiplier
    - defaults to 1 when omitted
    - rejects non-finite multiplier
    - rejects negative multiplier
    - rejects multiplier > 100
    - surfaces runtime errors
  - `defaultRegenerateZonesRuntime (integration)`:
    - stubs `globalThis.Zones = { generate: vi.fn() }`.
    - stubs `globalThis.drawZones = vi.fn()`.
    - stubs `globalThis.pack.zones`.
    - Calls regenerateZonesTool; Zones.generate called
      with multiplier; drawZones called.
    - Success when drawZones missing.
    - Error when Zones.generate missing.

- [ ] Update `README_AI.md` — row near `regenerate_domain`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add regenerate_zones tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Validation bounds match plan.
- Default of 1 matches plan's determinism rationale.

## Verification: plan → use case

- UI does `Zones.generate(multiplier)` then refreshes
  layer. Tool does the same with an explicit multiplier
  parameter.

## Verification: tests → regressions

- If multiplier default dropped, the no-arg test
  fails.
- If delegation dropped, the integration assertion
  fails.
- If range validation dropped, the boundary tests
  fail.
- If drawZones wasn't called, the drawZones assertion
  fails.
- If the missing-Zones error path dropped, that test
  fails.
