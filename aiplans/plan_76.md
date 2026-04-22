# Plan 76 — set_religion_deity AI tool

## Use case

The Religions Editor has a supreme deity input
(`religionChangeDeity` at
`public/modules/dynamic/editors/religions-editor.js:378`) —
free-form text like "Azoth the Flame-Bearer", "The Many-Named
One". Organized religions usually generate a deity string; Folk
religions typically have `null`. Users edit it to name the
deity freely.

`rename_religion` / `set_religion_type` (plan 74) /
`set_religion_form` (plan 75) are in place; `set_religion_deity`
completes the three Editor text knobs.

## Scope

Add one tool: `set_religion_deity(religion, deity)`.

- `religion` required — id or case-insensitive name.
- `deity` required string. Unlike `form`, empty-string `""` is
  allowed to clear the deity (matching how Folk religions have
  no named deity). Whitespace-only is rejected (consistent with
  other clear-supporting fields like `set_marker_note` /
  `set_note`'s legend).
- Writes `religion.deity = deity` (or empty string → null? —
  keep as the empty string so the shape matches the UI; the UI
  stores `el.value` directly which for an empty input is `""`).

## Implementation

1. **New file `src/ai/tools/set-religion-deity.ts`**:
   - Imports: `errorResult`, `findEntityByRef`,
     `getPackCollection`, `okResult`, `parseEntityRef`, type
     `RawReligion`.
   - `ReligionDeityRef { i, name, previousDeity }`.
   - `ReligionDeityRuntime { find, apply }`.
   - `defaultReligionDeityRuntime.find`: findEntityByRef.
   - `defaultReligionDeityRuntime.apply(i, deity)`: lookup,
     write `religion.deity = deity`.
   - Tool schema: `religion` (int|string required), `deity`
     (string required).
   - Execute: parseEntityRef(religion); validate `deity` is a
     string (allow `""`, reject whitespace-only); find → 404;
     reject id 0; try apply; respond with `previousDeity / deity`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-religion-deity.test.ts`**:
   - Runtime-injected: set by id, by name, trim whitespace of
     non-empty inputs, allow `""` to clear, reject whitespace-only,
     reject non-string, reject invalid refs, reject religion 0,
     surface failures.
   - Default-runtime integration: stub pack; apply deity → data
     updated; apply "" → cleared; reject removed.

4. **README_AI.md** — row near `set_religion_form`.

## Verification

- `npm test -- --run src/ai/tools/set-religion-deity` green.
- `npm test -- --run` — 929 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can name or clear a religion's supreme deity.
- "No religion" (id 0) protected.
