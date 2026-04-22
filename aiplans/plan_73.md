# Plan 73 — set_culture_type AI tool

## Use case

The Cultures Editor has a per-culture type dropdown
(`cultureChangeType` at
`public/modules/dynamic/editors/cultures-editor.js:364`) with
options Generic, River, Lake, Naval, Nomadic, Hunting, Highland —
the same taxonomy the burg type uses. Writing sets
`culture.type = value` and calls `recalculateCultures()` to
refresh cell assignments (cultures expand differently by type:
Naval cultures hug coasts, Nomadic prefer steppe, etc.).

The chat has `set_burg_type` for burgs but no equivalent for
cultures.

## Scope

Add one tool: `set_culture_type(culture, type)`.

- `culture` required — id or case-insensitive name via
  `findEntityByRef` (cultures are array-indexed).
- `type` — one of Generic / River / Lake / Naval / Nomadic /
  Hunting / Highland (case-insensitive). Reuse the same
  `resolveBurgType` aliasing or a dedicated resolver — simplest
  to use a `createAliasResolver` with the shared types.
- Writes `culture.type = canonicalValue`.
- Best-effort calls `recalculateCultures()` global to refresh
  the map.
- Rejects culture id 0 (Wildlands).

## Implementation

1. **New file `src/ai/tools/set-culture-type.ts`**:
   - Imports: `createAliasResolver`, `errorResult`,
     `findEntityByRef`, `getGlobal`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawCulture`.
   - Reuse `BURG_TYPES` constant from `./set-burg-type`? Or
     declare `CULTURE_TYPES` separately to document intent.
     They're currently identical but could diverge.
   - `CULTURE_TYPES = ["Generic","River","Lake","Naval","Nomadic",
     "Hunting","Highland"] as const`.
   - `resolveCultureType` via `createAliasResolver` with no extra
     aliases (case-insensitive match on the canonical set).
   - `CultureTypeRef { i, name, previousType }`.
   - `CultureTypeRuntime { find, apply }`.
   - `defaultCultureTypeRuntime.find`: findEntityByRef → shape.
   - `defaultCultureTypeRuntime.apply(i, type)`:
     - Lookup culture; throw if missing / removed.
     - Write `culture.type = type`.
     - Best-effort
       `getGlobal<() => void>("recalculateCultures")?.()`.
   - Tool schema: `culture` (int|string required), `type`
     (string required).
   - Execute: parseEntityRef, resolveCultureType, find → 404,
     reject id 0, apply, respond.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-culture-type.test.ts`**:
   - Runtime-injected: set by id, by name, case-insensitive type
     (e.g. "naval" → "Naval"), reject unknown type, reject
     culture 0, invalid ref, surface failures.
   - Default-runtime integration: stub pack + recalc global;
     apply type → culture.type updated, recalculate called.

4. **README_AI.md** — row near `set_culture_color`.

## Verification

- `npm test -- --run src/ai/tools/set-culture-type` green.
- `npm test -- --run` — 895 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can change a culture's type and cells will redistribute on
  next `recalculateCultures` invocation.
- Wildlands (culture 0) protected.
- Parallel to `set_burg_type` in contract + enum.
