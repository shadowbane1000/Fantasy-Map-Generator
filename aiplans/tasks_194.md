# Tasks — Plan 194 (`list_rulers`)

1. Baseline: capture `npm run lint` result (7 warnings / 1 info / 0 errors)
   and `npm test` count (2832 passing).

2. Write `src/ai/tools/list-rulers.ts`:
   - `RulerSummary` interface with `i`, `type`, `points`, `length`, `unit`.
   - `RulerPackLike` (ducktype of `window.rulers` — `data` array of
     `{ id, points, constructor? }` plus any optional shape needed).
   - `computeRulerLength(points)` helper — sums `Math.hypot` segments;
     returns 0 for < 2 points.
   - `sanitisePoints(raw)` helper — filters to `[x, y]` number pairs,
     coerces non-finite to 0.
   - `readRulersFromCollection(rulers, unit)`:
     - null when `rulers` missing or `rulers.data` not an array.
     - else map each instance to a `RulerSummary` with
       `type = instance.constructor?.name ?? "Measurer"`,
       `length = computeRulerLength(points)` (adds closing segment
       when `type === "Planimeter"` and `points.length >= 3`),
       `unit` passed through.
   - `RulersRuntime` + `defaultRulersRuntime` using
     `getGlobal<RulersCollection>("rulers")` and reading the DOM
     `#distanceUnitInput`'s `.value`.
   - `createListRulersTool(runtime)` via `createPaginatedListTool`:
     - name `list_rulers`
     - description matching the plan
     - schema `{ limit, offset }` (no other properties)
     - `collectionKey: "rulers"`
     - `notReadyError` citing `'map:generated'`
     - read → `runtime.readRulers()`
   - `listRulersTool = createListRulersTool()` default export.

3. Write `src/ai/tools/list-rulers.test.ts`:
   - imports from `./list-rulers` including types + default runtime
     (`listRulersTool`, `createListRulersTool`, `readRulersFromCollection`,
     `RulerSummary`, `RulersRuntime`).
   - `fakeRulers()` fixture with 3 summaries (Ruler / Opisometer / Planimeter).
   - suite "list_rulers tool":
     - full list by default.
     - honors limit/offset.
     - rejects invalid paging (`limit` 0, 501, 1.5; `offset` -1, 1.5).
     - errors when runtime returns null ("not ready").
   - suite "readRulersFromCollection":
     - maps points + constructor name + computes length for Ruler.
     - planimeter length is closed-polygon perimeter.
     - RouteOpisometer type survives.
     - malformed points tolerated (non-finite → 0, non-pair skipped).
     - null rulers / non-array data → null.
     - unit passed through from argument (null when unspecified).
   - suite "defaultRulersRuntime (integration)":
     - set `globalThis.rulers` to a real array of stub class instances
       (so `constructor.name` works), set DOM
       `#distanceUnitInput` via `document.createElement("input")`.
     - call `listRulersTool.execute({})` and assert body items, unit.
     - clearing `globalThis.rulers` → not-ready error through the tool.
     - missing DOM input → `unit: null` but list still works.
   - Use `as unknown as { ... }` casts for globalThis assignments.

4. Wire up in `src/ai/index.ts`:
   - import `listRulersTool` near `listMarkersTool`.
   - re-export public surface
     (`createListRulersTool`, `listRulersTool`, `readRulersFromCollection`)
     in the alpha-sorted block with other `list_*` tools.
   - `registry.register(listRulersTool)` in `buildDefaultRegistry`
     near other `list_*` registrations.

5. Add README_AI.md row after `list_markers` (or near it in the
   `list_*` cluster) describing:
   - Pagination defaults.
   - Returned fields: `i`, `type`, `points`, `length`, `unit`.
   - Note `length` is straight-line for curved measurers; plan
     perimeter for planimeters.
   - "Requires an Anthropic API key (see 'Getting an API key' below)."
   - Usage examples column.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests)
   - `npm run lint` (must still be 7 warnings / 1 info / 0 errors)

7. Commit the specific added / modified files with
   `feat(ai): add list_rulers tool`.
