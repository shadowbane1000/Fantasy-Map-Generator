# Plan 8 — Use Case: Focus the map on a burg or state

## Status

Iteration 8. Tools so far: `set_map_name`, `set_layer_visibility`,
`apply_layers_preset`, `get_map_info`, `regenerate_map`,
`list_states`, `rename_state`. Baseline: 7 warnings / 1 info / 0
errors. 124 tests pass.

## Use Case

**"Zoom to a specific burg or state on the map."**

The user does this by:
- Clicking a burg icon or label (→ `zoomTo(b.x, b.y, 8, 2000)` in
  `public/main.js`).
- Clicking a row in the Burgs Overview panel (same call).
- Clicking a state in the States Editor (uses `state.pole[0/1]` as
  the centroid).

Without this capability the AI can rename things but can't help the
user *see* them. Useful prompts:
- *"Zoom to the capital of Altaria"*
- *"Focus on state 3"*
- *"Show me the burg called Stormport"*
- *"Reset the zoom"*

### Success criteria

1. `focus_on_map({type: "burg", target: "Stormport"})` resolves the
   burg and calls `zoomTo(x, y, 8, 2000)` with the correct
   coordinates.
2. `focus_on_map({type: "state", target: 2})` resolves the state's
   `pole` coordinates (falling back to the capital burg's coordinates
   if `pole` isn't set) and calls `zoomTo`.
3. `focus_on_map({type: "reset"})` calls `resetZoom(1000)` to return
   the default view.
4. Unknown target → structured error.
5. Pre-load (pack missing or zoomTo unavailable) → structured error.

## Scope

In-scope:
- Tool `focus_on_map` with `type` in
  `"burg" | "state" | "reset"`, plus `target` (number|string)
  when not resetting.
- `ZoomRuntime` injection seam covering both `zoomTo` and `resetZoom`
  plus a coordinate lookup for burgs/states.
- Registry + README.

Out-of-scope:
- Arbitrary coordinate zoom (no UI equivalent the user uses casually).
- Zoom level customization (stick to the UI defaults: 8x, 2000ms).

## Design

New file: `src/ai/tools/focus-on-map.ts`.

```ts
export interface ZoomTarget { x: number; y: number; }
export interface ZoomRuntime {
  findBurg(ref: number | string): ZoomTarget & { i: number; name: string } | null;
  findState(ref: number | string): ZoomTarget & { i: number; name: string } | null;
  zoomTo(x: number, y: number, z: number, d: number): void;
  resetZoom(d: number): void;
}
```

Default runtime:
- `findBurg`: number → `pack.burgs[ref]` (must have `.i > 0`,
  `!removed`). String → exact-then-lowercase match on `burg.name`.
  Returns `{i, name, x, y}`.
- `findState`: number → `pack.states[ref]`. String → case-insensitive
  match against `name` and `fullName`. Coordinates from
  `state.pole`, else from `pack.burgs[state.capital]` if available.
- `zoomTo` / `resetZoom`: call the matching `window.zoomTo` /
  `window.resetZoom`.

Tool executor:
1. Validate `type` is one of `"burg" | "state" | "reset"`.
2. If `type === "reset"` → call `resetZoom(1000)`, return
   `{ok: true, mode: "reset"}`.
3. Validate `target` is a number or non-empty string.
4. Call `findBurg` / `findState`.
5. Missing → error with suggestion to run `list_states` (or a future
   `list_burgs`).
6. Call `zoomTo(x, y, 8, 2000)`, catch throw → error.
7. Return `{ok: true, type, i, name, x, y}`.

## Files

Create: `plan_8.md`, `tasks_8.md`,
`src/ai/tools/focus-on-map.ts`,
`src/ai/tools/focus-on-map.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit tests (`focus-on-map.test.ts`):

1. Burg by name → zoomTo called with that burg's coords.
2. Burg by id → same.
3. State by name → pole coords used.
4. State without `pole` but with a valid capital → capital's coords
   used instead.
5. `type: "reset"` → resetZoom called, zoomTo not called.
6. Invalid type → error, neither called.
7. Invalid target value → error (missing target for burg/state,
   non-int/non-string).
8. Unknown burg/state → error; zoomTo not called.
9. Runtime zoomTo throws → error bubbled up.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 burg   | `findBurg` + zoomTo | 1, 2 |
| #2 state w/ fallback | `findState` pole-or-capital | 3, 4 |
| #3 reset  | resetZoom branch | 5 |
| #4 unknown | null → error | 8 |
| #5 missing runtime | throw → error | 9 |

Lint/test/build gates in tasks_8.md.
