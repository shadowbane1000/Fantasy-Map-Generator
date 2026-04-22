# Plan 77 — set_province_capital AI tool

## Use case

The Provinces Editor (`changeCapital` at
`public/modules/ui/provinces-editor.js:588`) sets which burg is the
capital of a province:

```
province.center = burgs[burgId].cell;
province.burg = burgId;
```

The UI's dropdown lists only burgs that belong to the same state as
the province. Users promote a different burg when the original
capital falls out of favour.

The chat has `rename_province` / `set_province_color` but no
capital setter. `set_state_capital` already exists for states;
this is the province analogue.

## Scope

Add one tool: `set_province_capital(province, burg)`.

- `province` required — id or case-insensitive name/fullName via
  `findEntityByRef`.
- `burg` required — id or case-insensitive name via
  `findEntityByRef`. Must belong to the province's state
  (`burg.state === province.state`). Refuses otherwise with a
  message suggesting reassignment.
- Writes `province.burg = burg.i` and `province.center =
  burg.cell`.
- No DOM/SVG update necessary beyond the Provinces Editor
  rerendering on next open; the map itself doesn't show
  province capital markers distinctly.

## Implementation

1. **New file `src/ai/tools/set-province-capital.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getPackCollection`, `okResult`, `parseEntityRef`, type
     `RawBurg`, `RawProvince`.
   - `ProvinceCapitalProvince { i, name, stateId,
     previousBurgId, previousBurgName }`.
   - `ProvinceCapitalBurg { i, name, state, cell }`.
   - `ProvinceCapitalRuntime { findProvince, findBurg, apply }`.
   - `defaultProvinceCapitalRuntime`:
     - `findProvince`: findEntityByRef on provinces, return
       shape with `stateId: province.state ?? 0`,
       `previousBurgId`, `previousBurgName` (look up the burg
       name).
     - `findBurg`: findEntityByRef on burgs, return `i, name,
       state, cell`.
     - `apply(provinceId, burgId, cell)`: lookup province +
       burg; throw if missing/removed; write
       `province.burg = burgId; province.center = cell`.
   - Tool schema: `province` (int|string required), `burg`
     (int|string required).
   - Execute: parseEntityRef both; find each → 404; refuse
     province 0 or burg 0; refuse when `burg.state !==
     province.stateId` (give a clear error); try apply; respond.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-province-capital.test.ts`**:
   - Runtime-injected:
     - Sets capital.
     - Match by name.
     - Refuse province 0 / burg 0.
     - Refuse cross-state pair.
     - Surface runtime failures.
     - Reject invalid refs.
   - Default-runtime integration:
     - Stub `globalThis.pack.provinces` + `pack.burgs` with a
       few entries; apply → province.burg + province.center
       updated.
     - Cross-state pair → error, no mutation.

4. **README_AI.md** — row near `rename_province`.

## Verification

- `npm test -- --run src/ai/tools/set-province-capital` green.
- `npm test -- --run` — 942 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can promote a burg to be a province's capital, provided the
  burg is in the same state.
- Parallel to `set_state_capital` semantics.
