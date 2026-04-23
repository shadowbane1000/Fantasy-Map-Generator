# Plan 148 — `set_wind` AI tool

## Use case

Set the prevailing wind direction for one or more latitude bands in the World
Configurator. Winds determine how precipitation is distributed during map
generation (westerlies / easterlies / northerlies / southerlies all derive
from `options.winds[tier]`). A user may want to reshape rainfall patterns
without running a full regenerate — this tool mirrors exactly what the
World Configurator's globe-arrow buttons and the "Restore winds" button do
internally.

Parallels already-merged Options-panel tools:

- `set_climate` — World Configurator temperature + precipitation knobs.
- `set_precipitation` — focused precipitation slider.
- `set_geography` — map size / latitude / longitude sliders.

## Option model (confirmed via grep)

### Shape
`options.winds` is a **6-element array of integers in degrees (0–360)**.

### Defaults
From `public/main.js:151`:
```js
winds: [225, 45, 225, 315, 135, 315],
```

### Tier semantics
From `public/main.js:986-991` (`calculatePrecipitation`):
```js
const windTier = (Math.abs(lat - 89) / 30) | 0; // 30d tiers from 0 to 5 from N to S
```

So the 6 tiers are 30°-wide latitude bands running North → South:

| tier | latitude band | default | cardinal (default) |
|------|---------------|---------|--------------------|
| 0    | 60°N – 90°N   | 225     | SW                 |
| 1    | 30°N – 60°N   |  45     | NE                 |
| 2    |  0°  – 30°N   | 225     | SW                 |
| 3    |  0°  – 30°S   | 315     | NW                 |
| 4    | 30°S – 60°S   | 135     | SE                 |
| 5    | 60°S – 90°S   | 315     | NW                 |

Wind angle is interpreted by `getWindDirections(tier)` (`public/main.js:1019-1028`):
- **W-ward** if `40 < angle < 140` (i.e. points roughly east → westerly wind)
- **E-ward** if `220 < angle < 320`
- **N-ward** if `100 < angle < 260`
- **S-ward** if `angle > 280 || angle < 80`

### UI / persistence (confirmed)

From `public/modules/ui/world-configurator.js:171-190` (`handleWindChange` /
`restoreDefaultWinds`):

```js
function handleWindChange() {
  const arrow = d3.event.target.nextElementSibling;
  const tier = +arrow.dataset.tier;
  options.winds[tier] = (options.winds[tier] + 45) % 360;
  const tr = parseTransform(arrow.getAttribute("transform"));
  arrow.setAttribute("transform", `rotate(${options.winds[tier]} ${tr[1]} ${tr[2]})`);
  localStorage.setItem("winds", options.winds);
  // ...auto-update branch
}

function restoreDefaultWinds() {
  const defaultWinds = [225, 45, 225, 315, 135, 315];
  // ...
  options.winds = defaultWinds;
  updateWindDirections();
  // ...
}
```

Triple-write pattern per tier:

1. **`options.winds[tier] = angle`** (source of truth for precipitation).
2. **DOM**: rotate the matching `<path data-tier="N">` inside `#globeWindArrows`
   via `transform="rotate(<angle> <cx> <cy>)"`, preserving the cx / cy from
   the element's existing transform (the configurator uses its
   `parseTransform` helper). `src/index.html:2666-2679` defines the six arrow
   paths (`data-tier="0"` .. `data-tier="5"`), each starting with a
   `rotate(<default> <cx> <cy>)` transform.
3. **localStorage**: `localStorage.setItem("winds", options.winds)` — stored
   as a comma-separated string; read back in
   `public/modules/ui/options.js:557` via
   `stored("winds").split(",").map(Number)`.

Validation caveats:
- `options.winds` is canonically length 6; we preserve length.
- Angles are canonically 0–359 inclusive. The UI normalises via `+ 45 % 360`,
  so we accept any finite number and normalise with `((n % 360) + 360) % 360`
  before writing.

## Tool surface

### Input schema
Accept **either** a single-tier write **or** a bulk "set all winds" /
"restore defaults" mode — one of:

- `band` (int 0–5) + `direction` (number; degrees) — single-tier.
- `bands` (array of `{band, direction}` objects) — multiple tiers in one call.
- `directions` (6-element array of numbers, degrees) — replace all tiers.
- `reset` (boolean; `true` → defaults `[225, 45, 225, 315, 135, 315]`).

Exactly one of these four forms must be present. Direction-as-cardinal
("N"/"NE"/…) is **not** accepted — the UI stores raw degrees and the
precipitation code compares raw degrees.

Aliases for `band`: accept string labels
`"polar_north" | "temperate_north" | "tropical_north" | "tropical_south" | "temperate_south" | "polar_south"`
mapping to indices 0..5. Also accept integer 0..5 directly.

### Output
`okResult({ok:true, changes: [{band, previousDirection, direction}, ...]})`.

### Passive
Winds feed precipitation distribution on the **next map regeneration** —
purely a settings change. No auto-regen.

## Runtime seam

```ts
interface SetWindRuntime {
  read(band: number): number | null;
  apply(band: number, direction: number): void;
}
```

`defaultSetWindRuntime.read`:
1. `window.options.winds[band]` if available.
2. Else parse `localStorage["winds"]` (comma-joined) at position `band`.
3. Else `null`.

`defaultSetWindRuntime.apply`:
1. Ensure `window.options.winds` is a 6-length array; lazily create from
   defaults if absent.
2. Write `options.winds[band] = normalisedAngle`.
3. Best-effort DOM update: find `document.querySelector('#globeWindArrows path[data-tier="<band>"]')`,
   parse its current transform to pull cx/cy, rotate to the new angle.
4. Persist `localStorage.setItem("winds", options.winds.join(","))`.

(The join is safe because the UI writes `options.winds` directly and the
implicit Array→string coercion also comma-joins.)

## Files

- Create `src/ai/tools/set-wind.ts`
- Create `src/ai/tools/set-wind.test.ts`
- Modify `src/ai/index.ts` (import + re-export + register in
  `buildDefaultRegistry`, near `setPrecipitationTool`)
- Modify `README_AI.md` (row near `set_climate` / `set_precipitation`)

## Tests

- Seam tests (mock runtime):
  - Valid single-tier call normalises to `{ok, changes:[{band, previousDirection, direction}]}`.
  - `bands` bulk: multiple tiers applied, each apply called once.
  - `directions` length-6 bulk: all six applied in order.
  - `reset: true` applies the 6 canonical defaults.
  - Band alias strings resolve correctly.
  - Rejects: no input form, multiple forms, band out of range, non-finite
    direction, wrong-length `directions`, non-array `bands`, malformed
    `bands` items.
  - `apply` throwing surfaces as `errorResult` and aborts the remaining writes.
  - Direction normalisation: `-45` → `315`, `405` → `45`, `720.5` → `0.5`.

- Integration block with `defaultSetWindRuntime`:
  - Installs `globalThis.document` (getElementById + querySelector),
    `globalThis.localStorage` (getItem/setItem), `globalThis.options.winds`.
  - Verifies `options.winds[tier]` mutation, DOM transform rewrite, and
    localStorage string.
  - Verifies `read` returns previous value from `options.winds`, then falls
    back to localStorage, then `null`.
  - Swallows missing DOM (no throw) but still persists.
  - Errors when localStorage is unavailable.

## Baseline

- Lint: 7 warnings / 1 info / 0 errors.
