# Tasks for plan 292: regenerate_lake_name

1. **Capture lint baseline.** Already recorded in `plan_292.md` — `Found 7
   warnings.` and `Found 1 info.` and zero errors. Lint after implementation
   must not regress this.

2. **Create `src/ai/tools/regenerate-lake-name.ts`.**
   - Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`;
     `findLakeById`, `findLakesByName` from `./rename-lake`; `Tool`,
     `ToolResult` from `./index`.
   - Type-only import of `LakePackLike` shape (or inline a local
     `LakePackLike { features?: unknown[] }`).
   - Export `LAKE_NAME_MODES = ["culture", "random"] as const` and
     `LakeNameMode` type.
   - Export `RegenerateLakeNameRef { i: number; name: string; group: string }`
     (same shape as `LakeRenameRef` from `./rename-lake`).
   - Export `RegenerateLakeNameRuntime` interface with: `findById`,
     `findByName`, `generateCultureName`, `generateRandomName`, `apply`.
   - Implement `defaultRegenerateLakeNameRuntime`:
     - `findById(id)` → uses `getPack().features` and `findLakeById`.
     - `findByName(name)` → uses `getPack().features` and `findLakesByName`.
     - `generateCultureName(ref)` → reads `window.Lakes` via `getGlobal`,
       validates `.getName` is a function, then looks up the matching
       feature object in `pack.features` (so we hand it the real feature
       Azgaar's `getName` expects, not just the trimmed ref). Throws an
       Error with a message containing `Lakes` / `getName` / "available"
       wording when prerequisites are missing.
     - `generateRandomName()` → reads `window.Names` and `window.nameBases`
       via `getGlobal`. Validates `Names.getBase` is a function and
       `nameBases` is a non-empty array. Picks index via `window.rand`
       (if function: `rand(nameBases.length - 1)`) else
       `Math.floor(Math.random() * nameBases.length)`. Calls
       `Names.getBase(idx)`. Throws on missing/empty deps with messages
       naming `Names` / `getBase` / `nameBases`.
     - `apply(i, name)` → linear scan of `pack.features` like
       `defaultRenameLakeRuntime.rename`; throws if pack missing or
       lake id not found.
   - Implement `createRegenerateLakeNameTool(runtime?)`:
     - Tool name: `"regenerate_lake_name"`.
     - Description: explains both modes, mirrors `lakes-editor.js`
       buttons, mentions identification by id-or-name, no SVG redraw.
     - Input schema: properties `id`, `name`, `mode`; `required:
       ["mode"]` (id-or-name validated at runtime).
     - `execute(rawInput)`:
       1. Validate `mode` first: must be string === "culture" || "random"
          (lowercase exact). Otherwise return
          `mode must be "culture" or "random".`
       2. Validate id-or-name is provided. Validate types of each.
       3. Look up by id and/or by name, mirroring `rename-lake`'s flow:
          - id-only path
          - name-only path with ambiguity → error w/ `candidates`
          - both → must agree
       4. Call generator (`generateCultureName(target)` or
          `generateRandomName()`); catch and surface errors.
       5. Validate returned name: `typeof === "string"` and
          `.trim() !== ""`. Otherwise error
          `"Name generator returned an empty/invalid name."`.
       6. Trim the name. Call `runtime.apply(target.i, trimmed)`;
          catch and surface errors.
       7. Return `okResult({ id, mode, old_name, new_name })`.
   - Export `regenerateLakeNameTool = createRegenerateLakeNameTool();`.

3. **Create `src/ai/tools/regenerate-lake-name.test.ts`.**
   - Imports: `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`,
     `afterEach`), `ToolRegistry` from `./index`,
     and the named exports from `./regenerate-lake-name`.
   - `makeRuntime(overrides)` helper, similar to `rename-lake.test.ts`
     but for the lake-name-runtime shape.
   - Stub-runtime tests, in order, each ending with assertions that
     `apply` was (or wasn't) called as appropriate:
     1. happy path mode=culture by id → expect content
        `{ ok, id, old_name, new_name, mode: "culture" }`
     2. happy path mode=random by id → expect mode="random"
     3. identification by unique name works
     4. ambiguous name → error with `candidates`; pack unchanged (apply
        not called)
     5. id/name disagreement → error
     6. lake not found by id → error
     7. mode missing → error; apply not called
     8. mode invalid ("foo") → error; apply not called
     9. mode wrong-case ("Culture") → error (since spec says strict
        literal — confirms strictness)
     10. generator throws → error surfaced; apply not called
     11. generator returns empty string → error; apply not called
     12. generator returns non-string (number) → error; apply not called
     13. tool name + input_schema.required (`["mode"]`)
     14. registry round-trip via `ToolRegistry`
   - Default-runtime integration tests (block similar to
     `rename-lake.test.ts` 'defaultRenameLakeRuntime (integration)'):
     - happy path culture-mode: stub `globalThis.pack` features with one
       lake, stub `globalThis.Lakes = { getName: vi.fn() => "New Name" }`;
       run; assert pack mutated and `getName` called with the feature.
     - happy path random-mode: stub `pack`, stub
       `globalThis.Names = { getBase: vi.fn(idx => `Base${idx}`) }`,
       stub `globalThis.nameBases = [...]`; run; assert `getBase` called
       with an index in `[0, length-1]`; assert pack mutated.
     - non-lake feature with matching id → error: pack unchanged.
     - mode=culture with `window.Lakes` missing → error message names
       `Lakes` and/or `getName`.
     - mode=random with `window.Names` missing → error message names
       `Names`.
     - mode=random with `window.nameBases` empty → error.
     - mode=random with `window.nameBases` missing → error.
     - pack missing → error mentioning `pack.features` (similar to
       rename-lake).

4. **Wire into `src/ai/index.ts`** with three minimal edits:
   - Add `import { regenerateLakeNameTool } from "./tools/regenerate-lake-name";`
     between the `regenerateBurgNameTool` and `regenerateDomainTool`
     imports (already alphabetised).
   - Add an `export { ... } from "./tools/regenerate-lake-name";` block
     between the existing `regenerate-burg-name` export block and the
     `regenerate-domain` export block. Re-export everything that's
     usefully part of the public surface (factory, default tool, mode
     constants/types, runtime type & default runtime, ref type) — match
     the surface re-exported for `regenerate-burg-name`.
   - Add `registry.register(regenerateLakeNameTool);` immediately after
     `registry.register(regenerateBurgNameTool);` and before
     `registerStateNameTool`.

5. **Verify.**
   - `cd /workspace/.claude/worktrees/plan-292 && npm test` — must pass.
   - `npx tsc --noEmit` — must be clean (no errors).
   - `npm run lint` — final summary must match the captured baseline
     (7 warnings, 1 info, 0 errors). Anything more is a regression.

6. **Commit.** Stage exactly:
   - `src/ai/tools/regenerate-lake-name.ts`
   - `src/ai/tools/regenerate-lake-name.test.ts`
   - `src/ai/index.ts` (only the three additions described above)
   - `aiplans/plan_292.md`
   - `aiplans/tasks_292.md`

   Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or
   `src/ai/chat-controller.ts` (intentionally dirty on master). Commit
   message: `feat(ai): add regenerate_lake_name tool`.
   Do NOT push.
