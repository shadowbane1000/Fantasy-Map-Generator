# Tasks 337: `regenerate_culture_burgs` tool

Sequenced implementation tasks for plan 337.

1. **Create the tool file** `src/ai/tools/regenerate-culture-burgs.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `findEntityByRef`, `getGlobal`, `getPackCollection`, `okResult`, type `RawBurg`, type `RawCulture`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define exported types:
     ```ts
     export interface RegenerateCultureBurgsCultureRef {
       i: number;
       name: string;
       base: number | null;
       removed?: boolean;
     }

     export interface RegenerateCultureBurgsBurgRef {
       i: number;
       name: string;
       lock?: boolean;
       removed?: boolean;
     }

     export interface RegenerateCultureBurgsRuntime {
       findCulture(ref: number | string): RegenerateCultureBurgsCultureRef | null;
       hasNamesbase(base: number): boolean;
       listBurgsForCulture(cultureId: number): RegenerateCultureBurgsBurgRef[];
       generate(cultureId: number): string;
       apply(burgId: number, name: string): void;
     }
     ```
   - Internal helper interface (NOT exported):
     ```ts
     interface NamesModule {
       getCulture?: (culture: number) => string;
     }
     ```
   - Internal helper for Wildlands resolution (mirrors `set-burg-culture.ts`):
     ```ts
     function isWildlandsRef(ref: number | string): boolean {
       if (ref === 0) return true;
       if (typeof ref !== "string") return false;
       const key = ref.trim().toLowerCase();
       return key === "wildlands" || key === "0";
     }
     ```
   - Implement `defaultRegenerateCultureBurgsRuntime`:
     - `findCulture(ref)`:
       - If `isWildlandsRef(ref)`:
         - `const wild = getPackCollection<RawCulture>("cultures")?.[0];`
         - If `!wild`, return `null`. Otherwise return `{ i: 0, name: wild.name ?? "Wildlands", base: typeof wild.base === "number" ? wild.base : null, removed: !!wild.removed }`.
       - Else: `const entry = findEntityByRef(getPackCollection<RawCulture>("cultures"), ref); if (!entry) return null;`
         Return `{ i: entry.i, name: entry.name ?? "", base: typeof entry.base === "number" ? entry.base : null, removed: !!entry.removed }`.
     - `hasNamesbase(base)`:
       - `const bases = getGlobal<unknown[]>("nameBases");`
       - `if (!Array.isArray(bases)) return false;`
       - `if (base < 0 || base >= bases.length) return false;`
       - `const entry = bases[base]; return entry !== null && entry !== undefined;`.
     - `listBurgsForCulture(cultureId)`:
       - `const burgs = getPackCollection<RawBurg>("burgs");`
       - `if (!Array.isArray(burgs)) throw new Error("window.pack.burgs is not available; the map hasn't finished loading.");`
       - Walk; for each burg with `i > 0` and `b.culture === cultureId`, push `{ i: b.i, name: b.name ?? "", lock: !!b.lock, removed: !!b.removed }`.
       - Return the resulting array.
     - `generate(cultureId)`:
       - `const names = getGlobal<NamesModule>("Names");`
       - `if (!names || typeof names.getCulture !== "function") throw new Error("Names.getCulture is not available; the map hasn't finished loading.");`
       - Return `names.getCulture(cultureId)`.
     - `apply(burgId, name)`:
       - `const burgs = getPackCollection<RawBurg>("burgs");`
       - `const burg = burgs?.[burgId];`
       - `if (!burg) throw new Error(\`Burg \${burgId} not found.\`);`
       - `burg.name = name;`
       - `if (typeof document !== "undefined") { const label = document.getElementById(\`burgLabel\${burgId}\`); if (label) label.textContent = name; }`.
   - Implement `createRegenerateCultureBurgsTool(runtime = defaultRegenerateCultureBurgsRuntime)`:
     - `name: "regenerate_culture_burgs"`.
     - Description: explain it mirrors the Cultures Editor's per-culture
       "Regenerate burgs" button, takes a `culture` ref (id or name; 0 =
       Wildlands accepted), and regenerates `Names.getCulture(cultureId)`
       for every non-removed, non-locked burg of that culture. Mention
       `nameBases[culture.base]` must exist. Mention
       `regenerate_burg_name` (per-burg) and `regenerate_all_burg_names`
       (all burgs) as related tools. Mention the `renamed` array is
       capped at 50.
     - `input_schema`:
       ```ts
       {
         type: "object",
         properties: {
           culture: {
             type: ["integer", "string"],
             description:
               "Culture id (>=0; 0 is Wildlands) or case-insensitive name.",
           },
         },
         required: ["culture"],
       }
       ```
     - `execute(rawInput)`:
       1. `const input = (rawInput ?? {}) as { culture?: unknown };`
       2. Validate `culture`:
          - `const cultureValid = (typeof input.culture === "number" && Number.isInteger(input.culture) && input.culture >= 0) || (typeof input.culture === "string" && input.culture.trim());`
          - `if (!cultureValid) return errorResult("culture must be a non-negative integer id or a non-empty name string.");`
       3. `const cultureRef = input.culture as number | string;`
       4. `const culture = runtime.findCulture(cultureRef);`
          - `if (!culture) return errorResult(\`Culture \${JSON.stringify(cultureRef)} not found.\`);`
       5. `if (culture.removed) return errorResult(\`Cannot regenerate burgs for removed culture \${culture.i}.\`);`
       6. `if (culture.base === null) return errorResult(\`Namesbase (unset) is not defined; cannot regenerate.\`);`
       7. `if (!runtime.hasNamesbase(culture.base)) return errorResult(\`Namesbase \${culture.base} is not defined; cannot regenerate.\`);`
       8. `let burgs: RegenerateCultureBurgsBurgRef[]; try { burgs = runtime.listBurgsForCulture(culture.i); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
       9. Partition counts:
          - `let skippedLocked = 0; let skippedRemoved = 0; const active: RegenerateCultureBurgsBurgRef[] = [];`
          - For each burg: if `removed === true` → `skippedRemoved++; continue;` (check removed FIRST so lock+removed counts as removed). Else if `lock === true` → `skippedLocked++; continue;`. Else push to `active`.
       10. `const renamed: Array<{ i: number; previous_name: string; name: string }> = [];`
       11. For each burg in `active`:
           - `let newName: string; try { newName = runtime.generate(culture.i); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
           - `if (typeof newName !== "string" || !newName.trim()) return errorResult("Name generator returned an empty string.");`
           - `try { runtime.apply(burg.i, newName); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
           - `renamed.push({ i: burg.i, previous_name: burg.name, name: newName });`
       12. Build response:
           - `const RENAMED_CAP = 50;`
           - `const truncated = renamed.length > RENAMED_CAP;`
           - `const cappedRenamed = truncated ? renamed.slice(0, RENAMED_CAP) : renamed;`
           - `return okResult({ culture: { i: culture.i, name: culture.name }, namesbase: culture.base, renamed_count: renamed.length, skipped_locked: skippedLocked, skipped_removed: skippedRemoved, renamed: cappedRenamed, ...(truncated ? { renamed_truncated: true } : {}) });`
   - Export:
     - `export const regenerateCultureBurgsTool = createRegenerateCultureBurgsTool();`

2. **Create the test file** `src/ai/tools/regenerate-culture-burgs.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawBurg, RawCulture } from "./_shared";
     import { ToolRegistry } from "./index";
     import {
       createRegenerateCultureBurgsTool,
       type RegenerateCultureBurgsBurgRef,
       type RegenerateCultureBurgsCultureRef,
       type RegenerateCultureBurgsRuntime,
       regenerateCultureBurgsTool,
     } from "./regenerate-culture-burgs";
     ```
   - Helper:
     ```ts
     interface Fixtures {
       culture?: (ref: number | string) => RegenerateCultureBurgsCultureRef | null;
       hasNamesbase?: (base: number) => boolean;
       burgs?: (cultureId: number) => RegenerateCultureBurgsBurgRef[];
       generate?: (cultureId: number) => string;
       apply?: (burgId: number, name: string) => void;
     }

     function makeRuntime(f: Fixtures = {}) {
       const findCulture = vi.fn<RegenerateCultureBurgsRuntime["findCulture"]>(
         f.culture ?? (() => null),
       );
       const hasNamesbase = vi.fn<RegenerateCultureBurgsRuntime["hasNamesbase"]>(
         f.hasNamesbase ?? (() => true),
       );
       const listBurgsForCulture = vi.fn<RegenerateCultureBurgsRuntime["listBurgsForCulture"]>(
         f.burgs ?? (() => []),
       );
       const generate = vi.fn<RegenerateCultureBurgsRuntime["generate"]>(
         f.generate ?? (() => "GeneratedName"),
       );
       const apply = vi.fn<RegenerateCultureBurgsRuntime["apply"]>(f.apply ?? (() => {}));
       const runtime: RegenerateCultureBurgsRuntime = {
         findCulture,
         hasNamesbase,
         listBurgsForCulture,
         generate,
         apply,
       };
       return { runtime, findCulture, hasNamesbase, listBurgsForCulture, generate, apply };
     }
     ```
   - `describe("regenerate_culture_burgs tool", () => { ... })`:
     - **§1 Happy path: 3 active, 1 locked, 1 removed → 3 renamed.**
       - Build `findCulture` returning `{ i: 3, name: "Elvish", base: 5 }` for ref `3`.
       - `hasNamesbase` returns `true` for `5`.
       - `listBurgsForCulture(3)` returns
         ```ts
         [
           { i: 11, name: "Old1" },
           { i: 12, name: "Locked1", lock: true },
           { i: 13, name: "Old2" },
           { i: 14, name: "Removed1", removed: true },
           { i: 15, name: "Old3" },
         ]
         ```
       - `generate` returns `"New1"`, `"New2"`, `"New3"` in sequence.
       - Tool execute `{ culture: 3 }`. Assertions:
         - `result.isError` falsy.
         - `generate.mock.calls.length === 3`; every call is `(3,)`.
         - `apply.mock.calls` deep-equals `[[11, "New1"], [13, "New2"], [15, "New3"]]`.
         - `JSON.parse(result.content)` deep-equals
           ```ts
           {
             ok: true,
             culture: { i: 3, name: "Elvish" },
             namesbase: 5,
             renamed_count: 3,
             skipped_locked: 1,
             skipped_removed: 1,
             renamed: [
               { i: 11, previous_name: "Old1", name: "New1" },
               { i: 13, previous_name: "Old2", name: "New2" },
               { i: 15, previous_name: "Old3", name: "New3" },
             ],
           }
           ```
         - Body has NO `renamed_truncated` key (assert `!("renamed_truncated" in body)`).
     - **§2 Resolves culture by case-insensitive name.**
       - `findCulture` returns the elvish object only when ref is a string matching `/^elvish$/i` (or ref is 3).
       - Execute `{ culture: "ELVISH" }`. Assert `findCulture.mock.calls[0][0] === "ELVISH"` and `apply` was called.
     - **§3 Resolves culture by id.**
       - Same setup; pass `{ culture: 3 }`. Assert `findCulture` was called with `3`.
     - **§4 Culture 0 (Wildlands) accepted when namesbase exists.**
       - `findCulture(0) → { i: 0, name: "Wildlands", base: 0 }`.
       - `hasNamesbase(0) → true`.
       - `listBurgsForCulture(0) → []`.
       - Execute `{ culture: 0 }`. Body `ok: true`, `renamed_count: 0`,
         `skipped_locked: 0`, `skipped_removed: 0`, `renamed: []`,
         `culture: { i: 0, name: "Wildlands" }`, `namesbase: 0`.
     - **§5 Culture not found → error, no apply.**
       - `findCulture` returns `null`. Execute `{ culture: 99 }`.
       - `result.isError === true`; body's `error` matches `/Culture 99 not found/`.
       - `apply.mock.calls.length === 0`.
     - **§6 Removed culture rejected.**
       - `findCulture` returns `{ i: 3, name: "X", base: 5, removed: true }`.
       - `result.isError === true`; body's `error` matches `/Cannot regenerate burgs for removed culture 3/`.
       - `apply` never called.
     - **§7 Namesbase missing → error.**
       - `findCulture(3) → { i: 3, name: "X", base: 7 }`.
       - `hasNamesbase(7) → false`.
       - `result.isError === true`; body's `error` matches `/Namesbase 7 is not defined/`.
       - `apply` and `generate` never called.
     - **§8 Culture has no base (`base: null`) → error.**
       - `findCulture(3) → { i: 3, name: "X", base: null }`.
       - `result.isError === true`; body's `error` matches `/Namesbase \(unset\) is not defined/`.
       - `apply` / `generate` / `hasNamesbase` never called.
     - **§9 Missing pack.burgs → error.**
       - `listBurgsForCulture` throws `new Error("window.pack.burgs is not available; the map hasn't finished loading.")`.
       - `result.isError === true`; body's `error` is exactly that message.
       - `apply` never called.
     - **§10 Missing Names.getCulture → error (via generate throwing on first burg).**
       - `findCulture` and `hasNamesbase` set up normally.
       - `listBurgsForCulture` returns one active burg.
       - `generate` throws `new Error("Names.getCulture is not available; the map hasn't finished loading.")`.
       - `result.isError === true`; body's `error` matches that exact message.
       - `apply` never called.
     - **§11 Culture with no burgs → ok, renamed_count=0.**
       - `listBurgsForCulture(3) → []`. Body `ok: true`, all counts 0,
         `renamed: []`. `generate` and `apply` never called.
     - **§12 Locked burgs are NOT touched (verify .name unchanged after the call). LOAD-BEARING.**
       - Build a shared array:
         ```ts
         const burgsList: Array<{ i: number; name: string; lock?: boolean; removed?: boolean }> = [
           { i: 1, name: "Free" },
           { i: 2, name: "Stuck", lock: true },
         ];
         ```
       - Runtime:
         - `findCulture(3) → { i: 3, name: "X", base: 5 }`.
         - `hasNamesbase(5) → true`.
         - `listBurgsForCulture(3)` returns `burgsList.map(b => ({ i: b.i, name: b.name, lock: b.lock }))`.
         - `generate` returns `"Generated"`.
         - `apply(i, name)` mutates the matching `burgsList` entry's `name` field directly:
           ```ts
           apply: (i, name) => {
             const b = burgsList.find(x => x.i === i);
             if (b) b.name = name;
           }
           ```
       - Execute `{ culture: 3 }`.
       - Assertions (AFTER the call, so we read .name post-mutation):
         - Body `renamed_count === 1`, `skipped_locked === 1`.
         - `burgsList[0].name === "Generated"` (rename occurred).
         - `burgsList[1].name === "Stuck"` (locked burg unchanged). ← THE CHECK.
         - `apply.mock.calls.find(c => c[0] === 2)` is undefined.
     - **§13 generate throws on second burg → error result; mutation for first burg preserved.**
       - 3 active burgs.
       - `generate` returns `"New1"` then throws `new Error("boom")` on the second call.
       - Result `isError: true`, error matches `/boom/`.
       - `apply.mock.calls.length === 1`; `apply.mock.calls[0]` deep-equals `[firstBurgId, "New1"]`.
     - **§14 generate returns empty string → error, no apply for that burg.**
       - One active burg. `generate` returns `"   "`.
       - Result `isError: true`; error matches `/empty/i`.
       - `apply.mock.calls.length === 0`.
     - **§15 apply throws → error, prior iterations preserved.**
       - Two active burgs. `generate` returns `"New1"` / `"New2"`. `apply` succeeds first call, throws `new Error("apply-boom")` second call.
       - Result `isError: true`; error matches `/apply-boom/`.
       - `apply.mock.calls.length === 2`. First call args `[firstId, "New1"]`; second call args `[secondId, "New2"]`.
     - **§16 Renamed-list cap at 50 (truncation case).**
       - 60 active burgs (build via Array.from). `generate` returns `"N${i}"` per call. `apply` is a no-op.
       - Body `renamed_count === 60`, `renamed.length === 50`, `renamed_truncated === true`.
     - **§17 No truncated flag when renamed_count <= 50.**
       - 30 active burgs. Body `renamed_count === 30`, `renamed.length === 30`, `"renamed_truncated" in body === false`.
     - **§18 Invalid input shapes rejected.**
       - Loop over `[ {}, { culture: null }, { culture: "" }, { culture: 1.5 }, { culture: -1 }, { culture: [] } ]`.
       - Each → `result.isError === true`. Across all iterations, `findCulture.mock.calls.length === 0`.
     - **§19 Tool name + schema + registry round-trip.**
       - `expect(regenerateCultureBurgsTool.name).toBe("regenerate_culture_burgs");`
       - `expect(regenerateCultureBurgsTool.input_schema.required).toEqual(["culture"]);`
       - Build a fresh `ToolRegistry`, register the tool, assert `reg.list().map(t => t.name).includes("regenerate_culture_burgs")`.

   - `describe("defaultRegenerateCultureBurgsRuntime (integration)", () => { ... })`:
     - Save/restore `globalThis.pack`, `globalThis.Names`, `globalThis.nameBases`, `globalThis.document` per test.
     - **§20 End-to-end with populated globals.**
       - `cultures: RawCulture[]`:
         ```ts
         cultures[0] = { i: 0, name: "Wildlands", base: 0 };
         cultures[1] = { i: 1, name: "Highlanders", base: 1 };
         cultures[3] = { i: 3, name: "Elvish", base: 5 };
         ```
       - `burgs: RawBurg[]`:
         ```ts
         burgs[0]  = { i: 0 };
         burgs[10] = { i: 10, name: "OldA", culture: 3 };
         burgs[11] = { i: 11, name: "OldB", culture: 3 };
         burgs[12] = { i: 12, name: "OldC", culture: 3 };
         burgs[13] = { i: 13, name: "Locked", culture: 3, lock: true };
         burgs[14] = { i: 14, name: "Gone",   culture: 3, removed: true };
         burgs[20] = { i: 20, name: "Other",  culture: 1 };
         ```
       - `globalThis.pack = { cultures, burgs };`
       - `Names = { getCulture: vi.fn((c: number) => "GenName" + c) };` set on global.
       - `nameBases = [{}, {}, {}, {}, {}, { name: "Elvish" }];` set on global.
       - Build a fake DOM: `labelMap = { burgLabel10: { textContent: "" }, burgLabel11: { textContent: "" }, burgLabel12: { textContent: "" } };`. `document = { getElementById: vi.fn((id) => labelMap[id] ?? null) };`.
       - Execute `regenerateCultureBurgsTool.execute({ culture: 3 })`.
       - Assertions:
         - `result.isError` falsy.
         - Body `renamed_count === 3`, `skipped_locked === 1`, `skipped_removed === 1`.
         - `burgs[10]?.name === "GenName3"`, `burgs[11]?.name === "GenName3"`, `burgs[12]?.name === "GenName3"`.
         - `burgs[13]?.name === "Locked"` (locked, unchanged).
         - `burgs[14]?.name === "Gone"` (removed, unchanged).
         - `burgs[20]?.name === "Other"` (different culture, unchanged).
         - `Names.getCulture` (from the fixture) was called 3 times, all with `3`.
         - `labelMap.burgLabel10.textContent === "GenName3"`, same for 11 and 12.
     - **§21 Integration: missing nameBases → error.**
       - Pack populated with culture 3 (`base: 5`). `nameBases = undefined`.
       - Execute `{ culture: 3 }`. Body's `error` matches `/Namesbase 5 is not defined/`.
     - **§22 Integration: missing pack → error.**
       - `pack = undefined`. Result `isError: true`; error matches `/not found/`.
     - **§23 Integration: pack present but pack.burgs missing → error.**
       - `pack = { cultures: [/* with culture 3 */] };` (no `burgs`).
       - `nameBases` populated.
       - Body's `error` matches `/window\.pack\.burgs is not available/`.
     - **§24 Integration: missing Names global → error from generate.**
       - Pack has cultures and one active burg in culture 3. `nameBases` populated. `Names = undefined`.
       - Body's `error` matches `/Names\.getCulture is not available/`.
       - The burg's name is unchanged (the failure is on the first burg, before `apply`).
     - **§25 Integration: Wildlands resolvable when its base is valid.**
       - `cultures[0] = { i: 0, name: "Wildlands", base: 0 };`
       - `burgs[7] = { i: 7, name: "OldWild", culture: 0 };`
       - `nameBases = [{ name: "Generic" }, ...];` (index 0 valid).
       - Execute `{ culture: 0 }`. Body `renamed_count === 1`, `burgs[7]?.name === "GenName0"`.
       - Reset burg's name. Execute `{ culture: "wildlands" }`. Body `renamed_count === 1`, `burgs[7]?.name === "GenName0"`.

3. **Modify `src/ai/index.ts`**:
   - Add `import { regenerateCultureBurgsTool } from "./tools/regenerate-culture-burgs";` between `regenerate-burg-name` (line 186) and `regenerate-diplomacy` (line 187).
   - Add re-export block immediately after the `regenerate-burg-name` re-export (lines 1867-1872):
     ```ts
     export {
       createRegenerateCultureBurgsTool,
       defaultRegenerateCultureBurgsRuntime,
       type RegenerateCultureBurgsBurgRef,
       type RegenerateCultureBurgsCultureRef,
       type RegenerateCultureBurgsRuntime,
       regenerateCultureBurgsTool,
     } from "./tools/regenerate-culture-burgs";
     ```
   - Add `registry.register(regenerateCultureBurgsTool);` after `registry.register(regenerateAllCultureNamesTool);` (line 2980). Topical grouping with the other regenerate-burg-name cousins.

4. **Run verification**:
   - `npm test` (must be green; new file's tests must pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -50` (must report 0 errors / 0 warnings, matching baseline).

5. **Commit on `plan-337-regenerate-culture-burgs` branch** with the message specified in the prompt. Do NOT push.
