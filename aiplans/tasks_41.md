# Tasks 41 — list_zones AI tool

## Task 1 — Extend shared pack-types

- [ ] In `src/ai/tools/_shared/pack-types.ts`, add:
  ```ts
  export interface RawZone {
    i: number;
    name?: string;
    type?: string;
    color?: string;
    cells?: number[];
    hidden?: boolean;
  }
  ```
- [ ] Add `zones?: RawZone[];` to the `Pack` interface.
- [ ] Re-export `RawZone` from `src/ai/tools/_shared/index.ts`.

## Task 2 — Implement list-zones tool

- [ ] Create `src/ai/tools/list-zones.ts` exporting:
  - `ZoneSummary` type (`i, name, type, color, cells: number, hidden:
    boolean`).
  - `ZonePackLike` interface (`zones?: RawZone[]`).
  - `readZonesFromPack(pack)` helper returning `ZoneSummary[] | null`.
  - `ZonesRuntime` interface with `readZones(): ZoneSummary[] | null`.
  - `defaultZonesRuntime` using `getPack<ZonePackLike>()`.
  - `createListZonesTool(runtime)` via `createPaginatedListTool`.
  - `listZonesTool` default instance.
- [ ] Tool input schema: `limit` (integer 1-500), `offset` (integer
  >=0), `type` (string), `include_hidden` (boolean).
- [ ] `parseFilters`: validate `type` is a non-empty string when
  provided, `include_hidden` is a boolean when provided.
- [ ] `applyFilters`: if `type` filter provided, keep only
  `z.type.toLowerCase() === filterType`. If `include_hidden` is false
  or omitted, filter out `z.hidden`. Echo the applied filters.

## Task 3 — Register in tools barrel

- [ ] In `src/ai/tools/index.ts`, import `listZonesTool` from
  `./list-zones` and add it to the exported `TOOLS` array.

## Task 4 — Write tests

- [ ] Create `src/ai/tools/list-zones.test.ts` covering:
  - Returns `null` error payload when pack.zones is missing.
  - Returns empty list when pack.zones is empty.
  - Maps name/type/color/hidden and returns cells as a count (not the
    array).
  - Default call excludes hidden zones.
  - `include_hidden: true` returns hidden ones.
  - `type` filter matches case-insensitively (e.g. "INVASION" vs
    "invasion").
  - Unknown `type` filter returns empty items + echo filters.
  - Pagination (limit + offset) behaves as expected.
  - Invalid inputs (non-string `type`, non-boolean `include_hidden`)
    return `isError: true`.

## Task 5 — Documentation

- [ ] In `README_AI.md`, under the tool catalogue, add a row for
  `list_zones` with a one-line description and one example prompt
  ("Tell me about the current zones on the map" or similar).

## Task 6 — Verify

- [ ] `npm test -- --run src/ai/tools/list-zones` passes.
- [ ] `npm test -- --run` — entire suite passes (no regressions).
- [ ] `npm run lint` — warnings + info count does not exceed baseline
  (7 warnings / 1 info).
- [ ] `npm run build` — succeeds.

## Task 7 — Commit

- [ ] Stage new tool + test + pack-types edit + barrel edit + README
  edit + aiplans files and commit with a concise message
  (`feat(ai): add list_zones tool`).

## Verification that tasks accomplish the plan

- Plan step 1 (new tool file + runtime + filter schema) → Tasks 1, 2.
- Plan step 2 (barrel registration) → Task 3.
- Plan step 3 (tests modelled on list-rivers) → Task 4.
- Plan step 4 (README) → Task 5.
- Plan "Verification" section → Task 6.

## Verification that plan accomplishes the use case

- Use case: "AI needs to list zones like every other pack collection".
- Plan delivers a `list_zones` tool registered in the tool catalogue
  returning summaries of every zone, with pagination and type /
  visibility filters that match the Zones Overview UI's own filter
  controls.
- Once wired, the chat controller will pass it to Anthropic as an
  available tool on every turn, letting the model call it to answer
  zone-related questions.

## Verification that tests prove the use case

- `readZonesFromPack` is the only point the tool reads the world state,
  and it is covered by: null pack, empty zones, hidden exclusion,
  `include_hidden` override, type filter case-insensitivity, pagination.
- The tool factory + runtime seam mirrors list-rivers, which is already
  validated against the shared paginated-list-tool tests.
- Invalid input rejection matches the behaviour other list tools are
  tested for, so the AI cannot send malformed filters and silently
  succeed.
