# Plan 141 — `add_zone` AI tool

## Use case
Create a new zone entry in `pack.zones` — the same side-effect as clicking the "Add zone" button (`zonesAdd`) in the Zones Editor. The editor creates an empty zone with a default name, type, and color; cells are assigned later via click-on-map. For AI use we also accept an optional pre-assigned `cells` array so a zone can be seeded with its region in one call.

## Zone shape (confirmed)

From `public/modules/ui/zones-editor.js:371` (`addZonesLayer`) — the canonical "add zone" path:

```js
function addZonesLayer() {
  const zoneId = pack.zones.length ? Math.max(...pack.zones.map(z => z.i)) + 1 : 0;
  const name = "Unknown zone";
  const type = "Unknown";
  const color = "url(#hatch" + (zoneId % 42) + ")";
  pack.zones.push({i: zoneId, name, type, color, cells: []});

  zonesEditorAddLines();
  drawZones();
}
```

This matches `RawZone` in `src/ai/tools/_shared/pack-types.ts:197`:

```ts
export interface RawZone {
  i: number;
  name?: string;
  type?: string;
  color?: string;
  cells?: number[];
  hidden?: boolean;
  removed?: boolean;
}
```

Fields to write on the new zone:
- `i` — fresh id computed as `pack.zones.length ? Math.max(...pack.zones.map(z => z.i)) + 1 : 0`. Matches the editor exactly; tolerates tombstoned / gapped ids. If `pack.zones` is empty we start at 0 (also matches the editor — the editor's generator writes `i: pack.zones.length` while `addZonesLayer` reads from ids, so the first-ever zone is 0 either way).
- `name` — required input (string, non-empty after trim). Editor default is "Unknown zone"; we demand a real value.
- `type` — required input (string, non-empty after trim). Editor default is "Unknown"; we demand a real value because the type is what makes a zone meaningful (Invasion / Disease / Disaster / etc.).
- `color` — optional. Defaults to `url(#hatch${i % 42})` like the editor. Accepts hex / rgb()/rgba()/hsl()/hsla() / named CSS color / `url(#...)` references.
- `cells` — optional `number[]`. Defaults to `[]`. Every entry must be a non-negative integer and must exist in `pack.cells.i` (validated at the tool layer before mutation).

There is **no** `description` field on `RawZone` (the Zones Editor's input labelled "Zone description" actually writes `zone.name` — see `changeDescription` at `zones-editor.js:400`). So the caller's `description` maps to `zone.name`. Since we already require `name`, we do not also accept a separate `description` param — that would be ambiguous. The README and tool description will flag this alias for clarity.

## Tool contract

Inputs:
- `name` (string, required) — the zone's description / label (rendered in the Zones Overview "Description" column).
- `type` (string, required) — free-form type (Invasion / Rebels / Proselytism / Crusade / Disease / Disaster / Eruption / Avalanche / Flood / …).
- `color` (string, optional) — CSS color or `url(#...)` pattern reference. Defaults to `url(#hatch${i % 42})`.
- `cells` (number[], optional) — cell indices to assign. Defaults to `[]`.

Outputs:
```
{
  ok: true,
  i: number,
  name: string,
  type: string,
  color: string,
  cells: number[]
}
```

## Validation / rejection rules

- `name` missing / non-string / empty after trim → error.
- `type` missing / non-string / empty after trim → error.
- `color`, if provided: non-string / empty after trim → error. We accept both CSS colors and `url(...)` references, so we cannot reuse `isValidCssColor` from `set-state-color.ts` directly — instead we use a permissive check: non-empty trimmed string. This matches the editor which happily stores `url(#hatch1)` values.
- `cells`, if provided:
  - must be an array,
  - every entry must be `Number.isInteger(v) && v >= 0`,
  - every entry must be a valid cell id (`< pack.cells.i.length` when `pack.cells.i` is available),
  - duplicates are silently de-duplicated.
- Runtime-level: if the derived id `i` is already present in `pack.zones` (shouldn't happen with `max + 1`, but defensive) → error.
- If `pack.zones` is missing (not an array) → runtime throws → tool returns `errorResult`.

## Runtime-seam split (pattern match for `add-marker`)

```ts
interface AddZoneInput {
  name: string;
  type: string;
  color?: string;
  cells?: number[];
}

interface NewZone {
  i: number;
  name: string;
  type: string;
  color: string;
  cells: number[];
}

interface AddZoneRuntime {
  validateCells(cells: number[]): { ok: true } | { ok: false; error: string };
  add(input: AddZoneInput): NewZone;
}
```

- `validateCells` reads `pack.cells.i` to check upper bound. Separated from `add` so the seam tests can exercise the validation path independently.
- `add` computes `i`, assembles the `RawZone`, pushes onto `pack.zones`, then best-effort calls `drawZones()`.
- The tool layer does type / required-field validation before calling the runtime (mirroring `add-marker`).

## Integration test (globalThis seam)

Mimic `add-marker.test.ts`'s integration block:
- Install `globalThis.pack` with `zones: []` and `cells: { i: new Uint32Array(10) }` (length-10 cells array).
- Install `globalThis.drawZones` as a `vi.fn`.
- Verify:
  - minimal call (just name + type) pushes a zone with `i: 0`, default `url(#hatch0)` color, empty `cells`.
  - second call computes `i: max + 1` when a zone with `i: 5` already exists.
  - explicit `color` and `cells` are preserved.
  - cells out of bounds (e.g. `999`) → error, no push, no redraw.
  - duplicate cells silently collapsed.
  - missing `pack.zones` → error.
  - `drawZones` throwing is swallowed (data mutation still happens).

Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

## Files touched

- `src/ai/tools/add-zone.ts` (new)
- `src/ai/tools/add-zone.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near the other `add_*` tools
