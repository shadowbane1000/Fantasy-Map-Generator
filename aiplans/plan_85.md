# Plan 85 — set_religion_expansion AI tool

## Use case

The Religions Editor
(`public/modules/dynamic/editors/religions-editor.js:470`)
renders an Extent dropdown for each religion with three
options: `global` / `state` / `culture`. Changing the
selection runs `religionChangeExtent`, which does:

```js
pack.religions[i].expansion = value;
recalculateReligions();
```

The AI chat can already set a religion's color, type,
form, and deity — but not its expansion extent. This tool
fills that gap.

## Scope

Add one tool: `set_religion_expansion(religion, expansion)`.

- `religion` — id (> 0) or case-insensitive name. Rejects
  id 0 (the "No religion" placeholder) and removed entries.
- `expansion` — one of: `global`, `state`, `culture`
  (case-insensitive).
- Writes `religion.expansion = canonical`.
- Best-effort call to `recalculateReligions()` (the UI
  always calls it; if not defined yet, skip).
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-religion-expansion.ts`**:
   - Imports: `createAliasResolver`, `errorResult`,
     `findEntityByRef`, `getGlobal`, `getPackCollection`,
     `okResult`, `parseEntityRef`, type `RawReligion`.
   - `RELIGION_EXPANSIONS = ["global", "state", "culture"]
      as const`.
   - `resolveReligionExpansion`.
   - `ReligionExpansionRef { i, name, previousExpansion }`.
   - `ReligionExpansionRuntime { find, apply }`.
   - `defaultReligionExpansionRuntime.apply` writes
     `religion.expansion = value` then best-effort
     `recalculateReligions()`.
   - Schema: `religion` (int|string, required), `expansion`
     (string, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `src/ai/tools/set-religion-expansion.test.ts`:
   - `resolveReligionExpansion` canonicalization / unknown.
   - Unit:
     - sets by id
     - sets by case-insensitive name
     - canonicalizes case of expansion
     - rejects unknown value
     - rejects unknown religion
     - rejects invalid refs
     - rejects religion 0 (placeholder)
     - rejects removed religion
     - noop when already at target
     - surfaces runtime errors
   - Integration:
     - stubs `globalThis.pack.religions` and
       `globalThis.recalculateReligions`.
     - writes value + calls recalculateReligions once.
     - succeeds when recalculateReligions missing.

4. **README_AI.md**: row near other religion tools.

## Verification

- `npm test -- --run src/ai/tools/set-religion-expansion`
  green.
- `npm test -- --run` — 1054 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired in `index.ts`, documented in
  README_AI.md.
- Writes `religion.expansion` to one of the three
  canonical values.
- Calls `recalculateReligions()` once (best-effort).
- Idempotent; rejects placeholder/removed religions.
