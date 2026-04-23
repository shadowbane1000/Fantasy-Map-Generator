# Plan 144 — `add_province` AI tool

## Use case
Create a new province by promoting an existing burg to be its capital. Mirrors the Provinces Editor's "Add province" handler (`public/modules/ui/provinces-editor.js:1006 addProvince`, invoked after `enterAddProvinceMode`). The editor flow lets the user click a land cell inside a state; the clicked cell becomes the province center. If the cell already has a burg, the new province's `burg` points at it and the short name is copied from the burg; otherwise the short name is rolled via `Names.getState(Names.getCultureShort(c), c)`.

For the AI seam we keep it simple and composable:

- The caller **must** pass `capital` (a burg ref — numeric id or case-insensitive name). That burg's `cell` becomes the province's `center`.
- This keeps the tool composable with `add_burg`: to add a brand-new province in a region without a burg, the model calls `add_burg` first, then `add_province` with that burg id as the capital.

### Scope boundary — IMPORTANT

This is a **single-cell province**. We do not perform territory growth (no BFS over the capital's neighbours, no `adjustProvinces`, no post-hoc statistics recomputation). The new province owns exactly the capital burg's cell. Full territory expansion is deliberately **out of scope** for this iteration — the user can follow up with `regenerate_domain(domain="provinces")` or equivalent for a full re-grow.

Consequences of the single-cell scope:
- We **do not** copy the editor's neighbour loop (`cells.c[center].forEach(...)` assigning unclaimed same-state land cells). That loop is more of a convenience — if the capital cell is neighbouring other same-state cells that aren't owned by other provinces, they get absorbed. We skip it to keep the write shape simple and predictable.
- `province.coa` is best-effort. The editor calls `COA.generate(parent, kinship, P(0.1), type) + COA.getShield(culture, state)` with the capital burg's coa as parent. We mirror that, but if globals are unavailable we omit `coa`.
- We do NOT call `COArenderer.add("province", ...)` (it requires live DOM). Best-effort.
- `burg.capital` is **NOT** mutated. In this codebase `burg.capital === 1` means "state capital" — province capitals are tracked only via `province.burg`. The editor's `addProvince` handler never touches `burg.capital`; we match that.
- We do NOT call `collectStatistics()`; single-cell stats are irrelevant and would require pulling in the full statistics module.

## State shape (confirmed)

From the editor handler (`addProvince`, lines 1006-1061) and `src/modules/provinces-generator.ts:152-163` (canonical generation shape), the fields written on a new province are:

Required:
- `i` — `pack.provinces.length` (next available — matches `const province = provinces.length;`).
- `state` — the parent state id.
- `center` — the capital burg's `cell`.
- `burg` — the capital burg's `i`.
- `name` — input or copied from burg or rolled via `Names.getState(Names.getCultureShort(culture), culture)`.
- `formName` — input or default `"Province"` (matches the editor's `oldProvince ? provinces[oldProvince].formName : "Province"` — we default to `"Province"` because in the AI-tool path there's no "oldProvince" context to inherit from).
- `fullName` — computed via `composeProvinceFullName(name, formName)` → `"{name} {formName}"`, matching editor.
- `color` — input or derived from state color (mix 20% with a random color), or `getRandomColor()` fallback. For simplicity we default to `getRandomColor()` if no state color mix is available; with a state color we use `d3.interpolate` if `d3` is on window. (Falls back cleanly.)
- `coa` — best-effort via `COA.generate` + `COA.getShield`.

Notes:
- `pole` — not set on creation (the editor doesn't set it either; `getPolesOfInaccessibility` writes it later when provinces are drawn).
- `removed` / `lock` — not set.

Cascade mutations:
- `pack.states[state].provinces.push(newProvinceI)` — the state tracks its provinces.
- `pack.cells.province[center] = newProvinceI` — the cell points at the new province.

## Validation / rejection rules

Following the editor's validation (`addProvince` lines 1010-1023):

- `capital` required; must be a positive integer or non-empty string ref → `parseEntityRef`.
- Resolved burg must exist and not be removed.
- Burg id must be > 0 (burg 0 is the placeholder).
- Burg's `cell` must be land (`pack.cells.h[cell] >= 20`) — editor check.
- The burg's cell must not already be the `center` of another (non-removed) province — editor check "The cell is already a center of a different province."
- Default `state` = `pack.cells.state[burg.cell]`. If `state === 0` (neutral lands), reject — editor check "You cannot create a province in neutral lands."
- If caller passes explicit `state`, it must resolve via `findEntityByRef(pack.states, ref)` AND match the capital cell's `pack.cells.state` (we don't transfer the cell across states; we just ensure consistency). If mismatch → reject. (Rationale: the editor uses cell.state; giving the caller an override but with a consistency check keeps the surface predictable without introducing a cross-state cell mutation.)
- Optional `name` / `color` / `form`: if provided, must be non-empty strings (trimmed).

## Runtime-seam split

Pattern matches `add-state.ts` (validate, delegate, return shape). We expose:

```ts
export interface AddProvinceBurgInfo {
  i: number;
  cell: number;
  culture: number;
  name: string;
  coa?: RawCoa;
  removed: boolean;
}

export interface AddProvinceStateInfo {
  i: number;
  name: string;
  color: string;
  form: string;
  coa?: RawCoa;
}

export interface NewProvinceInput {
  name: string;
  formName: string;
  fullName: string;
  color: string;
  state: number;
  center: number;
  burg: number;
  coa?: RawCoa;
}

export interface AddProvinceResult {
  i: number;
  name: string;
  fullName: string;
  formName: string;
  color: string;
  state: number;
  capital: number;
  center: number;
}

export interface AddProvinceRuntime {
  findBurg(ref: number | string): AddProvinceBurgInfo | null;
  findState(ref: number | string): AddProvinceStateInfo | null;
  stateFor(stateId: number): AddProvinceStateInfo | null;
  cellLand(cellId: number): boolean;
  cellState(cellId: number): number;
  cellProvince(cellId: number): number;
  provinceCenter(provinceI: number): number | null;
  randomColor(): string;
  mixColor(stateColor: string | undefined): string;
  generateName(cultureId: number, burgName: string): string;
  generateCoa(
    parentCoa: RawCoa | undefined,
    stateForm: string,
    cultureId: number,
    stateId: number,
  ): RawCoa | undefined;
  apply(province: NewProvinceInput): AddProvinceResult;
  redraw(newProvinceI: number): void;
}
```

Seam behaviour:
- `findBurg` — resolves burg ref → `{i, cell, culture, name, coa, removed}`; null for id 0 / missing.
- `findState` — optional ref resolution when caller passes `state`; returns null if removed/missing.
- `stateFor(id)` — reads `pack.states[id]` for the cell's default state resolution.
- `cellLand(id)` — `pack.cells.h[id] >= 20`.
- `cellState(id)` — `pack.cells.state[id] ?? 0`.
- `cellProvince(id)` — `pack.cells.province[id] ?? 0`.
- `provinceCenter(i)` — `pack.provinces[i]?.center` (or null if removed / missing). Used for the "already a center" check.
- `randomColor` — `getRandomColor` global; falls back to `"#888888"`.
- `mixColor(stateColor)` — if `stateColor` starts with `#` and `d3.interpolate` + `d3.color` are on `window`, mix 20% toward a random color; else return `randomColor()`. Matches the editor's `stateColor[0] === "#" ? d3.color(d3.interpolate(stateColor, rndColor)(0.2)).hex() : rndColor`.
- `generateName(cultureId, burgName)` — prefers `burgName` if non-empty (editor's default when the center has a burg); else rolls via `Names.getState(Names.getCultureShort(culture), culture)`; falls back to `burgName || "New Province"`.
- `generateCoa` — `COA.generate(parentCoa, 0.8, null, stateForm) + COA.getShield(cultureId, stateId)` (kinship 0.8 because there's always a burg parent in our flow). Returns undefined on any failure.
- `apply` — mutates `pack.provinces.push`, `pack.states[state].provinces.push`, `pack.cells.province[center]`. Does NOT redraw.
- `redraw` — best-effort `drawProvinces()` + `drawBorders()` each wrapped in try/catch. (No `drawProvinceLabels` — the editor doesn't call one; province labels refresh as part of `drawProvinces` / `drawBorders`.)

## Tool contract

Inputs:
- `capital` (integer | string, required) — burg id or name.
- `state` (integer | string, optional) — state ref. Defaults to `pack.cells.state[burg.cell]`.
- `name` (string, optional) — short name. Defaults to burg's name or a rolled name.
- `color` (string, optional) — CSS color. Defaults to mixed state color (matches editor).
- `form` (string, optional) — province form (e.g. "Duchy", "Barony", "Province", "County"). Default `"Province"`.

Outputs:
```
{
  ok: true,
  i: number,
  name: string,
  fullName: string,
  formName: string,
  color: string,
  state: number,
  capital: number,   // burg id
  center: number     // cell id
}
```

## Integration test (globalThis seam)

Mimic `add-state.test.ts`'s integration block:
- Install `globalThis.pack` with:
  - `burgs`: index-0 placeholder + one active burg `{i: 1, cell: 42, culture: 2, name: "Capitalia", state: 1}`.
  - `cultures`: index-0 placeholder + `{i: 2, name: "TestCulture", type: "Highland"}`.
  - `states`: `[{i: 0, ...}, {i: 1, name: "Altaria", color: "#336699", form: "Monarchy", provinces: []}]`.
  - `provinces`: `[0 as unknown as RawProvince]` (index-0 reserved).
  - `cells`: `{h: [..., 25, ...], state: [..., 1, ...], province: [..., 0, ...]}` with h[42] = 25, state[42] = 1.
- Install mocks: `Names.getState` / `Names.getCultureShort`, `getRandomColor`, `drawProvinces`, `drawBorders`.
- Verify:
  - Happy path: pushes new province at id 1, `pack.cells.province[42] === 1`, `pack.states[1].provinces === [1]`.
  - `burg.capital` is **NOT** mutated (stays at whatever it was).
  - Rejects removed burg.
  - Rejects burg on water cell (h < 20).
  - Rejects burg in neutral cell (cells.state[cell] === 0).
  - Rejects when the cell is already a center of another province.
  - Accepts explicit state ref by name.
  - Rejects state mismatch when caller provides inconsistent state ref.
  - `getRandomColor` missing → fallback color used.
  - Redraw errors swallowed (province still pushed).

Use `as unknown as { ... }` casts for `globalThis` slots.

## Files touched

- `src/ai/tools/add-province.ts` (new)
- `src/ai/tools/add-province.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near `add_state`
