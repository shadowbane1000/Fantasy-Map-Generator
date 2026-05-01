# Tasks 339: `regenerate_regiment_legend` tool

Sequenced implementation tasks for plan 339.

1. **Create the tool file** `src/ai/tools/regenerate-regiment-legend.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `getGlobal`, `getNotes`, `getPack`, `isActive`, `okResult`, type `RawNote`, type `RawRegiment`, type `RawState`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Import `BurgPackLike`, `resolveStateRefInPack` from `./list-burgs`.
   - Import `findRegimentByRef` from `./rename-regiment` (re-uses the existing helper).
   - Define internal `MilitaryModule` interface (NOT exported):
     ```ts
     interface MilitaryModule {
       generateNote?: (reg: RawRegiment, state: RawState) => void;
     }
     ```
   - Define exported types:
     ```ts
     export interface RegenerateRegimentLegendStateRef {
       i: number;
       name: string;
     }

     export interface RegenerateRegimentLegendRegimentRef {
       i: number;
       name: string;
     }

     export interface RegenerateRegimentLegendNoteRef {
       id: string;
       name: string;
       legend: string;
     }

     export interface RegenerateRegimentLegendFound {
       state: RegenerateRegimentLegendStateRef;
       regiment: RegenerateRegimentLegendRegimentRef;
     }

     export interface RegenerateRegimentLegendRuntime {
       find(
         stateRef: number | string,
         regRef: number | string,
       ): RegenerateRegimentLegendFound | null;
       readNote(id: string): RegenerateRegimentLegendNoteRef | null;
       removeNote(id: string): void;
       regenerate(stateId: number, regimentI: number): void;
     }
     ```
   - Internal validator:
     ```ts
     function isValidRef(value: unknown): boolean {
       if (typeof value === "number") return Number.isInteger(value) && value >= 0;
       return typeof value === "string" && value.trim().length > 0;
     }
     ```
   - Implement `defaultRegenerateRegimentLegendRuntime`:
     - `find(stateRef, regRef)`:
       ```ts
       const pack = getPack<BurgPackLike>();
       const stateId = resolveStateRefInPack(pack, stateRef);
       if (stateId === null) return null;
       const state = pack?.states?.[stateId];
       if (!state || !isActive(state)) return null;
       const regiment = findRegimentByRef(state.military, regRef);
       if (!regiment) return null;
       return {
         state: { i: stateId, name: state.name ?? "" },
         regiment: { i: regiment.i, name: regiment.name ?? "" },
       };
       ```
     - `readNote(id)`:
       ```ts
       const notes = getNotes<RawNote>();
       const entry = notes?.find((n) => n?.id === id);
       if (!entry) return null;
       return {
         id,
         name: entry.name ?? "",
         legend: entry.legend ?? "",
       };
       ```
     - `removeNote(id)`:
       ```ts
       const notes = getNotes<RawNote>();
       if (!Array.isArray(notes)) {
         throw new Error(
           "window.notes is not available; the map hasn't finished loading.",
         );
       }
       const idx = notes.findIndex((n) => n?.id === id);
       if (idx >= 0) notes.splice(idx, 1);
       ```
     - `regenerate(stateId, regimentI)`:
       ```ts
       const military = getGlobal<MilitaryModule>("Military");
       if (!military || typeof military.generateNote !== "function") {
         throw new Error(
           "Military.generateNote is not available; the map hasn't finished loading.",
         );
       }
       const pack = getPack<BurgPackLike>();
       const state = pack?.states?.[stateId];
       if (!state) throw new Error(`State ${stateId} not found.`);
       const reg = findRegimentByRef(state.military, regimentI);
       if (!reg) {
         throw new Error(
           `Regiment ${regimentI} not found in state ${stateId}.`,
         );
       }
       military.generateNote(reg as RawRegiment, state as RawState);
       ```
   - Implement `createRegenerateRegimentLegendTool(runtime = defaultRegenerateRegimentLegendRuntime)`:
     - `name: "regenerate_regiment_legend"`.
     - Description: explain it mirrors the Regiment Editor's
       per-regiment "Regenerate Legend" button. State + regiment
       resolved as `(state, regiment)` pair (same shape as
       `rename_regiment`). Splices any existing
       `regiment{stateId}-{regimentI}` note out of `window.notes`,
       then calls `Military.generateNote(reg, state)` which pushes a
       fresh procedural legend (covers stationing burg/province,
       formation year, optional campaign, and unit composition).
       Returns the previous note (if any) and the new note. Distinct
       from `set_note` (which writes a user-supplied legend) and
       `regenerate_regiment_names` (which regenerates regiment
       NAMES, not their NOTES).
     - `input_schema`:
       ```ts
       {
         type: "object",
         properties: {
           state: {
             type: ["integer", "string"],
             description:
               "Owning state — numeric id (0 is valid = Neutrals) or case-insensitive state name / fullName.",
           },
           regiment: {
             type: ["integer", "string"],
             description:
               "Numeric regiment id (regiment.i, per-state) or case-insensitive current regiment name within that state.",
           },
         },
         required: ["state", "regiment"],
       }
       ```
     - `execute(rawInput)`:
       1. `const input = (rawInput ?? {}) as { state?: unknown; regiment?: unknown; };`.
       2. `if (!isValidRef(input.state)) return errorResult("state must be a non-negative integer id or a non-empty name string.");`
       3. `if (!isValidRef(input.regiment)) return errorResult("regiment must be a non-negative integer id or a non-empty name string.");`
       4. `const stateRef = input.state as number | string;`
          `const regRef = input.regiment as number | string;`
       5. `const found = runtime.find(stateRef, regRef);`
          `if (!found) return errorResult(\`No regiment found matching state=\${JSON.stringify(stateRef)}, regiment=\${JSON.stringify(regRef)}.\`);`
       6. `const noteId = \`regiment\${found.state.i}-\${found.regiment.i}\`;`
       7. `let previousNote: RegenerateRegimentLegendNoteRef | null = null;`
          `try { previousNote = runtime.readNote(noteId); } catch { previousNote = null; }`
       8. `try { runtime.removeNote(noteId); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
       9. `try { runtime.regenerate(found.state.i, found.regiment.i); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
       10. `let newNote: RegenerateRegimentLegendNoteRef | null = null;`
           `try { newNote = runtime.readNote(noteId); } catch { newNote = null; }`
       11. `return okResult({ state: found.state, regiment: found.regiment, note_id: noteId, previous_note: previousNote, note: newNote });`
   - Export:
     - `export const regenerateRegimentLegendTool = createRegenerateRegimentLegendTool();`

2. **Create the test file** `src/ai/tools/regenerate-regiment-legend.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawNote, RawRegiment, RawState } from "./_shared";
     import { ToolRegistry } from "./index";
     import {
       createRegenerateRegimentLegendTool,
       type RegenerateRegimentLegendFound,
       type RegenerateRegimentLegendNoteRef,
       type RegenerateRegimentLegendRuntime,
       regenerateRegimentLegendTool,
     } from "./regenerate-regiment-legend";
     ```
   - Helper:
     ```ts
     interface Fixtures {
       find?: (
         stateRef: number | string,
         regRef: number | string,
       ) => RegenerateRegimentLegendFound | null;
       readNote?: (id: string) => RegenerateRegimentLegendNoteRef | null;
       removeNote?: (id: string) => void;
       regenerate?: (stateId: number, regimentI: number) => void;
     }

     function makeRuntime(f: Fixtures = {}) {
       const find = vi.fn<RegenerateRegimentLegendRuntime["find"]>(
         f.find ?? (() => null),
       );
       const readNote = vi.fn<RegenerateRegimentLegendRuntime["readNote"]>(
         f.readNote ?? (() => null),
       );
       const removeNote = vi.fn<RegenerateRegimentLegendRuntime["removeNote"]>(
         f.removeNote ?? (() => {}),
       );
       const regenerate = vi.fn<RegenerateRegimentLegendRuntime["regenerate"]>(
         f.regenerate ?? (() => {}),
       );
       const runtime: RegenerateRegimentLegendRuntime = {
         find,
         readNote,
         removeNote,
         regenerate,
       };
       return { runtime, find, readNote, removeNote, regenerate };
     }
     ```
   - `describe("regenerate_regiment_legend tool", () => { ... })`:
     - **§1 Happy path: pre-existing note replaced; ORDER asserted.**
       - `find` returns `{ state: { i: 3, name: "Valoria" }, regiment: { i: 1, name: "5th Cohort" } }`.
       - `readNote` mock: first call returns
         `{ id: "regiment3-1", name: "5th Cohort", legend: "Old legend" }`,
         second call returns
         `{ id: "regiment3-1", name: "5th Cohort", legend: "New legend" }`.
         (Use `vi.fn().mockImplementationOnce(...).mockImplementationOnce(...)`.)
       - Execute `{ state: "Valoria", regiment: 1 }`.
       - Assertions:
         - `result.isError` falsy.
         - `find.mock.calls[0]` deep-equals `["Valoria", 1]`.
         - `removeNote.mock.calls[0]` deep-equals `["regiment3-1"]`.
         - `regenerate.mock.calls[0]` deep-equals `[3, 1]`.
         - `readNote.mock.calls.length === 2`; both with `"regiment3-1"`.
         - **ORDER**: `removeNote.mock.invocationCallOrder[0] < regenerate.mock.invocationCallOrder[0]`.
         - `JSON.parse(result.content)` deep-equals
           ```ts
           {
             ok: true,
             state: { i: 3, name: "Valoria" },
             regiment: { i: 1, name: "5th Cohort" },
             note_id: "regiment3-1",
             previous_note: { id: "regiment3-1", name: "5th Cohort", legend: "Old legend" },
             note: { id: "regiment3-1", name: "5th Cohort", legend: "New legend" },
           }
           ```
     - **§2 Happy path: NO pre-existing note → previous_note=null; new note returned.**
       - `find` as in §1.
       - `readNote` returns `null` first call; new note second call.
       - Body has `previous_note: null`, `note: { ... }`.
       - `removeNote` was still called once with `"regiment3-1"`.
       - `regenerate` called once.
       - ORDER preserved.
     - **§3 `regenerate` succeeds but post-call note still missing → ok with note=null.**
       - `find` returns the regiment.
       - `readNote` returns `null` both times.
       - `regenerate` is a no-op spy (succeeds).
       - Result `isError` falsy. Body `previous_note: null`, `note: null`.
     - **§4 State/regiment resolution failure → error, no mutation.**
       - `find` returns `null`.
       - Execute `{ state: 999, regiment: 0 }`.
       - `result.isError === true`; body's `error` matches `/No regiment found matching state=999, regiment=0/`.
       - `readNote.mock.calls.length === 0`.
       - `removeNote.mock.calls.length === 0`.
       - `regenerate.mock.calls.length === 0`.
     - **§5 Invalid state ref shapes rejected before find.**
       - Loop over `[ {}, { state: null, regiment: 1 }, { state: "", regiment: 1 }, { state: -1, regiment: 1 }, { state: 1.5, regiment: 1 } ]`.
       - Each → `result.isError === true`; body's `error` matches `/state must be a non-negative integer/`.
       - `find.mock.calls.length === 0` after all iterations.
     - **§6 Invalid regiment ref shapes rejected before find.**
       - Loop over `[ { state: 1 }, { state: 1, regiment: null }, { state: 1, regiment: "" }, { state: 1, regiment: -1 }, { state: 1, regiment: 1.5 } ]`.
       - Each → `result.isError === true`; body's `error` matches `/regiment must be a non-negative integer/`.
       - `find.mock.calls.length === 0` after all iterations.
     - **§7 `removeNote` throws → error; `regenerate` NOT called.**
       - `find` returns the regiment.
       - `readNote` first call returns null (irrelevant).
       - `removeNote` throws `new Error("window.notes is not available; the map hasn't finished loading.")`.
       - Result `isError: true`; body's `error` is exactly
         `"window.notes is not available; the map hasn't finished loading."`.
       - `regenerate.mock.calls.length === 0`.
     - **§8 `regenerate` throws (Military.generateNote missing) → error; removeNote DID happen; ORDER pinned.**
       - `find` returns the regiment.
       - `readNote` returns the previous note first call.
       - `removeNote` is a successful spy.
       - `regenerate` throws `new Error("Military.generateNote is not available; the map hasn't finished loading.")`.
       - Result `isError: true`; body's `error` matches `/Military\.generateNote is not available/`.
       - `removeNote.mock.calls.length === 1`.
       - `removeNote.mock.invocationCallOrder[0] < regenerate.mock.invocationCallOrder[0]`.
     - **§9 `regenerate` throws generic runtime error → propagated.**
       - `find` returns the regiment.
       - `regenerate` throws `new Error("boom")`.
       - Body `error` matches `/boom/`.
     - **§10 Tool name + schema + registry round-trip.**
       - `expect(regenerateRegimentLegendTool.name).toBe("regenerate_regiment_legend");`
       - `expect(regenerateRegimentLegendTool.input_schema.required).toEqual(["state", "regiment"]);`
       - Build a fresh `ToolRegistry`, register, assert
         `reg.list().map(t => t.name).includes("regenerate_regiment_legend")`.
     - **§11 Splice-then-push ORDER explicitly verified via shared log. LOAD-BEARING.**
       - `const mutationLog: string[] = [];`
       - `find` returns the regiment.
       - `removeNote: () => { mutationLog.push("remove"); }`.
       - `regenerate: () => { mutationLog.push("regen"); }`.
       - `readNote` returns null first call, the new note second.
       - Execute `{ state: 1, regiment: 0 }`.
       - Assertions:
         - `result.isError` falsy.
         - `mutationLog` deep-equals `["remove", "regen"]`.

   - `describe("defaultRegenerateRegimentLegendRuntime (integration)", () => { ... })`:
     - Save/restore `globalThis.pack`, `globalThis.Military`,
       `globalThis.notes` per test.
     - Helper to populate baseline state used in multiple tests:
       ```ts
       function setupPackAndMilitary() {
         const states: RawState[] = [];
         states[0] = { i: 0, name: "Neutrals" };
         states[1] = {
           i: 1,
           name: "Valoria",
           military: [
             { i: 0, name: "1st Legion", cell: 10, n: 0 },
             { i: 1, name: "5th Cohort", cell: 11, n: 0 },
           ],
         };
         (globalThis as { pack?: unknown }).pack = { states };
         (globalThis as { Military?: unknown }).Military = {
           generateNote: vi.fn((reg: RawRegiment, state: RawState) => {
             const notes = (globalThis as { notes?: RawNote[] }).notes;
             if (!Array.isArray(notes)) return;
             notes.push({
               id: `regiment${state.i}-${reg.i}`,
               name: reg.name ?? "",
               legend: `Fresh legend for ${reg.name ?? ""}`,
             });
           }),
         };
       }
       ```
     - Save/restore originals via `beforeEach` / `afterEach`:
       ```ts
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalMilitary = (globalThis as { Military?: unknown }).Military;
       const originalNotes = (globalThis as { notes?: unknown }).notes;
       afterEach(() => {
         (globalThis as { pack?: unknown }).pack = originalPack;
         (globalThis as { Military?: unknown }).Military = originalMilitary;
         (globalThis as { notes?: unknown }).notes = originalNotes;
       });
       ```
     - **§12 End-to-end with populated globals: pre-existing note replaced.**
       - Call `setupPackAndMilitary()`.
       - `(globalThis as { notes?: RawNote[] }).notes = [{ id: "regiment1-1", name: "5th Cohort", legend: "Old legend" }, { id: "regiment1-0", name: "1st Legion", legend: "Untouched" }];`
       - Execute `regenerateRegimentLegendTool.execute({ state: "Valoria", regiment: 1 })`.
       - Assertions:
         - `result.isError` falsy.
         - Body deep-shape:
           - `state: { i: 1, name: "Valoria" }`
           - `regiment: { i: 1, name: "5th Cohort" }`
           - `note_id: "regiment1-1"`
           - `previous_note: { id: "regiment1-1", name: "5th Cohort", legend: "Old legend" }`
           - `note: { id: "regiment1-1", name: "5th Cohort", legend: "Fresh legend for 5th Cohort" }`
         - `notes.length === 2`.
         - `notes.find(n => n.id === "regiment1-0")` deep-equals
           `{ id: "regiment1-0", name: "1st Legion", legend: "Untouched" }` (sibling untouched).
         - `notes.find(n => n.id === "regiment1-1")?.legend === "Fresh legend for 5th Cohort"` (the new one, not the old).
         - `Military.generateNote` called once with `(reg, state)` where `reg.i === 1` and `state.i === 1`.
     - **§13 No pre-existing note → new note appended.**
       - Setup as above.
       - `notes = [{ id: "regiment1-0", name: "1st Legion", legend: "Untouched" }];` (no entry for regiment 1).
       - Execute `{ state: 1, regiment: 1 }`.
       - Body `previous_note: null`, `note.legend === "Fresh legend for 5th Cohort"`.
       - `notes.length === 2` (1 pre-existing + 1 new).
     - **§14 Missing Military global → error; previous note IS gone (documented).**
       - Setup pack + notes as in §12.
       - `(globalThis as { Military?: unknown }).Military = undefined;`
       - Execute `{ state: 1, regiment: 1 }`.
       - Result `isError: true`; error matches `/Military\.generateNote is not available/`.
       - `(globalThis as { notes: RawNote[] }).notes.find(n => n.id === "regiment1-1")` is undefined.
     - **§15 Missing notes global → error, NO regenerate call.**
       - Setup pack + Military as in §12.
       - `(globalThis as { notes?: unknown }).notes = undefined;`
       - Execute `{ state: 1, regiment: 1 }`.
       - Result `isError: true`; error matches `/window\.notes is not available/`.
       - `Military.generateNote` was NOT called.
         (Use `(globalThis as { Military: { generateNote: ReturnType<typeof vi.fn> } }).Military.generateNote.mock.calls.length === 0`.)
     - **§16 State ref doesn't resolve → error.**
       - Setup pack with only Neutrals (no state 999).
       - Notes populated.
       - Execute `{ state: 999, regiment: 0 }`.
       - Result `isError: true`; error matches `/No regiment found matching state=999, regiment=0/`.
       - `notes` array unchanged (assert by length AND by snapshot of contents).
     - **§17 Case-insensitive state name + per-state regiment id.**
       - Setup as in §12 (pack + Military + notes).
       - Execute `{ state: "VALORIA", regiment: 0 }`.
       - Body `state.i === 1`, `regiment.i === 0`, `note_id: "regiment1-0"`.
       - `previous_note.legend === "Untouched"`.
       - `note.legend === "Fresh legend for 1st Legion"`.

3. **Modify `src/ai/index.ts`**:
   - Add `import { regenerateRegimentLegendTool } from "./tools/regenerate-regiment-legend";`
     between `regenerate-province-name` (line 196) and
     `regenerate-regiment-names` (line 197).
     String compare: `regenerate-regiment-legend` < `regenerate-regiment-names`
     (`l` < `n`). Final order:
     ```ts
     import { regenerateProvinceNameTool } from "./tools/regenerate-province-name";
     import { regenerateRegimentLegendTool } from "./tools/regenerate-regiment-legend";
     import { regenerateRegimentNamesTool } from "./tools/regenerate-regiment-names";
     ```
   - Add re-export block immediately before the
     `regenerate-regiment-names` re-export (around line 1937):
     ```ts
     export {
       createRegenerateRegimentLegendTool,
       defaultRegenerateRegimentLegendRuntime,
       type RegenerateRegimentLegendFound,
       type RegenerateRegimentLegendNoteRef,
       type RegenerateRegimentLegendRegimentRef,
       type RegenerateRegimentLegendRuntime,
       type RegenerateRegimentLegendStateRef,
       regenerateRegimentLegendTool,
     } from "./tools/regenerate-regiment-legend";
     ```
     (Biome will normalize the order — confirm post-lint.)
   - Add `registry.register(regenerateRegimentLegendTool);` immediately
     before `registry.register(regenerateRegimentNamesTool);`
     (line 3000). Topical grouping with the other regenerate-regiment-*
     tools.

4. **Run verification**:
   - `npm test` (must be green; new file's tests must pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -10` (must report 0 errors / 0 warnings, matching baseline).

5. **Commit on `plan-339-regenerate-regiment-legend` branch** with the message specified in the prompt. Do NOT push.
