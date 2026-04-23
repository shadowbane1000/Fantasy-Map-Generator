# Plan 204 — list_emblem_shapes AI tool

## Goal
Add a read-only `list_emblem_shapes` tool that returns every coat-of-
arms shield shape id accepted by `set_culture_shield`,
`regenerate_burg_coa({shield})`, `regenerate_state_coa({shield})`,
`regenerate_province_coa({shield})`, and — when combined with the
diversiform keys — `set_default_emblem_shape`.

## Why
The shield-shape pool is derived from `src/modules/emblem/shields.ts`
(`shields` object, skipping the meta `types` key). `set-culture-shield`
already exposes a sorted read of this via the `CULTURE_SHIELDS` const.
Every tool that accepts a shield shape (`set_culture_shield`,
`set_default_emblem_shape`, the COA regenerators) currently dumps the
full list in its error payload only; there is no way for an agent to
discover the catalogue without triggering an error. This is the
discovery companion of those writes — identical in spirit to
`list_marker_pins` (plan, companion of `set_marker_pin`),
`list_style_presets` (plan 200), `list_cultures_sets` (plan 201), and
`list_regiment_units` (plan 203).

## Data sources
- `src/modules/emblem/shields.ts` — the `shields` map. Groups
  (`basic`, `regional`, `historical`, `specific`, `banner`, `simple`,
  `fantasy`, `middleEarth`) each contain `{ shapeName: weight }`
  entries. `types` is the meta group (group-selection weights) and is
  excluded.
- `src/ai/tools/set-culture-shield.ts` already exports
  `CULTURE_SHIELDS` — the canonical sorted, deduped list of shape ids.
  **Reuse this const** — do not duplicate the derivation. Plan's
  source of truth stays in one place.

No `pack`/DOM/state reads. Pure constant lookup. A trivial runtime
seam keeps the tool consistent with the rest of the listing family
and makes it easy to stub in tests.

## Tool shape
- Name: `list_emblem_shapes`.
- Description: states this lists every coat-of-arms shield shape
  accepted by `set_culture_shield`, per-entity regenerators'
  `shield` arg, and (combined with `culture` / `state` / `random`) by
  `set_default_emblem_shape`. Mentions source (`src/modules/emblem/shields.ts`)
  and that ids are case-insensitive. Flags read-only + API-key
  requirement like siblings.
- Input schema: no properties.
- Output:
  ```
  {
    ok: true,
    shapes: [
      {id: "banner", name: "banner"},
      {id: "baroque", name: "baroque"},
      ...
    ],
    count: N,
  }
  ```
  `id === name === canonical shape key`. Order follows the sorted
  `CULTURE_SHIELDS` array (lexicographic ascending — what
  `set-culture-shield.ts:buildShapeList()` already produces).

## Runtime seam
`EmblemShapesListRuntime` with `readShapeIds(): readonly string[]`.
Default returns `CULTURE_SHIELDS` verbatim. Tests stub the runtime to
confirm ordering, count, no-op behaviour.

## Validation
Input is ignored. No failure modes (the list is a compile-time
constant — always non-empty).

## Response shape
```
{
  ok: true,
  shapes: [
    {id: "banner", name: "banner"},
    {id: "baroque", name: "baroque"},
    {id: "boeotian", name: "boeotian"},
    ...
    {id: "wedged", name: "wedged"},
  ],
  count: ~40,
}
```
Exact count depends on `shields.ts`; currently 41 entries (confirmed
by walking the groups minus the `types` key).

## Testing
Mirror `list-marker-pins.test.ts`:
- Unit (factory with injected runtime):
  - Default runtime returns every entry from `CULTURE_SHIELDS` in the
    same order.
  - `count` equals `shapes.length`.
  - Accepts `{}` / `null` / `undefined` input uniformly.
  - Honours custom stubbed subsets preserving supplied order.
  - Throwing runtime propagates (ToolRegistry wraps upstream).
- Integration (`defaultEmblemShapesListRuntime` block):
  - Shipped `listEmblemShapesTool` returns the shield list exactly
    equal to `CULTURE_SHIELDS`.
  - Contains known keys (`heater`, `swiss`, `wedged`, `noldor`,
    `round`, `fantasy1`) and does **not** contain the meta `types`
    key.
  - Every id is unique.
  - Every id is a non-empty string.

## Wiring
- Register in `src/ai/index.ts` near `setCultureShieldTool` /
  `setDefaultEmblemShapeTool` registration.
- Barrel re-export `createListEmblemShapesTool`,
  `defaultEmblemShapesListRuntime`, `type EmblemShapeEntry`,
  `type EmblemShapesListRuntime`, and `listEmblemShapesTool`.
- README_AI.md row near `set_culture_shield` /
  `set_default_emblem_shape` in the pipe table — single-line row with
  description + examples + API-key note.

## Out of scope
- No change to `set_culture_shield`, `set_default_emblem_shape`, or
  any regenerator.
- No new shield groups, aliases, or classification metadata.
- No grouping of shapes by `basic`/`regional`/etc. in the tool
  output — keep it flat like `list_marker_pins`. Shield groups are
  documented in the description for set_culture_shield's own error
  payload already.

## Verify
- `npm run build` — `tsc && vite build` both clean.
- `npm test` — baseline 3008 → 3008 + new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
