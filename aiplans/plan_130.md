# Plan 130 — regenerate_province_coa AI tool

## Use case

Regenerate the coat of arms for ONE specific province. This
parallels the already-merged `regenerate_burg_coa` (plan 128)
and `regenerate_state_coa` (plan 127) tools, filling in the
third and final "per-entity COA re-roll" tool.

The Emblem Editor (`public/modules/ui/emblems-editor.js` lines
206–223) exposes a Regenerate button that does exactly this:

```js
if (type === "province") parent = pack.states[el.state];
...
const shield = el.coa.shield || COA.getShield(
  el.culture || parent?.culture || 0, el.state);
el.coa = COA.generate(parent ? parent.coa : null, 0.3, 0.1, null);
el.coa.shield = shield;
const coaEl = document.getElementById(id);
if (coaEl) coaEl.remove();
COArenderer.trigger(id, el.coa);
```

Provinces sit in the middle of the heraldic hierarchy: their
parent is the owning state. (Burgs can parent off the province
or state; states have no parent.)

## Scope

Add one tool: `regenerate_province_coa(province, shield?)`.

- `province` — province id (> 0) or case-insensitive name.
  Required. Rejects id 0, removed, locked.
- `shield` — optional string override. Must be non-empty when
  provided (trimmed).
- Parent = `pack.states[province.state]?.coa ?? null` (mirrors
  the Emblem Editor handler). If the parent coa is marked
  `custom: true`, pass `null` (heraldic inheritance should
  never clone a custom image; matches `regenerate_burg_coa`).
- `COA.generate(parent, 0.3, 0.1, null)` — same args as the
  existing two tools; 0.3 kinship + 0.1 dominion is what the
  Emblem Editor's manual Regenerate button uses.
- Shield precedence (mirrors `regenerate-burg-coa.ts`):
  1. Explicit `shield` arg.
  2. Existing `province.coa.shield`.
  3. `COA.getShield(culture, province.state)` where
     `culture = province.cultureId || parentCultureId`.
     Province entities don't carry `culture` directly in the
     type, but the editor falls back to
     `pack.cells.culture[province.center]` in the bulk rebuild.
     We mirror the Emblem Editor's own Regenerate button which
     reads `el.culture || parent?.culture || 0` — provinces
     don't have `.culture`, so in practice this resolves to
     the parent state's culture.
- Assign `province.coa = newCoa`.
- DOM: best-effort `document.getElementById('provinceCOA{i}').
  remove()` then `COArenderer.trigger('provinceCOA{i}', newCoa)`.
  Wrapped in try/catch.
- Return `{ ok, i, previousCoa, coa }`.

## Delete approach

N/A — the tool only regenerates a single field + redraws.

## Implementation

1. **New file `src/ai/tools/regenerate-province-coa.ts`**:
   - Imports from `./_shared`: errorResult, findEntityByRef,
     getGlobal, getPack, getPackCollection, okResult, type Pack,
     parseEntityRef, type RawCoa, type RawProvince, type RawState.
   - Interfaces:
     - `RegenerateProvinceCoaRef { i, name, coa }`.
     - `RegenerateProvinceCoaRuntime { find, generate, apply }`.
   - `CoaModule` / `CoaRendererModule` local types (same shape
     as the other two tools).
   - `resolveParent(pack, province)` helper — just pulls
     `pack.states[province.state ?? 0]` if present.
   - `defaultRegenerateProvinceCoaRuntime`:
     - `find(ref)` — `findEntityByRef<RawProvince>("provinces",
       ref)`; reject `i <= 0`, `removed`, `lock`; return
       `{ i, name, coa }`.
     - `generate(provinceI, shield?)`:
       - Re-read pack + COA module; throw if either missing.
       - Resolve province; throw if not found.
       - Parent coa = resolveParent's coa, unless `.custom`.
       - Call `COA.generate(parentCoa, 0.3, 0.1, null)`.
       - Shield precedence: explicit > existing
         `province.coa.shield` > `COA.getShield(culture,
         province.state)` where culture falls back to
         `pack.states[state].culture || 0`.
       - Set `newCoa.shield` if resolved.
       - Return `newCoa`.
     - `apply(i, coa)`:
       - Re-read provinces; throw if missing.
       - `province.coa = coa`.
       - try/catch: remove `#provinceCOA{i}`; trigger
         `COArenderer.trigger('provinceCOA{i}', coa)`.
   - `createRegenerateProvinceCoaTool(runtime?)`,
     `regenerateProvinceCoaTool`.
   - Tool name: `regenerate_province_coa`.
   - Schema: `province` (int | string, required),
     `shield` (string, optional).
   - Validation:
     - `parseEntityRef(input.province, "province")`.
     - Trimmed non-empty shield if provided; non-string → error.
     - `runtime.find(ref)` null → error.
   - Return `{ ok: true, i, previousCoa, coa }`.

2. **Register** in `src/ai/index.ts`:
   - Import alongside the other regenerate-coa tools (after
     `regenerateProvinceNameTool`, sorted alphabetically).
   - Barrel re-export `createRegenerateProvinceCoaTool`,
     `regenerateProvinceCoaTool`.
   - `registry.register(regenerateProvinceCoaTool)` next to
     the other COA tools in `buildDefaultRegistry`.

3. **Tests** `src/ai/tools/regenerate-province-coa.test.ts`:
   - Unit (stubbed runtime) — mirror regenerate-state-coa:
     - regenerates by numeric id → returns previous + new coa
     - resolves by case-insensitive name
     - passes explicit shield override through to `generate`
     - trims shield override
     - null previousCoa when province had no coa
     - rejects unknown province
     - rejects invalid refs (null / undefined / 0 / -1 / 1.5 / "")
     - rejects empty / whitespace shield override
     - rejects non-string shield override
     - surfaces generator / apply errors
     - errors when generator returns non-object
   - `defaultRegenerateProvinceCoaRuntime (integration)`:
     - beforeEach seeds pack.provinces + pack.states +
       window.COA + window.COArenderer + document.getElementById.
       Double-cast globalThis (`as unknown as {...}`) per
       tsc-strict rule.
     - regenerates with explicit shield — updates
       `province.coa`, calls `COArenderer.trigger` with
       `provinceCOA{i}`.
     - parent passed to COA.generate = `pack.states[province
       .state].coa` (or null when state is 0).
     - preserves existing `province.coa.shield` when no override.
     - falls back to `COA.getShield(stateCulture, state)` when
       no existing shield and no override.
     - errors when pack / COA missing.
     - errors when province is unknown.
     - rejects locked / removed / id-0 provinces.
     - succeeds when `COArenderer` missing.
     - does not throw when `#provinceCOA{i}` DOM node missing.

4. **README_AI.md** — new row after `regenerate_state_coa`
   (line 23). Describes COA.generate call, parent = owning
   state, shield precedence, `#provinceCOA{i}` DOM refresh,
   rejection for id 0 / removed / locked, pointer to
   `regenerate_emblems` for bulk.

## Verification

- Baseline lint: 7 warnings / 1 info / 0 errors (on src).
- Baseline tests: 1623 passing across 142 files.
- `npm test` green after changes (1623 + ~17 new).
- `npm run lint` still 7 / 1 / 0 on src.
- `npm run build` succeeds — catches tsc errors lint misses.

## Success criteria

- Tool callable, wired, documented.
- Uses shared helpers (parseEntityRef, findEntityByRef,
  getPack, getGlobal, getPackCollection) exactly like
  `regenerate-burg-coa.ts` / `regenerate-state-coa.ts`.
- Rejects province 0, removed, locked.
- Parent resolution matches the Emblem Editor's own regenerate
  handler (`pack.states[province.state]`).
- DOM refresh best-effort and robust when renderer / node
  missing.
- Return payload surfaces previous coa so the LLM can confirm.
