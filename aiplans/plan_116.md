# Plan 116 — set_default_emblem_shape AI tool

## Use case

The Options dialog has a default Emblem Shape selector
(`src/index.html:1944`) with three "diversiform" choices:

- `culture` (default) — pick per culture via
  `COA.getShield(culture, null)`.
- `state` — pick per state via
  `COA.getShield(culture, state)`.
- `random` — randomize each culture's shield.

Plus 30+ specific shapes (heater, swiss, wedged, noldor,
etc.) — if one is chosen, every non-custom
state/province/burg emblem gets that exact shape.

Changing the selection runs `changeEmblemShape(value)`
(options.js:351) which:

1. Paints the `#emblemShapeImage` preview.
2. For `random`: `pack.cultures.forEach(c => c.shield =
   Cultures.getRandomShield())`.
3. For every non-removed, non-custom state / province /
   burg coa: sets `coa.shield` to the specific shape
   (or `COA.getShield(...)` for the diversiform cases),
   then re-renders the COA.

`set_culture_shield` is per-culture. `regenerate_emblems`
rebuilds every coa from scratch. This tool sits between
them: it's the global default selector that cascades
without rebuilding.

## Scope

Add one tool: `set_default_emblem_shape(shape)`.

- `shape` — one of `culture` / `state` / `random`, or
  any valid shield shape (case-insensitive; same pool
  as `set_culture_shield`).
- Writes `window.options.emblemShape` + select value +
  localStorage.
- Best-effort calls `window.changeEmblemShape(shape)` so
  the cascade + preview update runs.
- Idempotent: noop when current matches.

## Implementation

1. **New file `src/ai/tools/set-default-emblem-shape.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - Import `CULTURE_SHIELDS` from
     `./set-culture-shield`.
   - `DIVERSIFORM_SHAPES = ["culture", "state", "random"]
      as const`.
   - `DEFAULT_EMBLEM_SHAPES: readonly string[]` — union
     of diversiform + specific.
   - `resolveEmblemShape(value)` — case-insensitive
     lookup first against diversiform, then against the
     specific shields.
   - `DefaultEmblemShapeRuntime { read, apply }`.
   - `defaultDefaultEmblemShapeRuntime`:
     - read: window.options.emblemShape → canonical or
       null.
     - apply(value):
       - options.emblemShape = value (if present).
       - select.value = value.
       - localStorage.setItem("emblemShape", value).
       - best-effort changeEmblemShape(value).
   - Schema: `shape` (string, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-default-emblem-shape.test.ts`:
   - `resolveEmblemShape` canonicalization for
     diversiform + specific shields.
   - Unit (stubbed):
     - delegates
     - canonicalizes case
     - rejects unknown
     - rejects empty / non-string
     - noop when already at target
     - surfaces runtime errors
   - Integration:
     - stubs options + document + localStorage +
       changeEmblemShape.
     - apply writes everything + calls
       changeEmblemShape.

4. **README_AI.md** — row near `set_cultures_set`.

## Verification

- `npm test -- --run src/ai/tools/set-default-emblem-shape`
  green.
- `npm test -- --run` — 1414 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Accepts diversiform + specific shapes.
- Delegates to changeEmblemShape for the cascade.
- Idempotent.
