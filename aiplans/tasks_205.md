# Tasks 205 — `find_burgs_in_area`

## Implementation

- [ ] `src/ai/tools/find-burgs-in-area.ts`
  - [ ] `PackLike` shape: `burgs?: RawBurg[]; cells?: { i?: ArrayLike<number>; p?: ArrayLike<[number, number] | undefined> }`
  - [ ] `FindBurgsInAreaHit` — `{ i, name, x, y, distance: number | null }`
  - [ ] `FindBurgsInAreaQuery` discriminated union: `"rect"` with `x1/y1/x2/y2/limit`, `"circle-coords"` with `x/y/radius/limit`, `"circle-cell"` with `cell/radius/limit`
  - [ ] `FindBurgsInAreaResult` = hit payload `| "not-ready" | "out-of-bounds" | "no-cell-point"`
  - [ ] Pure `findBurgsInAreaInPack(pack, query)` — rectangle normalises corners; circle uses squared-distance first, sqrt only on match; skips i=0 / removed / missing x|y; caps at `limit`, counts all matches
  - [ ] `defaultFindBurgsInAreaRuntime` via `getPack<PackLike>()`
  - [ ] `parseInput(raw)` returns `{ query }` or `{ error }` with clear messages
  - [ ] `createFindBurgsInAreaTool(runtime = default)` — schema with `x1/y1/x2/y2/x/y/cell/radius/limit` (oneOf-style validation is runtime, no top-level `required`)
  - [ ] Export `findBurgsInAreaTool` convenience instance
  - [ ] Constants `DEFAULT_FIND_BURGS_IN_AREA_LIMIT` = 10000, `MAX_FIND_BURGS_IN_AREA_LIMIT` = 100000

- [ ] `src/ai/tools/find-burgs-in-area.test.ts`
  - [ ] Pure / seam describe — see plan test list
  - [ ] Tool surface describe — see plan test list
  - [ ] `defaultFindBurgsInAreaRuntime (integration)` describe stubs `globalThis.pack` and exercises rect + circle
  - [ ] Use `as unknown as { ... }` casts for fake packs

- [ ] `src/ai/index.ts`
  - [ ] `import { findBurgsInAreaTool } from "./tools/find-burgs-in-area";`
  - [ ] Re-export create-fn, default runtime, types, pure-scanner, constants (alphabetical block — between `find-cells-in-radius` and `find-nearest-burg` exports)
  - [ ] Register `findBurgsInAreaTool` in `buildDefaultRegistry` — directly after `findNearestBurgTool`

- [ ] `README_AI.md`
  - [ ] Add row after `find_nearest_burg` (line 59) — describe both area forms, limit behaviour, example prompts, API key blurb

## Verification

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint` — still 7 warnings / 1 info / 0 errors
- [ ] Commit with scoped files (tool, test, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_205.md`, `aiplans/tasks_205.md`)
