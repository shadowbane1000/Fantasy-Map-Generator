# Tasks 209 — `list_marker_types`

## Implementation

- [ ] `src/ai/tools/list-marker-types.ts`
  - [ ] `MarkerTypeCount` = `{ type: string; count: number }`
  - [ ] `MarkerTypesSummary` = `{ types: MarkerTypeCount[]; total: number }`
  - [ ] `MarkerTypesPackLike` = `{ markers?: RawMarker[] }`
  - [ ] Pure `readMarkerTypesFromPack(pack)`:
    - [ ] returns `null` when `pack` or `pack.markers` missing
    - [ ] skips `removed: true` and `i === 0` markers
    - [ ] buckets `type` missing / non-string / empty / whitespace-only → `"untyped"`
    - [ ] non-empty type strings preserve case (no normalization)
    - [ ] sorts types by `count` desc, then `type` asc, emits `total`
  - [ ] `defaultMarkerTypesRuntime` reads `window.pack` via `getPack<MarkerTypesPackLike>()`
  - [ ] `createListMarkerTypesTool(runtime = default)` — empty `input_schema`; on execute, calls runtime and returns `okResult({ types, total })` or `errorResult("Map is not ready yet; cannot list marker types. Wait for the 'map:generated' event on window.")`
  - [ ] Export `listMarkerTypesTool` convenience instance

- [ ] `src/ai/tools/list-marker-types.test.ts`
  - [ ] Pure scanner describe — see plan test list
  - [ ] Tool surface describe — see plan test list
  - [ ] `defaultMarkerTypesRuntime (integration)` describe stubs `globalThis.pack` via `as unknown as { pack?: unknown }`, exercises happy path + not-ready path

- [ ] `src/ai/index.ts`
  - [ ] `import { listMarkerTypesTool } from "./tools/list-marker-types";`
  - [ ] Re-export `createListMarkerTypesTool`, `defaultMarkerTypesRuntime`, types (`MarkerTypeCount`, `MarkerTypesPackLike`, `MarkerTypesRuntime`, `MarkerTypesSummary`), `listMarkerTypesTool`, `readMarkerTypesFromPack` — alphabetical block directly after `list-marker-pins`
  - [ ] Register `listMarkerTypesTool` in `buildDefaultRegistry` directly after `listMarkersTool`

- [ ] `README_AI.md`
  - [ ] Add row after `list_markers` — describe scope vs. `list_markers` and `list_marker_pins`, mention `"untyped"` bucket, sort order, example prompts, API key blurb

## Verification

- [ ] `npm run lint` — still 7 warnings / 1 info / 0 errors
- [ ] `npm run build`
- [ ] `npm test` — 3113 + new tests all pass
- [ ] Commit with scoped files (tool, test, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_209.md`, `aiplans/tasks_209.md`)
