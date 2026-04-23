# Tasks 102 — regenerate_domain AI tool

- [ ] Create `src/ai/tools/regenerate-domain.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `REGENERATE_DOMAINS` readonly tuple:
      ```
      ["rivers", "routes", "population", "states",
       "provinces", "burgs", "religions", "cultures",
       "military", "ice", "markers"]
      ```
    - `RegenerateDomain` type = element type.
    - `DOMAIN_TO_GLOBAL: Record<RegenerateDomain, string>`:
      - rivers → "regenerateRivers"
      - routes → "regenerateRoutes"
      - population → "recalculatePopulation"
      - states → "regenerateStates"
      - provinces → "regenerateProvinces"
      - burgs → "regenerateBurgs"
      - religions → "regenerateReligions"
      - cultures → "regenerateCultures"
      - military → "regenerateMilitary"
      - ice → "regenerateIce"
      - markers → "regenerateMarkers"
    - `resolveRegenerateDomain(value): RegenerateDomain | null`
      — case-insensitive lookup.
    - `RegenerateDomainRuntime { regenerate(domain) }`.
    - `defaultRegenerateDomainRuntime.regenerate`:
      - Get the function via getGlobal(DOMAIN_TO_GLOBAL[domain]).
      - Throw if not function: `{domain} is not
        available yet; the map hasn't finished loading.`
      - Call it with no args.
    - `createRegenerateDomainTool(runtime?)` and
      `regenerateDomainTool`.
  - Tool name: `regenerate_domain`.
  - Description: references the Tools panel Regenerate
    buttons; lists the 11 supported domains; notes
    emblems and whole-map regen have their own tools.
  - Schema: `domain` (string enum [...REGENERATE_DOMAINS],
    required).
  - Validation:
    - typeof domain !== "string" OR empty → error w/ supported list.
    - resolveRegenerateDomain returns null → error w/ supported list.
  - Return payload: `{ domain }` (the canonical name).

- [ ] Register in `src/ai/index.ts`:
  - Import after regenerateEmblemsTool.
  - Barrel re-export: `createRegenerateDomainTool`,
    `DOMAIN_TO_GLOBAL`, `REGENERATE_DOMAINS`,
    `regenerateDomainTool`, `resolveRegenerateDomain`.
  - `registry.register(regenerateDomainTool)`.

- [ ] Write `src/ai/tools/regenerate-domain.test.ts`:
  - `resolveRegenerateDomain`:
    - canonicalizes "Rivers", "STATES", "population".
    - returns null for unknown, non-string, empty.
  - `REGENERATE_DOMAINS` / `DOMAIN_TO_GLOBAL`:
    - length == 11
    - DOMAIN_TO_GLOBAL[population] == "recalculatePopulation"
    - DOMAIN_TO_GLOBAL[rivers] == "regenerateRivers"
  - Unit (stubbed runtime):
    - dispatches by canonical domain
    - canonicalizes case of input
    - rejects unknown domain
    - rejects empty / non-string
    - surfaces runtime errors
  - `defaultRegenerateDomainRuntime (integration)`:
    - stubs all 11 globals.
    - each domain call hits the right stub once.
    - errors when target global is missing (by
      deleting one global and asserting the tool
      returns an error).

- [ ] Update `README_AI.md` — row near
  `regenerate_emblems`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add regenerate_domain tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Enum + mapping matches plan.
- Error semantics match plan.

## Verification: plan → use case

- UI's Tools panel Regenerate buttons each dispatch to
  one of these globals with no args. Tool does the
  same with a domain parameter, covering 11 of them in
  one callable.

## Verification: tests → regressions

- If the domain mapping drifts, integration fails for
  that domain.
- If case-insensitive canonicalization regresses, the
  case test fails.
- If error path was lost, the missing-global test
  fails.
- If the schema enum drops a domain, the integration
  test for that domain fails.
