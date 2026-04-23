# Plan 88 — remove_province AI tool

## Use case

The Provinces Editor exposes a trash-icon button per row
that calls `removeProvince(i)`
(`public/modules/ui/provinces-editor.js:476`). The delete
action:

1. Clears every `pack.cells.province[cell] = 0` that
   referenced this province.
2. Removes the id from `pack.states[state].provinces`.
3. Calls `unfog("focusProvince" + p)` to drop any focus
   highlight.
4. Removes `#provinceCOA{i}` from the DOM.
5. Removes the `emblems #provinceEmblems > use[data-i={i}]`.
6. Writes `pack.provinces[p] = {i: p, removed: true}`
   (the tombstone pattern — keeps the array index stable,
   like every other removed entity).
7. Removes `#province{i}` / `#province-gap{i}` under
   `#provincesBody`.
8. Calls `drawBorders()` if the borders layer is on.
9. Refreshes the editor panel.

The AI chat has `remove_burg`, `remove_marker`,
`remove_note`, `remove_regiment`, `remove_route`,
`remove_zone`, `remove_biome` — but no way to delete a
province. This tool fills that gap.

## Scope

Add one tool: `remove_province(province)`.

- `province` — id (> 0) or case-insensitive name /
  fullName.
- Rejects id 0 (the placeholder), removed entries.
- Performs all 9 side-effects above, best-effort for DOM
  / drawBorders.
- Returns `{ i, name, fullName, state }` in the ok
  payload so the caller knows what was deleted.

## Implementation

1. **New file `src/ai/tools/remove-province.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getPack, getPackCollection, okResult,
     parseEntityRef; types RawProvince, RawState from
     `./_shared`.
   - Also needs pack.cells.province — use a local
     `PackWithProvinceCells` shape.
   - `RemoveProvinceRef { i, name, fullName, stateId }`.
   - `RemoveProvinceRuntime { find, remove }`.
   - `defaultRemoveProvinceRuntime`:
     - find: findEntityByRef on `provinces`; return
       null if not found or removed. Carry over state id.
     - remove(ref):
       - `pack.cells.province` walk: zero entries === i.
       - Splice from `pack.states[stateId].provinces` if
         present.
       - `unfog(` + best-effort.
       - DOM: remove `#provinceCOA{i}`,
         `#provinceEmblems use[data-i='{i}']`,
         `#provincesBody #province{i}` and
         `#provincesBody #province-gap{i}`.
       - Mark `pack.provinces[i] = { i, removed: true }`
         to match the UI's tombstone.
       - `drawBorders()` best-effort (no layer-on check —
         calling it when the layer is hidden is cheap; the
         UI conditional is an optimization, not a
         correctness requirement).
   - Schema: `province` (int|string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `remove-province.test.ts`:
   - Unit (stubbed runtime):
     - removes by numeric id
     - resolves by case-insensitive name
     - rejects invalid ref
     - rejects unknown province
     - surfaces runtime errors
   - Integration (`defaultRemoveProvinceRuntime`):
     - stubs `globalThis.pack = { cells: { province:
       [0,1,1,2,0,1] }, provinces: [...], states: [...]
       }`.
     - stubs `globalThis.unfog`, `drawBorders`,
       `document` with a minimal fake for
       querySelector/getElementById + remove().
     - removes a province:
       - `pack.cells.province[k]` becomes 0 for matching
         indices.
       - state's `.provinces` no longer contains the id.
       - `pack.provinces[id].removed === true`.
       - unfog called with `focusProvince{id}`.
       - drawBorders called once.

4. **README_AI.md** — row near `remove_burg`.

## Verification

- `npm test -- --run src/ai/tools/remove-province` green.
- `npm test -- --run` — 1095 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired, documented.
- Mutates `pack.cells.province`, `pack.provinces`,
  `pack.states[*].provinces` as the UI does.
- Best-effort DOM cleanup + drawBorders.
- Rejects invalid / unknown / already-removed
  provinces.
