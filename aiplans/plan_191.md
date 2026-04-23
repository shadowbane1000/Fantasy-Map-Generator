# Plan 191: `get_zone_info` AI tool

## Use case
Provide a `get_zone_info` read-only tool that returns detail for a single zone,
parallel to `get_state_info` / `get_burg_info` / etc. Complements the already
existing `list_zones` overview by surfacing full per-zone detail including the
cell membership list.

## Fields returned
- `i` — zone id (matches `zone.i`; zones have non-contiguous ids starting at 0)
- `name` — zone name (description), string (empty-string if unset)
- `type` — free-form type label (Invasion / Rebels / Crusade / …), or null
- `color` — CSS color / pattern ref, or null
- `cells` — number[] of cell indices in the zone (truncated by `limit`)
- `cells_count` — length of the full cells array (pre-truncation)
- `hidden` — boolean zone visibility flag (`!!zone.hidden`)

## Inputs
- `zone` (required) — `integer | string`. Matches by `zone.i` (non-contiguous)
  or case-insensitive name via the shared `findZoneByRef` helper
  (re-exported from `set-zone-visibility.ts`).
- `limit` (optional) — integer in `[0, 10000]`, default `10000`. If the zone's
  cell list is larger than `limit`, the returned `cells` array is truncated;
  `cells_count` still reports the full length.

## Design
Mirror `get-state-info.ts` structure:
- `readZoneInfoFromPack(pack, ref, limit)` → pure function returning
  `ZoneInfo | "not-ready" | "not-found"`.
- `ZoneInfoRuntime` seam with `defaultZoneInfoRuntime.readZone(ref, limit)`
  that pulls `getPack<ZoneInfoPackLike>()`.
- `createGetZoneInfoTool(runtime = default)` and exported
  `getZoneInfoTool`.
- Input validation: `parseEntityRef(input.zone, "zone")` would reject `0`,
  but zones **can** have id 0 — so we write a local validator that accepts
  non-negative integer ids OR non-empty strings.

## Zone id 0 handling
Unlike states / burgs / religions where index 0 is a placeholder, zones are
created starting at id 0 (see `add-zone.ts` — `i = zones.length ? max+1 : 0`).
The tool must therefore accept `zone: 0` and look it up via `findZoneByRef`.
Removed zones (`z.removed`) are skipped implicitly: `findZoneByRef` iterates
through all zones and matches on `i`, but we filter `z.removed` in our own
read path.

## Registration
Add to `src/ai/index.ts`: import `getZoneInfoTool`, re-export
`{ getZoneInfoTool, createGetZoneInfoTool }`, and `registry.register(...)`
in `buildDefaultRegistry()` near `getMapInfoTool`.

## Documentation
Add README_AI.md row near the other `get_*` entries. Description must include
`Requires an Anthropic API key (see "Getting an API key" below).` sentence
and reference use cases.

## Tests
Two `describe` blocks following `get-state-info.test.ts`:
1. Pure / seam — pack fixture with several zones (some removed, some with
   many cells, zone id 0 allowed, hidden flag set on one).
2. `defaultZoneInfoRuntime` integration block that sets `globalThis.pack` via
   `as unknown as { pack?: unknown }` casts.

Test matrix:
- returns all fields for a populated zone (including zone id 0)
- type / color are null when missing
- hidden is boolean (true / false / missing)
- cells echoes the array and `cells_count` matches
- `limit` truncates the cells array but `cells_count` reports full length
- `limit = 0` returns an empty cells array with full `cells_count`
- default limit caps at 10000
- string ref resolves by case-insensitive name
- numeric id 0 resolves (unlike states)
- returns `not-found` for unknown ref / removed zone
- returns `not-ready` when pack / pack.zones is missing
- tool surfaces not-ready / not-found as structured errors
- tool rejects negative / non-integer / empty-string refs
- tool rejects non-integer / out-of-range `limit`
- exported `getZoneInfoTool` has correct name / schema
