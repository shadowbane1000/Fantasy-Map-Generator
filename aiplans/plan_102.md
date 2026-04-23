# Plan 102 — regenerate_domain AI tool

## Use case

The Tools panel exposes a row of Regenerate buttons
(`public/modules/ui/tools.js:84`): Rivers, Routes,
Population, States, Provinces, Burgs, Religions,
Cultures, Military, Ice, Markers. Each dispatches to a
no-arg global (`regenerateRivers`, `regenerateRoutes`,
`recalculatePopulation`, `regenerateStates`,
`regenerateProvinces`, `regenerateBurgs`,
`regenerateReligions`, `regenerateCultures`,
`regenerateMilitary`, `regenerateIce`, `regenerateMarkers`).

`regenerate_map` (full re-gen) and `regenerate_emblems`
are already available. This tool fills the gap for
single-domain regeneration without rebuilding the whole
map.

## Scope

Add one tool: `regenerate_domain(domain)`.

- `domain` — one of: `rivers`, `routes`, `population`,
  `states`, `provinces`, `burgs`, `religions`,
  `cultures`, `military`, `ice`, `markers`.
  Case-insensitive.
- Dispatches to the matching global; errors clearly if
  the function isn't available.
- No before/after diff — these operations are
  intentionally broad and don't have a clean "counts"
  output that fits all domains.

Out of scope:
- `zones` (takes an event arg in the UI and is
  event-driven — different shape).
- `relief` / `state_labels` (draw, not regenerate).
- `emblems` (already has its own tool).
- `map` (already has its own tool).

## Implementation

1. **New file `src/ai/tools/regenerate-domain.ts`**:
   - `REGENERATE_DOMAINS` readonly tuple of 11 names.
   - `DOMAIN_TO_GLOBAL` record mapping each domain to
     its global function name.
   - `resolveRegenerateDomain(value)` — case-insensitive
     lookup.
   - `RegenerateDomainRuntime { regenerate(domain) }`.
   - `defaultRegenerateDomainRuntime.regenerate(domain)`:
     - Look up the global name via DOMAIN_TO_GLOBAL.
     - getGlobal<() => void>(name); throw if missing.
     - Call it.
   - Schema: `domain` (string enum, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `regenerate-domain.test.ts`:
   - `resolveRegenerateDomain` canonicalization.
   - `REGENERATE_DOMAINS` and `DOMAIN_TO_GLOBAL` cover
     all 11 domains with correct global name mapping.
   - Unit (stubbed):
     - dispatches correct domain through runtime
     - rejects unknown domain
     - rejects empty / non-string
     - surfaces runtime errors
   - Integration:
     - stubs globalThis regenerate functions for each
       domain.
     - each domain dispatches to its global exactly
       once.
     - errors when the target global is missing.

4. **README_AI.md** — row near `regenerate_emblems`.

## Verification

- `npm test -- --run src/ai/tools/regenerate-domain`
  green.
- `npm test -- --run` — 1258 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Dispatches to correct global for each of 11 domains.
- Errors clearly when domain unknown or global missing.
