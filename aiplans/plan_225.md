# Plan 225 — `find_zones_by_type`

## Goal

Add a read-only AI tool that lists every active zone whose `zone.type`
matches a caller-supplied string (case-insensitive exact match).
Parallels `find_markers_by_type` for markers and complements `list_zones`
(which is paginated and may also filter by type, but paginates and does
not return a clean "every matching zone" shape). One call returns all
zones of the asked-for type, ready to feed into `get_zone_info` /
`set_zone_type` / `set_zone_color` / `set_zone_visibility` /
`remove_zone`.

## Position in the tool surface

- `list_zones` → paginated enumeration of every zone with optional
  `type` / `include_hidden` filters.
- `get_zone_info` → per-zone detail for a single zone.
- **`find_zones_by_type`** → every zone of a given type, no pagination.
  The many-zone, type-keyed companion to `get_zone_info`, and the
  zone-side parallel of `find_markers_by_type`.

## Shape

### Inputs

- `type` (string, required). Case-insensitive exact match against
  `zone.type` after trimming whitespace. Non-empty required.
- `limit` (integer, optional, default 10000, max 100000) — caps the
  returned `zones` array. `count` still reports the full unlimited
  total.

### Output

```
{
  ok: true,
  type,         // the normalised type string the scan used ("invasion", …)
  zones: [{ i, name, type, color, cells_count, hidden }],
  count,
}
```

- `type` on each hit is the zone's **original** `zone.type` string,
  preserving its casing (or `null` when the zone has no string type —
  though, in practice, non-matching types are filtered out).
- `name` is `zone.name` when it's a string, else `""`.
- `color` is `zone.color` when it's a string, else `null`.
- `cells_count` is `zone.cells.length` when `cells` is an array, else 0.
- `hidden` is `!!zone.hidden`.
- `count` is the full unlimited total matching zones (even when the
  response `zones` array is truncated by `limit`).

### Error modes (structured `errorResult` — `ok: false`)

- `"not-ready"` — `pack` or `pack.zones` is missing.
- Invalid argument shapes: `type` missing / not a string / empty or
  whitespace-only; `limit` not an integer in `[1, 100000]`.

### Skipped zones (silently, not errors)

- `z.removed === true`.
- Null / undefined entries in the array.

Note: zone ids are non-contiguous and start at 0 — `zone.i === 0` is a
real zone (unlike markers / states which reserve 0 as a placeholder).
`list_zones` treats id 0 as a real zone, and we match that here.

## Implementation notes

- `ZonePackLike` interface declaring `zones?: RawZone[]`.
- Normalised `type` filter is a non-empty lowercased string (after
  trimming).
- Match rule per zone:
  `typeof z.type === "string" && z.type.trim().toLowerCase() === filter`.
- Pure scanner `findZonesByTypeInPack(pack, query)` returns
  `FindZonesByTypeResult = FindZonesByTypePayload | "not-ready"`.
- Runtime seam: `FindZonesByTypeRuntime` +
  `defaultFindZonesByTypeRuntime` wraps
  `findZonesByTypeInPack(getPack<ZonePackLike>(), query)`.
- Factory `createFindZonesByTypeTool(runtime?)` + exported
  `findZonesByTypeTool = createFindZonesByTypeTool()`.
- Constants `DEFAULT_FIND_ZONES_BY_TYPE_LIMIT = 10000`,
  `MAX_FIND_ZONES_BY_TYPE_LIMIT = 100000`.
- Re-use `errorResult`, `okResult`, `getPack`, `type RawZone` from
  `./_shared`.

## Tests

Vitest file `find-zones-by-type.test.ts` in three describe blocks,
mirroring `find-markers-by-type.test.ts`:

1. **Pure scanner**
   - Matches zones by type case-insensitively (all invasions, any
     casing).
   - Preserves original casing in each hit's `type` field.
   - Skips `removed: true` zones.
   - Tolerates null entries in the array.
   - `limit` truncates `zones` but `count` reports the full total.
   - Empty result → `zones: []`, `count: 0`, `type` echoed.
   - `"not-ready"` when `pack` or `pack.zones` is missing.
   - Includes `zone.i === 0` (zones have non-contiguous ids starting
     at 0 — 0 is a real zone).
   - `cells_count` reports `zone.cells.length` (or 0 when absent /
     non-array).

2. **Tool surface**
   - Rejects missing / non-string / empty / whitespace-only `type`.
   - Rejects out-of-range `limit` (0, > MAX, non-integer, non-number,
     negative, NaN).
   - Accepts `limit` at the boundaries (1 and MAX).
   - Surfaces `"not-ready"` from the runtime as `errorResult` text.
   - Happy-path returns `{ok: true, type, zones, count}`.
   - `limit` honored end-to-end.
   - Exported `findZonesByTypeTool` has the expected schema shape
     (`type` required, `limit` optional).
   - `DEFAULT_FIND_ZONES_BY_TYPE_LIMIT` / `MAX_*` constants exposed.

3. **`defaultFindZonesByTypeRuntime` integration**
   - Stubs `globalThis.pack` via
     `globalThis as unknown as { pack?: unknown }`.
   - Asserts a typed query reads the real pack.
   - Stubbing `pack = undefined` → `"not-ready"` → tool surfaces
     structured error.

## Registration

- Import next to `findStatesByCultureTool` (alphabetically) in
  `src/ai/index.ts`.
- Re-export public API alphabetically with the other `find-*` blocks.
- `registry.register(findZonesByTypeTool)` near `listZonesTool` in
  `buildDefaultRegistry`.

## Docs

- New row in `README_AI.md`, placed next to `list_zones` /
  `get_zone_info`. Describes the exact matching rule, `limit`, the
  response shape, and error modes. Ends with the `Requires an Anthropic
  API key (see "Getting an API key" below).` line so the row is
  API-key-aware.

## Verification

- `npm run build` succeeds (TS strict, no fallout).
- `npm test` — all existing tests plus the new file pass.
- `npm run lint` matches the baseline (7 warnings / 1 info / 0
  errors).

## Commit

`feat(ai): add find_zones_by_type tool` + 1-2 line body explaining
the type-only zone filter.
