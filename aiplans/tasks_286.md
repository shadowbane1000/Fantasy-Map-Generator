# Tasks for plan 286 — `add_route_group`

1. **Create `src/ai/tools/add-route-group.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`;
     `Tool`, `ToolResult` from `./index`.
   - Export `sanitizeGroupName(raw: string): string` — applies
     `.toLowerCase()`, `.replace(/ /g, "_")`,
     `.replace(/[^\w\s]/gi, "")` in that order. Pure function.
   - Export `prefixWithRoute(s: string): string` — prepends `route-`
     if not already prefixed. (Optional helper for tests.)
   - Export interface `AddRouteGroupRuntime`:
     ```ts
     {
       idExists(id: string): boolean;
       appendGroup(id: string): void;
       appendSelectOption(selectId: string, value: string): void;
     }
     ```
   - Export `defaultAddRouteGroupRuntime`:
     - `idExists`: `typeof document !== "undefined" && document.getElementById(id) != null`.
     - `appendGroup`: read `getGlobal<D3Selection>("routes")` (typed
       as a minimal D3-shaped interface with `append(name): {attr(key, value): SelectionLike}`)
       and chain
       `.append("g").attr("id", id).attr("stroke", "#000000").attr("stroke-width", 0.5).attr("stroke-dasharray", "1 0.5").attr("stroke-linecap", "butt")`.
       If the global is missing, throw `"window.routes (D3 selection) is unavailable."`.
     - `appendSelectOption`: `if (typeof document === "undefined") return;`
       look up `document.getElementById(selectId)`; if null, return
       silently; otherwise, if it has `.options.add` (HTMLSelectElement),
       call `select.options.add(new Option(value, value))`. If
       `Option` is undefined, fall back to creating `{ value, text: value }`-shaped
       option via `document.createElement("option")` then assign `.value`
       and `.textContent` and call `select.options.add(opt)`. Use the
       fallback so that environments without a global `Option`
       constructor still work.
   - Export `createAddRouteGroupTool(runtime?)` returning a `Tool`:
     - name: `"add_route_group"`.
     - description: paragraph mirroring `set_route_group` style; mention
       sanitize → prefix → uniqueness → DOM mutations.
     - input_schema: object with required `name: string (min 1 char)`.
     - execute:
       1. Validate `name` is a non-empty string.
       2. `const sanitized = sanitizeGroupName(name)`.
       3. If empty after sanitization → error
          `"Invalid group name (sanitized to empty)."`.
       4. `const id = sanitized.startsWith("route-") ? sanitized : "route-" + sanitized;`
       5. If `Number.isFinite(+id.charAt(0))` → error
          `"Group name must start with a letter."`.
       6. If `runtime.idExists(id)` → error
          `"Element with id <id> already exists."`.
       7. Try: `runtime.appendGroup(id);` then
          `runtime.appendSelectOption("routeGroup", id);` then
          `runtime.appendSelectOption("routeCreatorGroupSelect", id);`.
          On thrown error, `errorResult(err.message)`.
       8. Return `okResult({ id })`.
   - Export `addRouteGroupTool` (default singleton).

2. **Create `src/ai/tools/add-route-group.test.ts`** with these
   describe blocks/cases:

   `add_route_group tool` (fake runtime):
   - Happy path: `"Imperial Road"` → asserts `appendGroup` called with
     `route-imperial_road`, both `appendSelectOption` calls fired with
     the right select ids and value.
   - Auto-prefix: `"foo"` → id `route-foo`.
   - Sanitization: special chars stripped, spaces → underscores
     (`"My Cool Group!"` → `route-my_cool_group`).
   - Already-prefixed: `"route-bar"` stays `route-bar`.
   - Rejects: non-string name, empty string, whitespace-only string,
     name that sanitizes to empty (e.g. all punctuation
     `"!!!"`).
   - Rejects: collision (`idExists` returns true).
   - Rejects: numeric-first id — exercised by directly mocking the
     runtime to assert the check fires before `appendGroup`. We can
     test this by providing an input that survives the prefix and
     starts with a digit; since the prefix forces leading `r`, the
     check is structurally unreachable for sanitize-then-prefix
     output. We instead test ordering: `expect(appendGroup).not.toHaveBeenCalled()`
     when sanitization empties, when collision detected, etc. The
     numeric-first branch is exercised by exporting & unit-testing
     `sanitizeGroupName` plus a small integration check that an input
     like `"9_trails"` ends up `route-9_trails` (legal, leading `r`).
   - Surfaces runtime failures (`appendGroup` throws → `isError`).
   - Tool name = `"add_route_group"`.
   - Registry round-trip: `new ToolRegistry().register(addRouteGroupTool);`
     then `.run("add_route_group", { name: "x" })` → ok.

   `defaultAddRouteGroupRuntime` (integration, with `globalThis`
   patched):
   - Patches `globalThis.routes` with a fake D3 selection where
     `.append("g")` returns a chainable mock that records all `.attr`
     calls; asserts the four expected attr key/value pairs were
     recorded.
   - Patches `globalThis.document` with a `getElementById` returning
     fake `<select>` objects with `options.add` spies for `routeGroup`
     and `routeCreatorGroupSelect`. Asserts both got an option with
     value `route-foo`.
   - Skips select updates gracefully when `getElementById` returns
     null.
   - `idExists`: returns `true` when `getElementById(id)` returns
     truthy and the tool refuses to proceed.

   Patch and restore `globalThis.routes` and `globalThis.document`
   in `beforeEach` / `afterEach` (mirror set-route-group.test.ts).

3. **Wire into `src/ai/index.ts`**:
   - Import `addRouteGroupTool` between `addRouteTool` and
     `addRulerTool` (alphabetical: `add-route` < `add-route-group` <
     `add-ruler`).
   - Add a barrel re-export block for the new tool's public API
     (the create function, default runtime, type, and singleton).
     Place it alphabetically between the `add-route` and `add-ruler`
     re-export blocks.
   - Register: add `registry.register(addRouteGroupTool);` near
     `registry.register(addRouteTool);` (just after, to keep
     route-group tools clustered with the existing route family).

4. **Verify**:
   - `npx tsc --noEmit` (clean).
   - `npm test -- add-route-group` (all green).
   - `npm test` (full suite green; no regressions).
   - `npm run lint` (no worse than baseline: 0 errors, 7 warnings, 1
     info, 672 files).

5. **Commit** only:
   - `aiplans/plan_286.md`
   - `aiplans/tasks_286.md`
   - `src/ai/tools/add-route-group.ts`
   - `src/ai/tools/add-route-group.test.ts`
   - `src/ai/index.ts`

   Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or any
   other dirty file. Subject: `feat(ai): add add_route_group tool`.

   Do NOT push.
