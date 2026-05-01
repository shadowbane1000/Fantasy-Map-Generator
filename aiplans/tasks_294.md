# Tasks for plan 294 — `add_lake_group`

1. **Create `src/ai/tools/add-lake-group.ts`**:
   - Imports:
     - `errorResult`, `getGlobal`, `okResult` from `./_shared`.
     - `sanitizeGroupName` from `./add-route-group` (REUSE; do NOT
       import `prefixWithRoute`).
     - `Tool`, `ToolResult` from `./index`.
   - Export interface `AddLakeGroupRuntime`:
     ```ts
     {
       idExists(id: string): { exists: boolean; tag?: string };
       appendGroup(id: string): void;
     }
     ```
   - Export `defaultAddLakeGroupRuntime`:
     - `idExists`:
       - If `typeof document === "undefined"` → `{ exists: false }`.
       - `el = document.getElementById(id)`. If null → `{ exists: false }`.
       - Else → `{ exists: true, tag: el.tagName?.toLowerCase() }`.
     - `appendGroup`:
       - Try the D3 path first: `lakesSel = getGlobal("lakes")`. If
         `lakesSel` has an `append` function (typed as a minimal D3
         selection), use it. **However**, we want to clone-shallow
         the existing `<g id="freshwater">` if present, which is a
         DOM-level operation. So the appendGroup implementation
         goes:
         1. Resolve the parent root: prefer
            `getGlobal<{ node?: () => Element | null }>("lakes")?.node?.()`
            (D3's `.node()` accessor returning the underlying DOM
            element). Fall back to `document.getElementById("lakes")`.
            If both are null → throw `"#lakes SVG layer is unavailable."`.
         2. Resolve a template:
            `template = document.getElementById("freshwater")` if
            available and `tagName === "g"`. Otherwise `null`.
         3. Build the new group: if `template` exists, do
            `template.cloneNode(false)` (shallow). Otherwise create
            via `document.createElementNS("http://www.w3.org/2000/svg", "g")`
            (with a fallback to `document.createElement("g")` for
            test environments without `createElementNS`).
         4. Set the new id explicitly:
            `(newGroup as Element).setAttribute("id", id)` (and clear
            any other id-related state).
         5. Append: `lakesRoot.appendChild(newGroup)`.
   - Export `createAddLakeGroupTool(runtime?)` returning a `Tool`:
     - name: `"add_lake_group"`.
     - description: paragraph mirroring `add_route_group` style;
       mention the lakes-editor (`createNewGroup`) origin, the
       sanitize rules (no prefix), the shallow-clone-of-`#freshwater`
       behavior (so the new group inherits default styling), and that
       no existing lakes are moved (use `set_lake_group` for that).
     - input_schema: object with required `name: string (min 1 char)`.
     - execute:
       1. Validate `name` is a string and `name.trim()` is non-empty.
          On fail: `errorResult("name must be a non-empty string.")`.
       2. `const sanitized = sanitizeGroupName(name)`.
       3. If `sanitized === ""` → `errorResult("Invalid group name (sanitized to empty).")`.
       4. If `Number.isFinite(+sanitized.charAt(0))` →
          `errorResult("Group name must start with a letter.")`.
       5. `const check = runtime.idExists(sanitized)`.
          If `check.exists` →
          `errorResult("Element with id <id>"
            + (check.tag ? ` (<${check.tag}>)` : "")
            + " already exists.")`.
       6. Try `runtime.appendGroup(sanitized)`. On thrown error:
          `errorResult(err instanceof Error ? err.message : String(err))`.
       7. Return `okResult({ id: sanitized })`.
   - Export `addLakeGroupTool` (default singleton).

2. **Create `src/ai/tools/add-lake-group.test.ts`** with these
   describe blocks/cases:

   `add_lake_group tool` (fake runtime):

   Helper `makeRuntime(exists?)` builds a runtime with `vi.fn()`
   spies. `idExists` defaults to returning `{ exists: false }`.

   - Happy path: `"Wetlands"` → result `{ ok: true, id: "wetlands" }`,
     `appendGroup("wetlands")` called once.
   - Sanitization: `"My Cool Group!"` → id `my_cool_group`.
   - **No `route-` prefix** (regression guard): `"foo"` → id `foo`,
     NOT `route-foo`.
   - Reject non-string `name` (undefined, null, 42, true, `{}`, `[]`).
     Each must yield `isError: true` and `appendGroup` not called.
   - Reject empty/whitespace-only (`""`, `"   "`, `"\t\n"`).
   - Reject sanitization-empties (`"!!!"`) → error message matches
     `/sanitized to empty/i`.
   - Reject numeric-first (`"9foo"`) → error matches
     `/start with a letter/i`.
   - Reject when `idExists` returns `{ exists: true, tag: "g" }` —
     error message includes `(<g>)`.
   - Reject when `idExists` returns `{ exists: true }` (no tag) —
     error message says `already exists`.
   - Surfaces `appendGroup` thrown error.
   - Tool name = `"add_lake_group"`.
   - Registry round-trip: `new ToolRegistry().register(addLakeGroupTool)`,
     then `tools.find((t) => t.name === "add_lake_group")` is defined.

   `defaultAddLakeGroupRuntime` (integration with `globalThis`
   patched):

   Use `beforeEach` / `afterEach` to patch+restore `globalThis.lakes`
   and `globalThis.document`. Build a tiny fake DOM:
   - `lakesRoot` — an object with `id="lakes"`, `tagName="g"`,
     `children` array, `appendChild(node)` pushing into `children`.
   - `freshwaterGroup` — an object with `id="freshwater"`,
     `tagName="g"`, plus an attribute (e.g. `fill: "#a6c4e0"`) that
     `cloneNode(false)` carries over to the clone (we'll build a
     fake `cloneNode` that returns a deep-attribute-copy with no
     children). Implement attribute storage via a Map plus a
     `setAttribute(name, value)` and `getAttribute(name)`. Implement
     `cloneNode(deep: boolean)` returning a brand-new node with the
     same tagName and a copy of the attributes (and id).
   - `getElementById(id)` returns matches from a registry.

   Test cases:
   - **D3 path**: `globalThis.lakes` is a fake D3 selection whose
     `.node()` returns `lakesRoot`. After
     `addLakeGroupTool.execute({ name: "wetlands" })`, `lakesRoot.children`
     has a new `<g>` with id `wetlands`.
   - **Inherits attrs from `#freshwater`**: when `lakesRoot.children`
     starts with `freshwaterGroup` (which has e.g. `fill="#abc"`),
     the new `<g>` clones those attributes (verify
     `newG.getAttribute("fill") === "#abc"`) but has the new id.
   - **DOM fallback path**: `globalThis.lakes` is undefined,
     `getElementById("lakes")` returns `lakesRoot`. Tool still
     succeeds and appends.
   - **Both missing**: `globalThis.lakes` undefined, no `#lakes` in
     `getElementById` → `isError: true`, message matches
     `/#lakes.*unavailable/i` or `/lakes.*unavailable/`.
   - **Collision (existing `<g id="freshwater">`)**:
     `addLakeGroupTool.execute({ name: "freshwater" })` →
     `isError: true`, message matches `/already exists/`. The
     `lakesRoot.children` length is unchanged.
   - **Collision (existing element ELSEWHERE with same id)**: the
     fake `getElementById` returns a non-`g` element (e.g. an
     `input` with `id="custom_group"`). Calling with
     `name: "custom_group"` errors with `/already exists/`.
     Confirms the collision check is global, matching the UI's
     `byId(group)` semantics.

3. **Wire into `src/ai/index.ts`**:
   - Locate the `addRouteGroupTool` import statement (line ~17 in
     master). Place a NEW import for `addLakeGroupTool` immediately
     before it (alphabetical: `add-lake-group` < `add-route-group`).
   - Add a barrel re-export block for the new tool's public API
     (`AddLakeGroupRuntime`, `addLakeGroupTool`,
     `createAddLakeGroupTool`, `defaultAddLakeGroupRuntime`),
     placed alphabetically near the existing `add-route-group`
     re-export.
   - Register: add `registry.register(addLakeGroupTool);` adjacent
     to the existing lake-group registrations (next to
     `setLakeGroupTool` and `listLakeGroupsTool`).

4. **Verify**:
   - `npx tsc --noEmit` (clean).
   - `npm test -- add-lake-group` (all green).
   - `npm test` (full suite green; no regressions).
   - `npm run lint` (no worse than baseline: 688 files, 0 errors,
     7 warnings, 1 info).

5. **Commit** only:
   - `aiplans/plan_294.md`
   - `aiplans/tasks_294.md`
   - `src/ai/tools/add-lake-group.ts`
   - `src/ai/tools/add-lake-group.test.ts`
   - `src/ai/index.ts`

   Do NOT stage `.claude/`, `current-ralph-loop.prompt`,
   `src/ai/chat-controller.ts`, or any other dirty file.
   Subject: `feat(ai): add add_lake_group tool`.

   Do NOT push.
