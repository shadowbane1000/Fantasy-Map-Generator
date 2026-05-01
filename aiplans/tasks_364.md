# Tasks for plan 364 — `regenerate_state_full_name`

1. Read `aiplans/plan_364.md`. Skim
   `src/ai/tools/_shared/{globals,results,entity-ref,find-entity,pack-types}.ts`,
   `src/ai/tools/regenerate-state-name.ts`,
   `src/ai/tools/rename-state.ts`,
   `src/ai/tools/set-state-form.ts`, and the legacy
   `regenerateFullName` + `applyNameChange` blocks in
   `public/modules/dynamic/editors/states-editor.js` (lines 378–462).

2. Create `src/ai/tools/regenerate-state-full-name.ts`:
   - Imports: `errorResult`, `findEntityByRef`, `getGlobal`,
     `getPackCollection`, `okResult`, `parseEntityRef`, `RawState`
     from `./_shared`. `Tool, ToolResult` from `./index`.
   - Export `STATE_FULL_NAME_PATTERNS = ["adjective", "form_of"] as const;`
     and `type StateFullNamePattern = (typeof STATE_FULL_NAME_PATTERNS)[number];`
   - Local lookup `Map<string, StateFullNamePattern>` lower-cased for
     `resolvePattern(value: unknown): StateFullNamePattern | null`.
   - `interface StateFullNameRef { i: number; name: string; form: string;
     fullName: string | null; removed: boolean; }`
   - `interface RegenerateStateFullNameRuntime {
       find(ref): StateFullNameRef | null;
       getAdjective(noun: string): string | null;
       apply(i: number, fullName: string): void;
     }`
   - `defaultRegenerateStateFullNameRuntime`:
     - `find` → `findEntityByRef(getPackCollection<RawState>("states"), ref)`,
       map to `{ i, name: name ?? "", form: formName ?? "",
       fullName: fullName ?? null, removed: !!removed }`. Note: read
       `formName` (NOT `form`); `form` is the parent category.
     - `getAdjective` → `const fn = getGlobal<(n: string) => string>("getAdjective");
        return typeof fn === "function" ? fn(noun) : null;`
       (returning `null` lets the tool layer emit the standard error).
     - `apply` → re-fetch `pack.states[i]`, throw if missing,
       set `s.fullName = fullName`, then best-effort
       `getGlobal<(ids: number[]) => void>("drawStateLabels")?.([i])`
       in try/catch.
   - `createRegenerateStateFullNameTool(runtime = default)` returns a
     Tool with:
     - `name: "regenerate_state_full_name"`
     - description summarising the legacy regen behavior + pattern
       options.
     - input_schema: per plan.
     - `execute`:
       1. parse `state` via `parseEntityRef`. Bail on parse error.
       2. resolve `pattern`: default `"adjective"` when missing/null;
          else `resolvePattern`; reject with
          `pattern must be 'adjective' or 'form_of'.` when not in the
          enum.
       3. `runtime.find(ref)`. If null →
          `State ${JSON.stringify(refResult.ref)} not found.` (or use
          plain `${ref}` — match the wording used in
          `regenerate-state-name.ts`'s "No state found matching"). The
          plan calls for `State ${ref} not found.` — keep that exact
          wording for this tool to be consistent with the plan's error
          list.
       4. if `current.i <= 0` →
          `Cannot regenerate full name for state 0 (the Neutrals placeholder).`
       5. if `current.removed` →
          `Cannot regenerate full name for removed state ${current.i}.`
       6. compute `newFullName` and `patternUsed`:
          - `short = current.name.trim()`, `form = current.form.trim()`
            (be tolerant of whitespace).
          - `!short && !form` → return error
            `State has neither short name nor form.`
          - `!form` → `newFullName = short; patternUsed = "short_only"`
          - `!short` → `newFullName = "The " + form; patternUsed = "the_form"`
          - else apply `pattern`:
            - `"form_of"` → `${form} of ${short}`,
              `patternUsed = "form_of"`
            - `"adjective"` → `adj = runtime.getAdjective(short);` if
              `adj` is null/empty string after trim → return error
              `window.getAdjective is not available; the map hasn't finished loading.`;
              `newFullName = adj + " " + form;
              patternUsed = "adjective"`.
       7. capture `previousFullName = current.fullName;` (already
          captured by `find`, but read it BEFORE calling `apply`).
       8. wrap `runtime.apply(current.i, newFullName)` in try/catch;
          propagate via `errorResult`.
       9. `okResult({ state: { i, name }, previous_full_name,
          full_name, pattern_used })`.
   - export `regenerateStateFullNameTool = createRegenerateStateFullNameTool();`

3. Create `src/ai/tools/regenerate-state-full-name.test.ts` covering
   tests #1–26 from plan 364:
   - Tool-layer with mocked runtime: tests 1–17.
   - Default-runtime integration with `globalThis.pack` and
     `globalThis.getAdjective`: tests 18–26.
   - Use the same global-stash + restore pattern as
     `regenerate-state-name.test.ts` (`originalPack`, `originalAdjective`,
     `originalDraw`).

4. Update `src/ai/index.ts`:
   - Add `import { regenerateStateFullNameTool } from "./tools/regenerate-state-full-name";`
     between `regenerate-state-coa` (line 211) and
     `regenerate-state-name` (line 212).
   - Add re-export block between `regenerate-state-coa`'s and
     `regenerate-state-name`'s re-exports (lines ~2057–2066):
     ```ts
     export {
       createRegenerateStateFullNameTool,
       regenerateStateFullNameTool,
       resolveStateFullNamePattern,
       STATE_FULL_NAME_PATTERNS,
     } from "./tools/regenerate-state-full-name";
     ```
     (Export `resolveStateFullNamePattern` and the constant array so
     they're available for the registry-roundtrip test.)
   - Add `registry.register(regenerateStateFullNameTool);`
     immediately after `registry.register(regenerateStateNameTool);`
     (around line 3216).

5. Run `npm test` — all green.

6. Run `npx tsc --noEmit` — clean.

7. Run `npm run lint` — clean.

8. Commit on branch `plan-364-regenerate-state-full-name`:

   ```
   feat(ai): add regenerate_state_full_name tool

   Implements plan 364. Adds an AI chat tool that derives state.fullName
   from state.name + state.formName using either an "adjective" pattern
   (Adjective Form) or a "form_of" pattern (Form of Short), mirroring
   the "Regenerate" button in the state name editor.
   ```

   No push.
