# Tasks 207 — `find_markers_in_area`

## Implementation

- [ ] `src/ai/tools/find-markers-in-area.ts`
  - [ ] `PackLike` shape: `markers?: RawMarker[]; cells?: { i?: ArrayLike<number>; p?: ArrayLike<[number, number] | undefined> }`
  - [ ] `FindMarkersInAreaHit` — `{ i, type: string | null, icon: string | null, x, y, distance: number | null }`
  - [ ] `FindMarkersInAreaQuery` discriminated union: `"rect"` with `x1/y1/x2/y2/type/limit`, `"circle-coords"` with `x/y/radius/type/limit`, `"circle-cell"` with `cell/radius/type/limit`
  - [ ] `FindMarkersInAreaResult` = hit payload `| "not-ready" | "out-of-bounds" | "no-cell-point"`
  - [ ] Pure `findMarkersInAreaInPack(pack, query)` — rectangle normalises corners; circle uses squared-distance first, sqrt only on match; skips removed / missing x|y; case-insensitive `type` filter; caps at `limit`, counts all matches
  - [ ] `defaultFindMarkersInAreaRuntime` via `getPack<PackLike>()`
  - [ ] `parseInput(raw)` returns `{ query }` or `{ error }` with clear messages (validates `type` as non-empty string)
  - [ ] `createFindMarkersInAreaTool(runtime = default)` — schema with `x1/y1/x2/y2/x/y/cell/radius/type/limit` (oneOf-style validation is runtime, no top-level `required`)
  - [ ] Export `findMarkersInAreaTool` convenience instance
  - [ ] Constants `DEFAULT_FIND_MARKERS_IN_AREA_LIMIT` = 10000, `MAX_FIND_MARKERS_IN_AREA_LIMIT` = 100000

- [ ] `src/ai/tools/find-markers-in-area.test.ts`
  - [ ] Pure / seam describe — see plan test list
  - [ ] Tool surface describe — see plan test list
  - [ ] `defaultFindMarkersInAreaRuntime (integration)` describe stubs `globalThis.pack` and exercises rect + circle
  - [ ] Use `as unknown as { ... }` casts for fake packs

- [ ] `src/ai/index.ts`
  - [ ] `import { findMarkersInAreaTool } from "./tools/find-markers-in-area";`
  - [ ] Re-export create-fn, default runtime, types, pure-scanner, constants (alphabetical block)
  - [ ] Register `findMarkersInAreaTool` in `buildDefaultRegistry` — directly after `findNearestMarkerTool`

- [ ] `README_AI.md`
  - [ ] Add row after `find_nearest_marker` — describe both area forms, type filter, limit behaviour, example prompts, API key blurb

## Verification

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint` — still 7 warnings / 1 info / 0 errors
- [ ] Commit with scoped files (tool, test, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_207.md`, `aiplans/tasks_207.md`)
