# Plan 82 — set_burg_feature AI tool

## Use case

The Burg Editor (`public/modules/ui/burg-editor.js:160`)
exposes five feature-toggle buttons on every burg:
`citadel`, `walls`, `plaza`, `temple`, `shanty`. Clicking
one runs `toggleFeature` which does:

```js
const value = Number(this.classList.contains("inactive"));
burg[feature] = value;
```

— a straight 0/1 write on `pack.burgs[i][feature]`. The
main map does not redraw (these flags only affect the MFCG
burg preview and the burg editor's internal state).

`port` and `capital` share the same row but take different
code paths (anchor SVG / state reassignment) and are out of
scope for this tool. They'll each get their own tool later.

The AI chat has no way to set these features. Users can
today, via the editor buttons; the AI should be able to too.

## Scope

Add one tool: `set_burg_feature(burg, feature, enabled)`.

- `burg` — id (> 0) or case-insensitive name. Rejects 0
  (neutral-owned burgs still exist on id 0? No — burg id 0
  is the sentinel empty slot in the array; skip it).
- `feature` — one of: `citadel`, `walls`, `plaza`, `temple`,
  `shanty` (case-insensitive). Rejects any other value,
  including `port` and `capital` (directing the AI to use
  the dedicated tools once those exist).
- `enabled` — boolean. Writes `burg[feature] = enabled ? 1 : 0`.
- Idempotent: noop when already at the target state.
- No redraw call — matches the UI.

## Implementation

1. **New file `src/ai/tools/set-burg-feature.ts`**:
   - Imports from `./_shared`: `createAliasResolver`,
     `errorResult`, `findEntityByRef`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawBurg`.
   - `BURG_FEATURES = ["citadel", "walls", "plaza", "temple",
     "shanty"] as const`.
   - `resolveBurgFeature` via createAliasResolver — also
     accept plurals (`citadels`, `walls` [already singular],
     `plazas`, `temples`, `shantytowns`/`shanties`).
   - `BurgFeatureRef { i, name, feature, previousEnabled }`.
   - `BurgFeatureRuntime { find, apply }`.
   - `defaultBurgFeatureRuntime.find`: use findEntityByRef
     (key: `burgs`), extract current feature value → bool.
   - `defaultBurgFeatureRuntime.apply`: mutate
     `burg[feature] = enabled ? 1 : 0`.
   - Schema: `burg` (int|string required), `feature`
     (string required), `enabled` (boolean required).

2. **Register** in `src/ai/index.ts`:
   - Import near `setBurgCultureTool`.
   - Barrel re-export.
   - `registry.register(setBurgFeatureTool)` near the
     other `set-burg-*`.

3. **Tests** (`set-burg-feature.test.ts`):
   - `resolveBurgFeature`: canonicalizes / case-insensitive,
     rejects unknown, rejects port/capital.
   - Unit:
     - sets citadel by id (enabled: true → 1)
     - sets walls by case-insensitive name
     - disables a feature (true→false writes 0)
     - noop when already at target
     - rejects unknown feature
     - rejects unknown burg
     - rejects invalid burg refs
     - rejects non-boolean enabled
     - surfaces runtime errors
   - Integration (`defaultBurgFeatureRuntime`):
     - stubs `globalThis.pack.burgs`, calls tool, asserts
       the burg's feature is 1 / 0.
     - verifies no drawBurgs / redraw call (stub absent).

4. **README_AI.md**: add a row near `set_burg_type`.

## Verification

- `npm test -- --run src/ai/tools/set-burg-feature` green.
- `npm test -- --run` — 1003 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can turn citadel / walls / plaza / temple / shanty on
  or off on any burg.
- `port` and `capital` are rejected with a helpful error.
- Idempotent noop when already set.
- No redraw side effect — matches UI.
