# Tasks 148 — `set_wind`

## Pre-flight

- [x] Confirm worktree (`/workspace/.claude/worktrees/agent-a4447c16`)
- [x] Merge master --ff-only (already up-to-date)
- [x] Study `public/main.js:151` — confirm `options.winds = [225, 45, 225, 315, 135, 315]`
- [x] Study `public/main.js:986-1028` — confirm 6 tiers (30° each), `getWindDirections` interprets degrees
- [x] Study `public/modules/ui/world-configurator.js:171-190` — confirm triple-write (options / DOM transform / localStorage "winds")
- [x] Study `public/modules/ui/options.js:557` — confirm `localStorage.winds` is read as `split(",").map(Number)`
- [x] Study `src/index.html:2666-2679` — confirm 6 `<path data-tier="0..5">` inside `#globeWindArrows`
- [x] Baseline: 7 warnings / 1 info / 0 errors

## Implementation

- [ ] `src/ai/tools/set-wind.ts`
  - [ ] Export `WIND_BAND_COUNT = 6`
  - [ ] Export `DEFAULT_WINDS = [225, 45, 225, 315, 135, 315]`
  - [ ] Export `WIND_BAND_ALIASES` mapping string → index, plus `resolveBand(input)`
  - [ ] `normaliseAngle(n)` → `((n % 360) + 360) % 360`, preserving fractions
  - [ ] `SetWindRuntime` interface (`read(band) / apply(band, direction)`)
  - [ ] `defaultSetWindRuntime`
    - [ ] `read`: `options.winds[band]` → localStorage fallback → null
    - [ ] `apply`: ensure `options.winds` is 6-length (lazy-init from defaults), write it, rotate the `<path data-tier>` via querySelector + transform rewrite, persist `options.winds.join(",")` to localStorage["winds"]
  - [ ] `createSetWindTool(runtime)` factory
    - [ ] Accept exactly one of `{band, direction}` / `{bands}` / `{directions}` / `{reset: true}`
    - [ ] Validate each field; normalise angles; call `read` then `apply` per band; return `{ok, changes: [...]}`
    - [ ] On `apply` throw, surface `errorResult` and stop
  - [ ] Export `setWindTool` default instance

- [ ] `src/ai/tools/set-wind.test.ts`
  - [ ] Seam tests (mock runtime):
    - [ ] Single `{band, direction}` call
    - [ ] Bulk `{bands: [...]}` call
    - [ ] Bulk `{directions: [...]}` length-6 call
    - [ ] `{reset: true}` applies defaults
    - [ ] Band alias strings resolve
    - [ ] Angle normalisation: negative, >= 360, fractional
    - [ ] Rejects no-input, multiple forms, wrong band, non-finite dir, wrong-length directions, bad bands item
    - [ ] `apply` throw → errorResult
  - [ ] Integration block with `defaultSetWindRuntime`:
    - [ ] beforeEach/afterEach install `globalThis.document` / `.localStorage` / `.options`
    - [ ] Setting a single band mutates `options.winds[band]`, rewrites DOM transform, persists `winds` string
    - [ ] `read` pulls previous from `options.winds` first, localStorage second, null third
    - [ ] Missing DOM → swallowed; localStorage still written
    - [ ] Missing localStorage → errorResult

- [ ] `src/ai/index.ts`
  - [ ] Import `setWindTool` + `createSetWindTool`
  - [ ] Re-export (include `DEFAULT_WINDS`, `WIND_BAND_COUNT`, `WIND_BAND_ALIASES`)
  - [ ] Register `setWindTool` in `buildDefaultRegistry` near `setPrecipitationTool`

- [ ] `README_AI.md`
  - [ ] Add row near `set_climate` / `set_precipitation` citing `options.winds[tier]`, the 6 tiers, and triple-write pattern

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (count increases by new test file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add set_wind tool`
- [ ] 1–2 line body
- [ ] Stage specific files: plan_148.md, tasks_148.md, set-wind.ts, set-wind.test.ts, src/ai/index.ts, README_AI.md
