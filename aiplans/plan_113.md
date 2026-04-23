# Plan 113 — set_cultures_set AI tool

## Use case

The Options dialog has a Cultures Set selector
(`src/index.html:1733`, `public/modules/ui/options.js:133`)
that chooses which culture pool the generator draws from:

- `world` (All-world, max 32)
- `european` (max 15)
- `oriental` (max 13)
- `english` (max 10)
- `antique` (max 10)
- `highFantasy` (max 17)
- `darkFantasy` (max 18)
- `random` (max 100)

Changing the selection runs `changeCultureSet()`:
- Reads `data-max` from the selected option.
- Caps `culturesInput.max` / `culturesOutput.max`.
- Caps current `cultures` value if it exceeds the new
  max.

The AI chat has no way to switch the culture pool.

## Scope

Add one tool: `set_cultures_set(cultures_set)`.

- `cultures_set` — one of the 8 canonical values
  (case-insensitive).
- Writes the select's value, localStorage, and
  best-effort calls `window.changeCultureSet()` so
  the cap logic runs.
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-cultures-set.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - `CULTURES_SETS = ["world","european","oriental",
     "english","antique","highFantasy","darkFantasy",
     "random"] as const`.
   - `resolveCulturesSet(value)` — case-insensitive
     canonicalization (including common aliases like
     "all-world" → "world", "all" → "world"; plus
     "high fantasy" → "highFantasy", "high-fantasy" →
     "highFantasy" via lowercase normalization).
   - `CulturesSetRuntime { read, apply }`.
   - `defaultCulturesSetRuntime`:
     - read: read the select element's value as canonical.
     - apply: write select.value, localStorage,
       best-effort `changeCultureSet()`.
   - Schema: `cultures_set` (string enum, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-cultures-set.test.ts`:
   - `resolveCulturesSet` canonicalization (including
     a couple of aliases).
   - Unit (stubbed):
     - delegates with canonical value
     - canonicalizes case
     - rejects unknown
     - rejects empty / non-string
     - noop when read returns current
     - surfaces runtime errors
   - Integration:
     - stubs document.getElementById, localStorage,
       `changeCultureSet`.
     - select value + localStorage updated.
     - changeCultureSet called.

4. **README_AI.md** — row near `set_generator_rates`.

## Verification

- `npm test -- --run src/ai/tools/set-cultures-set`
  green.
- `npm test -- --run` — 1379 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- 8 system culture sets supported.
- Writes select DOM + localStorage; best-effort
  calls changeCultureSet so the cap logic runs.
- Idempotent.
