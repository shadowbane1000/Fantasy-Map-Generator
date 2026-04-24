# Tasks — Plan 280 (`get_geography`)

1. Baseline: capture `npm run lint` (7 warnings / 1 info / 0 errors)
   and `npm test` (record the passing count).

2. Write `src/ai/tools/get-geography.ts`:
   - Reuse `GEOGRAPHY_FIELDS` import from `./set-geography` — do
     **not** re-export it locally.
   - `GeographySnapshot` interface with `mapSize`, `latitude`,
     `longitude` (all `number | null`).
   - `GeographyReadRuntime { read(): GeographySnapshot }` seam.
   - `defaultGeographyReadRuntime` reads each field via:
     1. `document.getElementById(inputId).value`, parsed as float.
     2. `localStorage.getItem(storedKey)`, parsed as float.
     3. else `null`.
   - `createGetGeographyTool(runtime = default)` returns a Tool with:
     - name `get_geography`.
     - input_schema `{ type: "object", properties: {} }`.
     - execute: call `runtime.read()`, map camelCase keys to
       snake_case public-API keys, return `okResult({
         map_size,
         latitude,
         longitude
       })`.
   - `getGeographyTool = createGetGeographyTool()` default export.

3. Write `src/ai/tools/get-geography.test.ts`:
   - imports: `afterEach, beforeEach, describe, expect, it, vi`
     from vitest; `createGetGeographyTool, getGeographyTool,
     defaultGeographyReadRuntime, type GeographyReadRuntime,
     type GeographySnapshot` from `./get-geography`.
   - pure / seam `describe("get_geography tool")`:
     - all three values — runtime stub returns a full snapshot; tool
       maps to snake_case body.
     - nulls pass through — runtime stub returns `{null, null, null}`.
     - extra input args are ignored.
     - tool metadata spot-check: `name === "get_geography"`, schema
       has empty `properties`, no `required`.
   - integration `describe("defaultGeographyReadRuntime (integration)")`:
     - `beforeEach` seeds `globalThis.document` (`getElementById`
       returning preseeded `{ value }` stubs) and
       `globalThis.localStorage` (`getItem` returning preseeded map).
       Use `as unknown as { ... }` casts.
     - `afterEach` restores originals.
     - test: reads from DOM input `.value` when elements present.
     - test: falls back to localStorage when DOM missing.
     - test: returns null when no source has the value.
     - test: prefers DOM over localStorage.

4. Wire up in `src/ai/index.ts`:
   - import `getGeographyTool` near the other `get_*` imports
     (alpha-sorted).
   - re-export `createGetGeographyTool`,
     `defaultGeographyReadRuntime`, `getGeographyTool`,
     `type GeographySnapshot`, `type GeographyReadRuntime`.
   - `registry.register(getGeographyTool)` inside
     `buildDefaultRegistry`, next to other `get_*` registrations.

5. Add a README_AI.md row in the geography cluster (right after
   `set_geography`) describing the tool, with the "Requires an
   Anthropic API key (see "Getting an API key" below)" line and
   example prompts.

6. Verify:
   - `npm run build` (must succeed).
   - `npm test` (expect +N tests, all pass).
   - `npm run lint` (must still be 7 warnings / 1 info / 0 errors).

7. Commit just the plan / tool / test / index / readme files with
   `feat(ai): add get_geography tool`.
