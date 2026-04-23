# Tasks — Plan 190 (`get_regiment_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err.
- [x] Baseline: `npm test 2>&1 | tail -5` → 202 files / 2742 tests.
- [x] Read reference files: `list-regiments.ts`, `rename-regiment.ts`
  (+ test, for `findRegimentByRef` and the two-part ref pattern),
  `set-regiment-icon.ts`, `set-regiment-unit.ts`,
  `set-regiment-naval.ts` (for field coverage: `icon`, `u`, `n`),
  `get-state-info.ts` + test (info analog structure),
  `get-marker-info.ts` + test (most recent get_*_info),
  `_shared/index.ts`, `_shared/pack-types.ts` (for `RawRegiment`
  shape), `list-burgs.ts` (for `resolveStateRefInPack`),
  `src/modules/military-generator.ts` (for the authoritative
  `MilitaryRegiment` shape: `t` total, `a` army, `n` naval flag,
  `u` units composition).
- [ ] Write `src/ai/tools/get-regiment-info.ts` with:
  - `RegimentInfo` interface covering `state: { id, name }`, `i`,
    `name`, `icon | null`, `type | null`, `x`, `y`, `cell`, `n`,
    `army`, `overall`, `units: Record<string, number>`, `naval`.
  - `readRegimentInfoFromPack(pack, stateRef, regRef)` pure helper
    returning `RegimentInfo | "not-ready" | "not-found"`. Reuses
    `resolveStateRefInPack` + `findRegimentByRef`; clones `u` with
    `{ ...reg.u }` so callers can't mutate the live pack; `naval` is
    `reg.n === 1`.
  - `RegimentInfoRuntime` + `defaultRegimentInfoRuntime` reading
    `globalThis.pack` via `getPack`.
  - `createGetRegimentInfoTool(runtime)` + exported
    `getRegimentInfoTool`.
  - Tool schema: `state` (integer or string, required) + `regiment`
    (integer or string, required); description lists all resolved
    fields + API-key note + mentions the two-part ref pattern.
  - Input validation uses the shared `isValidRef`-style shape
    (`>= 0` for integers, non-empty trimmed string).
- [ ] Write `src/ai/tools/get-regiment-info.test.ts`:
  - Seam-block tests (fake pack) covering the plan cases:
    full-field, null defaults, `units` cloning, naval-flag coercion,
    zero-number defaults, `overall === n`, state echo, id/name
    resolution for both state and regiment, not-found /
    not-ready / Neutrals-works, schema required, invalid refs,
    error-message ref quoting.
  - `defaultRegimentInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: ... })` writes +
    `afterEach` restores.
  - Use `as unknown as { ... }` casts for fake packs.
- [ ] Register in `src/ai/index.ts`: import + `export { ... }` block +
  `registry.register(getRegimentInfoTool);` next to
  `registry.register(getMarkerInfoTool);`.
- [ ] Add a README_AI.md row after the `get_marker_info` row —
  description with API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by N cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_regiment_info tool` staging only the
  plan, tasks, tool file, test file, `index.ts`, and `README_AI.md`.
