# Tasks 340: `remove_all_markers` tool

Sequenced implementation tasks for plan 340.

1. **Create the tool file** `src/ai/tools/remove-all-markers.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `getGlobal`, `getNotes`, `getPack`, `okResult`,
       type `RawMarker`, type `RawNote`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define exported types:
     ```ts
     export interface RemoveAllMarkersRuntime {
       getMarkers(): RawMarker[] | undefined;
       setMarkers(arr: RawMarker[]): void;
       getNotes(): RawNote[] | undefined;
       setNotes(arr: RawNote[]): void;
       removeDomNode(id: string): void;
       addLines?(): void;
     }
     ```
   - Internal types (not exported):
     ```ts
     interface MutableMarkerPack {
       markers?: RawMarker[];
     }
     ```
   - Implement `defaultRemoveAllMarkersRuntime`:
     ```ts
     export const defaultRemoveAllMarkersRuntime: RemoveAllMarkersRuntime = {
       getMarkers(): RawMarker[] | undefined {
         const pack = getPack<MutableMarkerPack>();
         const markers = pack?.markers;
         return Array.isArray(markers) ? markers : undefined;
       },
       setMarkers(arr: RawMarker[]): void {
         const pack = getPack<MutableMarkerPack>();
         if (pack) pack.markers = arr;
       },
       getNotes(): RawNote[] | undefined {
         return getNotes<RawNote>();
       },
       setNotes(arr: RawNote[]): void {
         (globalThis as Record<string, unknown>).notes = arr;
       },
       removeDomNode(id: string): void {
         if (typeof document === "undefined") return;
         try {
           document.getElementById(id)?.remove();
         } catch {
           // best-effort: SVG state churn can throw; we don't want a
           // half-cleared world.
         }
       },
       addLines(): void {
         const fn = getGlobal<() => void>("addLines");
         if (typeof fn !== "function") return;
         try {
           fn();
         } catch {
           // best-effort: the markers overview may not be open or
           // may be mid-mutation; never fail the tool because of it.
         }
       },
     };
     ```
   - Implement `createRemoveAllMarkersTool(runtime = defaultRemoveAllMarkersRuntime)`:
     - `name: "remove_all_markers"`.
     - Description: explain it mirrors the Markers Overview's "Remove
       all markers" button (`removeAllMarkers` in
       `public/modules/ui/markers-overview.js`). Filters
       `pack.markers` to keep only locked markers (REASSIGNS
       `pack.markers`), removes the SVG `#marker{i}` elements for the
       dropped markers, prunes `window.notes` entries with matching
       `marker{i}` ids (REASSIGNS `notes`), and best-effort calls
       `addLines()` to refresh the overview. Locked markers
       (`marker.lock === true`) are PRESERVED. Destructive: there is
       no undo. Returns `{ previous_count, removed_count, kept_count,
       removed_marker_ids, removed_marker_ids_truncated }` where
       `removed_marker_ids` lists up to the first 50 removed ids in
       ascending order.
     - `input_schema`:
       ```ts
       {
         type: "object",
         properties: {},
       }
       ```
     - `execute(_rawInput)`:
       1. `const markers = runtime.getMarkers();`
       2. `if (!Array.isArray(markers)) return errorResult("window.pack.markers is not available; the map hasn't finished loading.");`
       3. Walk `markers` once:
          ```ts
          const kept: RawMarker[] = [];
          const removedIds: number[] = [];
          for (const m of markers) {
            if (m && m.lock === true) {
              kept.push(m);
            } else if (m) {
              removedIds.push(m.i);
            }
          }
          ```
          (Defensive: skip falsy entries entirely; they're not part of
          either bucket. The legacy code dereferences `{i, lock}` and
          would NPE on a falsy entry, but we play safe.)
       4. `const previous_count = markers.length;`
          `const removed_count = removedIds.length;`
          `const kept_count = kept.length;`
       5. For each `id` in `removedIds`:
          `runtime.removeDomNode(\`marker\${id}\`);`
       6. `try { runtime.setMarkers(kept); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`
       7. Notes pruning (only when there are removals):
          ```ts
          if (removedIds.length > 0) {
            const notes = runtime.getNotes();
            if (Array.isArray(notes)) {
              const removedSet = new Set(
                removedIds.map((i) => `marker${i}`),
              );
              const filtered = notes.filter(
                (n) => !(n && removedSet.has(n.id)),
              );
              try {
                runtime.setNotes(filtered);
              } catch (err) {
                return errorResult(
                  err instanceof Error ? err.message : String(err),
                );
              }
            }
          }
          ```
       8. `runtime.addLines?.();` (the runtime contract is "swallows its
          own errors"; we just call it).
       9. Sort `removedIds` ascending, compute the cap:
          ```ts
          const sorted = [...removedIds].sort((a, b) => a - b);
          const truncated = sorted.length > 50;
          const removed_marker_ids = truncated ? sorted.slice(0, 50) : sorted;
          ```
       10. Return:
           ```ts
           okResult({
             previous_count,
             removed_count,
             kept_count,
             removed_marker_ids,
             removed_marker_ids_truncated: truncated,
           });
           ```
   - Export:
     - `export const removeAllMarkersTool = createRemoveAllMarkersTool();`

2. **Create the test file** `src/ai/tools/remove-all-markers.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawMarker, RawNote } from "./_shared";
     import { ToolRegistry } from "./index";
     import {
       createRemoveAllMarkersTool,
       type RemoveAllMarkersRuntime,
       removeAllMarkersTool,
     } from "./remove-all-markers";
     ```
   - Helper:
     ```ts
     interface Fixtures {
       getMarkers?: () => RawMarker[] | undefined;
       setMarkers?: (arr: RawMarker[]) => void;
       getNotes?: () => RawNote[] | undefined;
       setNotes?: (arr: RawNote[]) => void;
       removeDomNode?: (id: string) => void;
       addLines?: () => void;
       includeAddLines?: boolean; // default true
     }

     function makeRuntime(f: Fixtures = {}) {
       const getMarkers = vi.fn<RemoveAllMarkersRuntime["getMarkers"]>(
         f.getMarkers ?? (() => []),
       );
       const setMarkers = vi.fn<RemoveAllMarkersRuntime["setMarkers"]>(
         f.setMarkers ?? (() => {}),
       );
       const getNotes = vi.fn<RemoveAllMarkersRuntime["getNotes"]>(
         f.getNotes ?? (() => []),
       );
       const setNotes = vi.fn<RemoveAllMarkersRuntime["setNotes"]>(
         f.setNotes ?? (() => {}),
       );
       const removeDomNode = vi.fn<RemoveAllMarkersRuntime["removeDomNode"]>(
         f.removeDomNode ?? (() => {}),
       );
       const addLines = vi.fn(f.addLines ?? (() => {}));
       const runtime: RemoveAllMarkersRuntime = {
         getMarkers,
         setMarkers,
         getNotes,
         setNotes,
         removeDomNode,
         ...(f.includeAddLines === false ? {} : { addLines }),
       };
       return {
         runtime,
         getMarkers,
         setMarkers,
         getNotes,
         setNotes,
         removeDomNode,
         addLines,
       };
     }
     ```
   - `describe("remove_all_markers tool", () => { ... })`:
     - **§1 Happy path: 5 markers, 2 locked → 3 removed; identity check.**
       - `const sourceMarkers: RawMarker[] = [{ i: 1, lock: true }, { i: 2 }, { i: 3 }, { i: 4, lock: true }, { i: 7 }];`
       - `const sourceNotes: RawNote[] = [];`
       - Build runtime: `getMarkers: () => sourceMarkers`,
         `getNotes: () => sourceNotes`. Capture `setMarkers` arg.
       - Execute `{}`. Assertions:
         - `result.isError` falsy.
         - `setMarkers.mock.calls.length === 1`.
         - `const passed = setMarkers.mock.calls[0][0] as RawMarker[];`
         - `expect(passed).not.toBe(sourceMarkers); // identity-distinct`
         - `expect(passed.map(m => m.i)).toEqual([1, 4]);`
         - `removeDomNode.mock.calls.flat()` deep-equals
           `["marker2", "marker3", "marker7"]`.
         - `expect(removeDomNode.mock.calls.flat()).not.toContain("marker1");`
           and same for `"marker4"`.
         - `addLines.mock.calls.length === 1`.
         - `JSON.parse(result.content)` deep-equals
           ```ts
           {
             ok: true,
             previous_count: 5,
             removed_count: 3,
             kept_count: 2,
             removed_marker_ids: [2, 3, 7],
             removed_marker_ids_truncated: false,
           }
           ```
     - **§2 DOM cleanup: locked DOM untouched.**
       - `markers = [{ i: 1, lock: true }, { i: 2 }, { i: 3, lock: true }];`
       - Execute `{}`.
       - `removeDomNode.mock.calls` deep-equals `[["marker2"]]`.
     - **§3 Notes pruning + identity check.**
       - `markers = [{ i: 1, lock: true }, { i: 3 }];`
       - `const sourceNotes: RawNote[] = [{ id: "marker1", legend: "keeps" }, { id: "marker3", legend: "goes" }, { id: "markerX", legend: "unrelated" }];`
       - Execute `{}`.
       - `setNotes.mock.calls.length === 1`.
       - `const passedNotes = setNotes.mock.calls[0][0] as RawNote[];`
       - `expect(passedNotes).not.toBe(sourceNotes); // identity-distinct`
       - `expect(passedNotes.map(n => n.id)).toEqual(["marker1", "markerX"]);`
     - **§4 All locked → setNotes NOT called; setMarkers IS called.**
       - `const sourceMarkers: RawMarker[] = [{ i: 1, lock: true }, { i: 2, lock: true }];`
       - `getNotes` returns `[{id:"marker1"}, {id:"markerX"}]`.
       - Execute `{}`.
       - `setNotes.mock.calls.length === 0` (no removals → skip).
       - `setMarkers.mock.calls.length === 1`.
       - `const passed = setMarkers.mock.calls[0][0] as RawMarker[];`
       - `expect(passed).not.toBe(sourceMarkers); // still reassigned`
       - `expect(passed.map(m => m.i)).toEqual([1, 2]);`
       - `addLines.mock.calls.length === 1` (still called).
     - **§5 All locked: zeros + addLines still called.**
       - Same setup as §4.
       - Body: `{ ok:true, previous_count:2, removed_count:0,
         kept_count:2, removed_marker_ids:[], removed_marker_ids_truncated:false }`.
       - `removeDomNode.mock.calls.length === 0`.
     - **§6 All unlocked → all removed.**
       - `markers = [{ i: 1 }, { i: 2 }, { i: 3 }];`
       - Body: `previous_count:3, removed_count:3, kept_count:0,
         removed_marker_ids:[1,2,3], removed_marker_ids_truncated:false`.
       - `setMarkers` called once with `[]`.
     - **§7 Empty markers → ok with all zeros.**
       - `markers = []`.
       - Body: `previous_count:0, removed_count:0, kept_count:0,
         removed_marker_ids:[], removed_marker_ids_truncated:false`.
       - `setMarkers` called once with `[]` (identity-distinct from
         input — confirm via `passed !== sourceMarkers`).
       - `removeDomNode.mock.calls.length === 0`.
       - `setNotes.mock.calls.length === 0`.
     - **§8 Missing pack.markers → error; no mutations.**
       - `getMarkers: () => undefined`.
       - Result `isError: true`; error matches
         `/window\.pack\.markers is not available/`.
       - `setMarkers`, `setNotes`, `removeDomNode`, `addLines` ALL never called.
     - **§9 Non-array pack.markers → error.**
       - `getMarkers: () => "oops" as unknown as RawMarker[]`.
       - Same error as §8.
     - **§10 Missing/non-array notes → tool succeeds, setNotes not called.**
       - `markers = [{ i: 5 }]`.
       - `getNotes: () => undefined`.
       - Body has `removed_count:1`, `removed_marker_ids:[5]`.
       - `setNotes.mock.calls.length === 0`.
       - `setMarkers.mock.calls.length === 1`.
     - **§11 removed_marker_ids capped at 50; truncated flag.**
       - `markers = Array.from({ length: 70 }, (_, k) => ({ i: k + 1 }));`
       - Execute `{}`. Body:
         - `previous_count:70, removed_count:70, kept_count:0`.
         - `removed_marker_ids.length === 50`.
         - `removed_marker_ids[0] === 1`.
         - `removed_marker_ids[49] === 50`.
         - `removed_marker_ids_truncated === true`.
     - **§12 Boundary: exactly 50 removals → not truncated.**
       - `markers = Array.from({ length: 50 }, (_, k) => ({ i: k + 1 }));`
       - Body: `removed_marker_ids.length === 50`,
         `removed_marker_ids_truncated === false`.
     - **§13 removed_marker_ids ordering deterministic (ascending).**
       - `markers = [{ i: 9 }, { i: 1 }, { i: 5 }, { i: 3 }, { i: 7 }];`
       - Body: `removed_marker_ids` deep-equals `[1, 3, 5, 7, 9]`.
     - **§14 addLines absent → no error.**
       - Build runtime with `includeAddLines: false`.
         `markers = [{ i: 1 }];`
       - Execute `{}`. Result `isError` falsy.
     - **§15 Tool name + schema + registry round-trip.**
       - `expect(removeAllMarkersTool.name).toBe("remove_all_markers");`
       - `expect(removeAllMarkersTool.input_schema).toEqual({ type: "object", properties: {} });`
       - Build a fresh `ToolRegistry`, register, assert
         `reg.list().map(t => t.name).includes("remove_all_markers")`.
     - **§16 Tolerates extraneous / null / undefined input.**
       - `tool.execute({ bogus: "value" })` succeeds (uses fresh
         `markers = []` setup so result is the empty-zero shape).
       - `tool.execute(null)` succeeds.
       - `tool.execute(undefined)` succeeds.

   - `describe("defaultRemoveAllMarkersRuntime (integration)", () => { ... })`:
     - Save/restore `globalThis.pack`, `globalThis.notes`,
       `globalThis.addLines`, `globalThis.document` per test.
       ```ts
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalNotes = (globalThis as { notes?: unknown }).notes;
       const originalAddLines = (globalThis as { addLines?: unknown }).addLines;
       const originalDocument = (globalThis as { document?: unknown }).document;
       afterEach(() => {
         (globalThis as { pack?: unknown }).pack = originalPack;
         (globalThis as { notes?: unknown }).notes = originalNotes;
         (globalThis as { addLines?: unknown }).addLines = originalAddLines;
         (globalThis as { document?: unknown }).document = originalDocument;
       });
       ```
     - Helper: a fake document factory that returns elements which
       record their `.remove()` calls into a shared array:
       ```ts
       function makeFakeDocument(removed: string[]) {
         return {
           getElementById(id: string) {
             return {
               remove() {
                 removed.push(id);
               },
             };
           },
         };
       }
       ```
     - **§17 End-to-end: pack + notes + DOM + addLines wired.**
       - `const pack = { markers: [{ i: 1 }, { i: 2, lock: true }, { i: 3 }, { i: 4 }] as RawMarker[] };`
       - `(globalThis as { pack?: unknown }).pack = pack;`
       - `const initialNotes: RawNote[] = [{ id: "marker1", legend: "L1" }, { id: "marker3", legend: "L3" }, { id: "markerX", legend: "unrelated" }];`
       - `(globalThis as { notes?: unknown }).notes = initialNotes;`
       - `const removed: string[] = [];`
       - `(globalThis as { document?: unknown }).document = makeFakeDocument(removed);`
       - `const addLinesSpy = vi.fn();`
       - `(globalThis as { addLines?: unknown }).addLines = addLinesSpy;`
       - `const beforeMarkers = pack.markers;`
       - `const beforeNotes = (globalThis as { notes: RawNote[] }).notes;`
       - Execute `removeAllMarkersTool.execute({})`.
       - Assertions:
         - `result.isError` falsy.
         - `JSON.parse(result.content)` deep-equals
           `{ ok:true, previous_count:4, removed_count:3, kept_count:1,
             removed_marker_ids:[1,3,4], removed_marker_ids_truncated:false }`.
         - `expect(pack.markers).not.toBe(beforeMarkers); // reassigned`
         - `pack.markers.length === 1`.
         - `pack.markers[0].i === 2`.
         - `const notesAfter = (globalThis as { notes: RawNote[] }).notes;`
         - `expect(notesAfter).not.toBe(beforeNotes); // reassigned`
         - `notesAfter.length === 1`.
         - `notesAfter[0].id === "markerX"`.
         - `removed` deep-equals `["marker1", "marker3", "marker4"]`.
         - `expect(removed).not.toContain("marker2"); // locked DOM untouched`
         - `addLinesSpy.mock.calls.length === 1`.
     - **§18 addLines throws → tool still succeeds; data mutations applied.**
       - Same setup as §17, but `addLines` throws:
         ```ts
         (globalThis as { addLines?: unknown }).addLines = vi.fn(() => {
           throw new Error("boom");
         });
         ```
       - Execute. Result `isError` falsy.
       - Body unchanged (same shape as §17).
       - `pack.markers.length === 1`.
       - `notesAfter.length === 1`.
     - **§19 addLines absent → tool succeeds.**
       - Same setup as §17 but `globalThis.addLines = undefined`.
       - Result `isError` falsy.
     - **§20 Missing pack.markers → error; notes / document untouched.**
       - `(globalThis as { pack?: unknown }).pack = {};`
       - `(globalThis as { notes?: unknown }).notes = [{ id: "marker1" }];`
       - `const removed: string[] = [];`
       - `(globalThis as { document?: unknown }).document = makeFakeDocument(removed);`
       - Execute. Result `isError: true`; error matches
         `/window\.pack\.markers is not available/`.
       - `(globalThis as { notes: RawNote[] }).notes.length === 1` (untouched).
       - `removed` is `[]`.
     - **§21 Missing notes global → tool succeeds; markers cleared.**
       - `(globalThis as { pack?: unknown }).pack = { markers: [{ i: 1 }] };`
       - `(globalThis as { notes?: unknown }).notes = undefined;`
       - `(globalThis as { document?: unknown }).document = makeFakeDocument([]);`
       - Execute. Result `isError` falsy. Body `removed_count:1`.
       - Pack markers length 0.
       - `(globalThis as { notes?: unknown }).notes` is still
         `undefined` (or whatever — assert it remains the same value
         we set).
     - **§22 document undefined → DOM removal silently skipped.**
       - `(globalThis as { pack?: unknown }).pack = { markers: [{ i: 1 }, { i: 2, lock: true }] };`
       - `(globalThis as { notes?: unknown }).notes = [];`
       - `(globalThis as { document?: unknown }).document = undefined;`
       - Execute. Result `isError` falsy. Body `removed_count:1`.
       - Pack markers length 1 (the locked one).
     - **§23 document.getElementById(...).remove() throws → swallowed.**
       - `(globalThis as { pack?: unknown }).pack = { markers: [{ i: 1 }] };`
       - `(globalThis as { notes?: unknown }).notes = [];`
       - Fake document where `remove()` throws:
         ```ts
         (globalThis as { document?: unknown }).document = {
           getElementById() {
             return {
               remove() { throw new Error("svg gone"); },
             };
           },
         };
         ```
       - Execute. Result `isError` falsy. Body `removed_count:1`.
       - Pack markers length 0 (still reassigned correctly).

3. **Modify `src/ai/index.ts`**:
   - Add import. Slot alphabetically: `remove-all-markers` <
     `remove-burg` (compare at index 7: `a` < `b`). So insert
     IMMEDIATELY BEFORE `removeBurgTool` import (current line 208):
     ```ts
     import { removeAllMarkersTool } from "./tools/remove-all-markers";
     import { removeBurgTool } from "./tools/remove-burg";
     ```
     Final order: `remove-all-markers`, `remove-burg`,
     `remove-burg-group`, `remove-culture`, ...
   - Add re-export block immediately before the `remove-burg`
     re-export. The current block at lines 2008-2012 is:
     ```ts
     export {
       createRemoveBurgTool,
       removeBurgTool,
     } from "./tools/remove-burg";
     ```
     Insert before it:
     ```ts
     export {
       createRemoveAllMarkersTool,
       defaultRemoveAllMarkersRuntime,
       type RemoveAllMarkersRuntime,
       removeAllMarkersTool,
     } from "./tools/remove-all-markers";
     ```
     (Biome will normalize internal ordering — confirm post-lint.)
   - Add `registry.register(removeAllMarkersTool);` IMMEDIATELY BEFORE
     `registry.register(removeMarkerTool);` at line 3042. Topical
     grouping with the other marker-related registrations.

4. **Run verification**:
   - `npm test` (must be green; new file's tests must pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -10` (must report 0 errors / 0 warnings,
     matching baseline).

5. **Commit on `plan-340-remove-all-markers` branch** with the message
   specified in the prompt. Do NOT push.
