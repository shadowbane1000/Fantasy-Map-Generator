# Tasks — Plan 234 (`find_coast_cells`)

- [ ] Confirm `pack.cells.t` semantics: `+1` LAND_COAST, `-1` WATER_COAST,
      `±2` inland / deep water, `+3…` deeper land.
- [ ] Write `src/ai/tools/find-coast-cells.ts` with:
      - constants `DEFAULT_FIND_COAST_CELLS_LIMIT` = 10000,
        `MAX_FIND_COAST_CELLS_LIMIT` = 100000;
      - `FindCoastSide` union type and canonical `"land" | "water" | "all"`
        parsing (case-insensitive, defaults to `"land"` when omitted);
      - pure collector `findCoastCellsInPack(pack, side, limit)` returning
        `{ cells, count } | "not-ready"`;
      - runtime seam + `defaultFindCoastCellsRuntime` reading `getPack()`;
      - `createFindCoastCellsTool(runtime?)` producing a `Tool` with input
        schema `{ side?: enum, limit?: integer }`;
      - default-exported `findCoastCellsTool`.
- [ ] Write `src/ai/tools/find-coast-cells.test.ts` covering:
      - collector happy paths for each side (land, water, all);
      - limit truncation preserves full `count`;
      - empty-match returns `{ cells: [], count: 0 }`;
      - `not-ready` when pack / cells / cells.t is missing;
      - tool surface: default side is `"land"`, case-insensitive side,
        invalid side rejected, invalid limit rejected, not-ready surfaced;
      - `defaultFindCoastCellsRuntime` integration with `globalThis.pack`
        using `as unknown as` casts.
- [ ] Register tool in `src/ai/index.ts`:
      - import line next to `findCellsByBiomeTool`;
      - re-export block (constants + factory + runtime + types + tool);
      - `registry.register(findCoastCellsTool)` adjacent to siblings.
- [ ] Add `README_AI.md` row directly after `find_cells_by_biome`
      describing the tool, inputs, outputs, example prompts, and the
      "Requires an Anthropic API key" clause.
- [ ] Run `npm run build` — must succeed.
- [ ] Run `npm test` — all tests pass, count increases by the new cases.
- [ ] Run `npm run lint` — baseline 7 warnings / 1 info / 0 errors.
- [ ] Commit with `feat(ai): add find_coast_cells tool`.
