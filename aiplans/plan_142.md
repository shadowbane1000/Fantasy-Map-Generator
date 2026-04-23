# Plan 142 — `add_state` AI tool

## Use case
Create a new state by promoting an existing burg to be its capital. Mirrors the States Editor's "Add state" handler (`states-editor.js:addState`, invoked after `enterAddStateMode`). The editor lets the user click a cell to either (a) promote an already-existing burg into a capital of a new state or (b) drop a fresh burg and then promote it. For the AI seam we keep it simple:

- The caller **must** pass `capital` (a burg ref — numeric id or case-insensitive name). That burg is promoted to be the capital of the new state.
- This keeps the tool composable: to add a brand-new state in a region without a burg, the model can call `add_burg` first, then `add_state` with that burg id as the capital.

### Scope boundary — IMPORTANT

This is a **single-cell state**. We do not perform territory growth (no BFS over neighbours, no `States.expandStates`, no `States.getPoles` etc.). The new state owns exactly the capital burg's cell, nothing else. Full territory expansion is deliberately **out of scope** for this iteration — the user can follow up with `regenerate_domain(domain="states")` for a full re-grow, or use future per-state expansion tools.

Consequences of the single-cell scope:
- We skip `States.collectStatistics`, `States.findNeighbors`, `States.defineStateForms`, `adjustProvinces`, `COArenderer.add`, and the `diplomacy` reverse-relations matrix mutation that the editor performs. Those are non-trivial and would pull most of the state generator surface into the seam.
- `state.diplomacy` is seeded as all-`"Neutral"` entries (length = `pack.states.length + 1` including the new state's own `"x"` slot), no reverse updates to other states' `diplomacy` arrays. This is a simplification but mirrors what `createStates` does at generation time for the initial pass — subsequent full regenerations will overwrite anyway.
- `state.coa` is best-effort: we try `COA.generate` + `COA.getShield` via global, but if unavailable we omit the field rather than fail.
- `state.formName` and `state.fullName` are set to simple defaults (`"Monarchy"` / `"Monarchy of {name}"`), not run through `defineStateForms`. The follow-up `set_state_form` / `regenerate_state_name` tools can fix this.

## State shape (confirmed)

From `src/modules/states-generator.ts:61-89` (`createStates` — the canonical shape at generation time) and `public/modules/dynamic/editors/states-editor.js:1183-1276` (the "add state" editor handler):

Fields to write on the new state:
- `i` — `pack.states.length` (next available).
- `name` — input or auto-generated via `Names.getState(Names.getCultureShort(culture), culture)` (matches `createStates`).
- `form` — defaults to `"Monarchy"` (the dominant generic option in `defineStateForms`).
- `formName` — defaults to `"Monarchy"` (also the most common result for that `form`). The full `defineStateForms` logic is out of scope.
- `fullName` — computed via the editor's simple composition: `"Monarchy of {name}"` (matches the `"{formName} of {name}"` branch in `getFullName`).
- `type` — input or defaults to `"Generic"` (matches editor).
- `color` — input or defaults to `getRandomColor()` global if available, else a simple fallback hex.
- `culture` — input or defaults to the capital burg's culture.
- `capital` — the burg's `i`.
- `center` — the burg's `cell`.
- `expansionism` — fixed at `0.5` to match the editor's `expansionism: 0.5`. (Note: `createStates` uses a random 1..1+sizeVariety — but the editor uses 0.5 and that's what we mirror, consistent with "this is the add-state flow".)
- `burgs` — 1 (the capital).
- `cells` — 1 (just the capital's cell).
- `area` — 0 (not computed; single-cell area is tiny anyway and `collectStatistics` would overwrite it).
- `rural` / `urban` — 0 (not computed).
- `provinces` — `[]`.
- `neighbors` — `[]` (out of scope — would require `findNeighbors`).
- `military` — `[]`.
- `alert` — 1 (matches editor).
- `diplomacy` — `["x", ...]` array of `"Neutral"` with length `pack.states.length + 1`, entries 0 (= Neutrals index's slot) and the new state's own index are `"x"`. The reverse-relations updates to OTHER states are omitted (see scope boundary).
- `coa` — best-effort via `COA.generate(capitalBurg.coa, 0.4, null, cultureType) + COA.getShield(culture, null)`. If COA globals missing, omit field.

## Validation / rejection rules

- `capital` required; must be a positive integer or non-empty string ref → `parseEntityRef`.
- Resolved burg must exist, not be removed, and not already be a capital (`burg.capital === 1` → reject; matches editor's "Existing capital cannot be selected as a new state capital!").
- Burg id must be > 0 (burg 0 is the placeholder).
- Burg's `cell` must be land (pack.cells.h[cell] >= 20) — defensive (existing burgs are always on land, but we check anyway).
- Optional `name` / `color` / `type` / `form`: if provided, must be non-empty strings.
- Optional `culture`: if provided, must resolve to an active culture via `findEntityByRef` on `pack.cultures`.

## Runtime-seam split

Pattern matches `add-burg` and `add-regiment` (validate, delegate, return shape). We use a single `apply` seam rather than the `Burgs.add`-style "delegate to existing generator" approach, because there is no `States.add([x, y])` equivalent — the editor inlines the state shape. We also expose `redraw` as a separate seam so tests can verify best-effort rendering without touching globals.

```ts
export interface AddStateBurgInfo {
  i: number;
  cell: number;
  culture: number;
  name: string;
  coa?: RawCoa;
  isCapital: boolean;
  removed: boolean;
}

export interface AddStateCultureInfo {
  i: number;
  name: string;
  type: string;
}

export interface NewStateInput {
  name: string;
  form: string;
  formName: string;
  fullName: string;
  type: string;
  color: string;
  culture: number;
  capital: number;
  center: number;
  expansionism: number;
  coa?: RawCoa;
}

export interface AddStateResult {
  i: number;
  name: string;
  fullName: string;
  color: string;
  type: string;
  form: string;
  formName: string;
  capital: number;
  center: number;
  culture: number;
}

export interface AddStateRuntime {
  findBurg(ref: number | string): AddStateBurgInfo | null;
  findCulture(ref: number | string): AddStateCultureInfo | null;
  cellLand(cellId: number): boolean;
  cultureFor(cultureId: number): AddStateCultureInfo | null;
  randomColor(): string;
  generateName(cultureId: number, burgName: string): string;
  generateCoa(
    parentCoa: RawCoa | undefined,
    cultureType: string,
    cultureId: number,
  ): RawCoa | undefined;
  apply(state: NewStateInput, capitalBurgI: number): AddStateResult;
  redraw(): void;
}
```

- `findBurg` — resolves a burg ref to id+cell+culture+capital-flag; returns null if missing/removed.
- `findCulture` — optional ref-resolution when caller passes `culture`.
- `cellLand` — true iff `pack.cells.h[cellId] >= 20`.
- `cultureFor` — reads culture by id to pick up `type` (for COA generation) and default name base.
- `randomColor` — delegates to `getRandomColor` global; falls back to `"#888888"`.
- `generateName` — uses `Names.getState(Names.getCultureShort(cultureId), cultureId)` if globals available; falls back to `"New State"`.
- `generateCoa` — best-effort COA generation via global; returns `undefined` if `COA` missing or throws.
- `apply` — actually mutates `pack.states`, `pack.burgs[capital]`, `pack.cells.state[center]`, and returns the created shape. Does NOT redraw (separated).
- `redraw` — best-effort calls `drawStates() + drawStateLabels([newI]) + drawBorders()` each wrapped in try/catch.

## Tool contract

Inputs:
- `capital` (integer | string, required) — burg id or name.
- `name` (string, optional) — short name.
- `color` (string, optional) — CSS color.
- `type` (string, optional) — state type. Default `"Generic"`.
- `culture` (integer | string, optional) — culture ref. Defaults to capital burg's culture.
- `form` (string, optional) — state form (e.g. Monarchy, Republic, Union, Anarchy). Default `"Monarchy"`.

Outputs:
```
{
  ok: true,
  i: number,
  name: string,
  fullName: string,
  color: string,
  type: string,
  form: string,
  formName: string,
  capital: number,
  center: number,
  culture: number
}
```

## Integration test (globalThis seam)

Mimic `add-burg.test.ts`'s integration block:
- Install `globalThis.pack` with:
  - `burgs`: index-0 placeholder + one active burg with `i: 1, cell: 42, culture: 2, capital: 0`.
  - `cultures`: index-0 placeholder + `{i: 2, name: "Test", type: "Generic"}`.
  - `states`: `[{i: 0, name: "Neutrals", diplomacy: ["x"]}]`.
  - `cells`: `{h: [...], state: [0, 0, ..., 0, 0], burg: [0, 0, ..., 1, 0]}` with h[42] = 25.
- Install mocks for `Names.getState` / `Names.getCultureShort` (return "MockName"), `getRandomColor` (return "#abc123"), `drawStates` / `drawStateLabels` / `drawBorders`.
- Verify:
  - Happy path: pushes new state at id 1, sets `burg.capital = 1` + `burg.state = 1`, sets `cells.state[42] = 1`.
  - Rejects removed burg.
  - Rejects already-capital burg (`capital === 1`).
  - Rejects unknown burg ref.
  - Rejects unknown culture ref (when explicit).
  - Succeeds when `getRandomColor` missing (uses fallback).
  - Redraw errors are swallowed (state is still created).

Use `as unknown as { ... }` casts for `globalThis` slots.

## Files touched

- `src/ai/tools/add-state.ts` (new)
- `src/ai/tools/add-state.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near `add_burg` / `add_culture`
