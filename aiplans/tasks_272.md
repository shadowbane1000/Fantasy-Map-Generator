# Tasks — Plan 272 (`find_duplicate_names`)

- [ ] Create `src/ai/tools/find-duplicate-names.ts`:
  - [ ] `DUPLICATE_NAME_DOMAINS` const, `DuplicateNameDomain` union,
        `DEFAULT_FIND_DUPLICATE_NAMES_LIMIT = 1000`,
        `MAX_FIND_DUPLICATE_NAMES_LIMIT = 100000`.
  - [ ] `PackLike` shape covering the six collections.
  - [ ] `DuplicateNameGroup { name, ids, count }`,
        `FindDuplicateNamesPayload { domain, duplicates, count }`,
        `FindDuplicateNamesResult = payload | "not-ready"`.
  - [ ] `findDuplicateNamesInPack(pack, domain, limit)` —
    - resolve the right collection
    - "not-ready" when collection missing
    - bucket by lowercased trimmed name, skip empties / placeholders /
      removed
    - emit groups with size >= 2, sorted count desc then name asc
    - apply `limit` on output array but not on `count`
  - [ ] `FindDuplicateNamesRuntime` + `defaultFindDuplicateNamesRuntime`
        using `getPack<PackLike>()`.
  - [ ] `createFindDuplicateNamesTool(runtime)` — name
        `find_duplicate_names`, thorough description that references
        API-key requirement, input schema with `domain` (required)
        and optional `limit`. Validates both, surfaces errors.
  - [ ] `findDuplicateNamesTool` default singleton export.

- [ ] Create `src/ai/tools/find-duplicate-names.test.ts` with two
      `describe` blocks plus the `defaultFindDuplicateNamesRuntime`
      integration block. Use `as unknown as { pack?: unknown }` casts
      around `globalThis`.

- [ ] Wire up `src/ai/index.ts`:
  - [ ] import `findDuplicateNamesTool` near `findAdjacentEntitiesTool`.
  - [ ] export block for the module (mirror `find-adjacent-entities`).
  - [ ] `registry.register(findDuplicateNamesTool);` right after
        `registry.register(findAdjacentEntitiesTool);`.

- [ ] Add README_AI.md row immediately below `find_adjacent_entities`.

- [ ] `npm run build` passes.
- [ ] `npm test` passes, new tests added.
- [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).

- [ ] Commit with `feat(ai): add find_duplicate_names tool` + short
      body, staging specific files only.
