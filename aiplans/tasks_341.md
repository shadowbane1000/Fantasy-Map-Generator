# Tasks 341: `invert_marker_pins` tool

Sequenced implementation tasks for plan 341.

1. **Create the tool file** `src/ai/tools/invert-marker-pins.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `getGlobal`, `getPack`, `okResult`, type `RawMarker`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define exported types:
     ```ts
     export interface InvertMarkerPinsResult {
       total: number;
       now_pinned: number;
       now_unpinned: number;
       any_pinned: boolean;
     }

     export interface InvertMarkerPinsRuntime {
       getMarkers(): RawMarker[] | undefined;
       setMarkerGroupPinned(value: 1 | null): void;
       drawMarkers?: () => void;
       addLines?: () => void;
     }
     ```
   - Implement `defaultInvertMarkerPinsRuntime`:
     - `getMarkers()`:
       ```ts
       const pack = getPack<{ markers?: RawMarker[] }>();
       const markers = pack?.markers;
       return Array.isArray(markers) ? markers : undefined;
       ```
     - `setMarkerGroupPinned(value)`:
       ```ts
       if (typeof document === "undefined") return;
       const group = document.getElementById("markers");
       if (!group) return;
       if (value === 1) group.setAttribute("pinned", "1");
       else group.removeAttribute("pinned");
       ```
     - `drawMarkers()`:
       ```ts
       const fn = getGlobal<() => void>("drawMarkers");
       if (typeof fn === "function") fn();
       ```
     - `addLines()`:
       ```ts
       const fn = getGlobal<() => void>("addLines");
       if (typeof fn === "function") fn();
       ```
   - Implement `createInvertMarkerPinsTool(runtime = defaultInvertMarkerPinsRuntime)`:
     - `name: "invert_marker_pins"`.
     - Description: explain it mirrors the Markers Overview's "Invert
       pin" row-toolbar button (`invertPin` in
       `public/modules/ui/markers-overview.js`). For each marker in
       `pack.markers`, if `marker.pinned` is truthy → `delete
       marker.pinned`; else `marker.pinned = true`. Updates the
       `#markers` SVG group's `pinned` attribute to `"1"` if any
       marker ended up pinned, otherwise removes the attribute.
       Best-effort calls `drawMarkers()` and `addLines()` to refresh.
       Returns counts. Distinct from `set_marker_pinned` (single
       marker).
     - `input_schema`:
       ```ts
       {
         type: "object",
         properties: {},
       }
       ```
     - `execute(_rawInput)`:
       1. ```ts
          let markers: RawMarker[] | undefined;
          try {
            markers = runtime.getMarkers();
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
          ```
       2. ```ts
          if (!Array.isArray(markers)) {
            return errorResult(
              "window.pack.markers is not available; the map hasn't finished loading.",
            );
          }
          ```
       3. ```ts
          let nowPinned = 0;
          for (const marker of markers) {
            if (!marker) continue;
            if (marker.pinned) {
              delete marker.pinned;
            } else {
              marker.pinned = true;
              nowPinned++;
            }
          }
          const total = markers.length;
          const nowUnpinned = total - nowPinned;
          const anyPinned = nowPinned > 0;
          ```
       4. ```ts
          try {
            runtime.setMarkerGroupPinned(anyPinned ? 1 : null);
          } catch {
            // Best-effort.
          }
          ```
       5. ```ts
          if (typeof runtime.drawMarkers === "function") {
            try {
              runtime.drawMarkers();
            } catch {
              // Best-effort.
            }
          }
          if (typeof runtime.addLines === "function") {
            try {
              runtime.addLines();
            } catch {
              // Best-effort.
            }
          }
          ```
       6. ```ts
          return okResult({
            total,
            now_pinned: nowPinned,
            now_unpinned: nowUnpinned,
            any_pinned: anyPinned,
          });
          ```
   - Export `export const invertMarkerPinsTool = createInvertMarkerPinsTool();`

2. **Create the test file** `src/ai/tools/invert-marker-pins.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawMarker } from "./_shared";
     import {
       createInvertMarkerPinsTool,
       type InvertMarkerPinsRuntime,
       invertMarkerPinsTool,
     } from "./invert-marker-pins";
     import { ToolRegistry } from "./index";
     ```
   - Helper:
     ```ts
     interface MakeRuntimeOpts {
       markers?: RawMarker[] | undefined | unknown;
       drawMarkers?: () => void;
       addLines?: () => void;
       setMarkerGroupPinned?: (v: 1 | null) => void;
       getMarkersThrows?: Error;
     }

     function makeRuntime(opts: MakeRuntimeOpts = {}) {
       const setMarkerGroupPinned = vi.fn(opts.setMarkerGroupPinned ?? (() => {}));
       const drawMarkers = opts.drawMarkers ? vi.fn(opts.drawMarkers) : undefined;
       const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
       const getMarkers = vi.fn(() => {
         if (opts.getMarkersThrows) throw opts.getMarkersThrows;
         return opts.markers as RawMarker[] | undefined;
       });
       const runtime: InvertMarkerPinsRuntime = {
         getMarkers,
         setMarkerGroupPinned,
         drawMarkers,
         addLines,
       };
       return { runtime, getMarkers, setMarkerGroupPinned, drawMarkers, addLines };
     }
     ```
   - `describe("invert_marker_pins tool", () => { ... })`:
     - **§1 Happy path (mixed): 2 pinned + 1 unpinned → 1 pinned + 2 unpinned, delete semantics.**
       - `markers = [{ i: 1, pinned: true }, { i: 2 }, { i: 3, pinned: true }]`.
       - `const { runtime, setMarkerGroupPinned } = makeRuntime({ markers });`.
       - Execute `{}`.
       - Assertions:
         - `result.isError` falsy.
         - `JSON.parse(result.content)` deep-equals
           `{ ok: true, total: 3, now_pinned: 1, now_unpinned: 2, any_pinned: true }`.
         - `("pinned" in markers[0])` is `false`. **Load-bearing: delete-not-assignment.**
         - `markers[1].pinned === true`.
         - `("pinned" in markers[2])` is `false`.
         - `setMarkerGroupPinned.mock.calls.length === 1`.
         - `setMarkerGroupPinned.mock.calls[0][0] === 1`.
     - **§2 All unpinned → all pinned.**
       - `markers = [{ i: 1 }, { i: 2 }, { i: 3 }]`.
       - Execute `{}`.
       - Body: `{ ok: true, total: 3, now_pinned: 3, now_unpinned: 0, any_pinned: true }`.
       - Each marker: `marker.pinned === true`.
       - `setMarkerGroupPinned` called once with `1`.
     - **§3 All pinned → all unpinned, delete semantics for every marker.**
       - `markers = [{ i: 1, pinned: true }, { i: 2, pinned: true }, { i: 3, pinned: true }]`.
       - Execute `{}`.
       - Body: `{ ok: true, total: 3, now_pinned: 0, now_unpinned: 3, any_pinned: false }`.
       - For every marker: `("pinned" in marker)` is `false`. **Load-bearing.**
       - `setMarkerGroupPinned` called once with `null`.
     - **§4 Empty markers array → all zeros.**
       - `markers = []`.
       - Body: `{ ok: true, total: 0, now_pinned: 0, now_unpinned: 0, any_pinned: false }`.
       - `setMarkerGroupPinned` called once with `null`.
     - **§5 Missing `pack.markers` → exact error.**
       - `makeRuntime({ markers: undefined })`.
       - Body `error` is exactly
         `"window.pack.markers is not available; the map hasn't finished loading."`.
       - `setMarkerGroupPinned.mock.calls.length === 0`.
     - **§6 Non-array `pack.markers` → same error.**
       - `makeRuntime({ markers: "oops" as unknown as RawMarker[] })`.
       - Same exact error string.
     - **§7 `getMarkers()` throws → error propagated.**
       - `makeRuntime({ getMarkersThrows: new Error("boom") })`.
       - `result.isError === true`; body `error` matches `/boom/`.
     - **§8 `setMarkerGroupPinned` called with 1 when any pinned. (LOAD-BEARING)**
       - `markers = [{ i: 1 }]` (one becomes pinned).
       - Execute `{}`.
       - `setMarkerGroupPinned.mock.calls[0]` deep-equals `[1]`.
     - **§9 `setMarkerGroupPinned` called with null when none pinned. (LOAD-BEARING)**
       - `markers = [{ i: 1, pinned: true }]` (becomes unpinned).
       - Execute `{}`.
       - `setMarkerGroupPinned.mock.calls[0]` deep-equals `[null]`.
     - **§10 `drawMarkers` not provided → no error.**
       - `markers = [{ i: 1 }]`. No `drawMarkers` on opts.
       - Body still ok.
     - **§11 `addLines` not provided → no error.**
       - Same shape.
     - **§12 `drawMarkers` throws → swallowed; result ok; mutation applied.**
       - `markers = [{ i: 1 }]`.
       - `drawMarkers: () => { throw new Error("svg!"); }`.
       - Body still ok.
       - `markers[0].pinned === true` (mutation applied).
       - `setMarkerGroupPinned` was called with `1`.
     - **§13 `addLines` throws → swallowed; result ok.**
       - Same shape but for `addLines`.
     - **§14 `setMarkerGroupPinned` throws → swallowed; result ok.**
       - `markers = [{ i: 1 }]`.
       - `setMarkerGroupPinned: () => { throw new Error("dom!"); }`.
       - Body still ok; `markers[0].pinned === true`.
     - **§15 In-place mutation (identity preserved). LOAD-BEARING.**
       - `const markers: RawMarker[] = [{ i: 1, pinned: true }, { i: 2 }];`
       - Capture `const before = markers;`.
       - `const { runtime, getMarkers } = makeRuntime({ markers });`
       - Execute `{}`.
       - Assertions:
         - `markers === before` (Vitest `toBe` for reference equality).
         - The markers array reported by `getMarkers()` is the same
           reference (since the runtime reads from a closure). Use
           `getMarkers.mock.results[0].value` and assert it `=== before`.
     - **§16 `any_pinned === now_pinned > 0` across scenarios.**
       - Use `it.each` over four cases:
         ```ts
         [
           { markers: [{ i: 1, pinned: true }, { i: 2 }, { i: 3, pinned: true }],
             expectedPinned: 1, expectedAny: true },
           { markers: [{ i: 1 }, { i: 2 }, { i: 3 }],
             expectedPinned: 3, expectedAny: true },
           { markers: [{ i: 1, pinned: true }, { i: 2, pinned: true }],
             expectedPinned: 0, expectedAny: false },
           { markers: [],
             expectedPinned: 0, expectedAny: false },
         ]
         ```
       - For each, assert `body.any_pinned === (body.now_pinned > 0)` AND
         `body.any_pinned === expectedAny` AND
         `body.now_pinned === expectedPinned`.
     - **§17 Tool name + schema + registry round-trip.**
       - `expect(invertMarkerPinsTool.name).toBe("invert_marker_pins");`
       - `expect(invertMarkerPinsTool.input_schema).toEqual({ type: "object", properties: {} });`
       - Build a fresh `ToolRegistry`, register, assert
         `reg.list().map(t => t.name).includes("invert_marker_pins")`.
     - **§18 Ignores extraneous input.**
       - Execute `{ bogus: "x", count: 7 }`. Result still ok with
         body `{ ok: true, total: <N>, ... }`.
     - **§19 Tolerates null/undefined input.**
       - `tool.execute(null)` and `tool.execute(undefined)` both ok.

   - `describe("defaultInvertMarkerPinsRuntime (integration)", () => { ... })`:
     - Save/restore `globalThis.pack`, `globalThis.document`,
       `globalThis.drawMarkers`, `globalThis.addLines` per test.
     - Helper to install a fake `#markers` element:
       ```ts
       function installMarkerGroup() {
         const setAttribute = vi.fn();
         const removeAttribute = vi.fn();
         const markerGroup = { setAttribute, removeAttribute };
         (globalThis as { document?: unknown }).document = {
           getElementById(id: string) {
             return id === "markers" ? markerGroup : null;
           },
         };
         return { markerGroup, setAttribute, removeAttribute };
       }
       ```
     - Save originals:
       ```ts
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalDoc = (globalThis as { document?: unknown }).document;
       const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;
       const originalAdd = (globalThis as { addLines?: unknown }).addLines;
       ```
       and restore in `afterEach`.
     - **§20 End-to-end: 2 pinned + 1 unpinned → mutation, attr "1", drawMarkers + addLines called once each.**
       - `pack.markers = [{ i: 1, pinned: true }, { i: 2 }, { i: 3, pinned: true }]`.
       - `globalThis.pack = { markers };`
       - `installMarkerGroup()`.
       - `globalThis.drawMarkers = vi.fn();`
       - `globalThis.addLines = vi.fn();`
       - `const before = pack.markers;`
       - Execute `invertMarkerPinsTool.execute({})`.
       - Assertions:
         - `result.isError` falsy.
         - Body deep-equals
           `{ ok: true, total: 3, now_pinned: 1, now_unpinned: 2, any_pinned: true }`.
         - `(globalThis as { pack: { markers: RawMarker[] } }).pack.markers === before`.
         - `("pinned" in pack.markers[0])` is false.
         - `pack.markers[1].pinned === true`.
         - `("pinned" in pack.markers[2])` is false.
         - `setAttribute` called once with `("pinned", "1")`.
         - `removeAttribute` NOT called.
         - `drawMarkers.mock.calls.length === 1`.
         - `addLines.mock.calls.length === 1`.
     - **§21 Integration: all unpinned → setAttribute("pinned", "1").**
       - `pack.markers = [{ i: 1 }, { i: 2 }]`.
       - Body `now_pinned: 2, now_unpinned: 0, any_pinned: true`.
       - `setAttribute` called with `("pinned", "1")`.
       - `removeAttribute` NOT called.
     - **§22 Integration: all pinned → removeAttribute, every marker delete. LOAD-BEARING.**
       - `pack.markers = [{ i: 1, pinned: true }, { i: 2, pinned: true }]`.
       - Body `now_pinned: 0, now_unpinned: 2, any_pinned: false`.
       - `removeAttribute` called once with `("pinned")`.
       - `setAttribute` NOT called.
       - For every marker: `("pinned" in marker)` is false.
     - **§23 Integration: empty markers array → removeAttribute called.**
       - `pack.markers = []`.
       - Body all zeros, `any_pinned: false`.
       - `removeAttribute` called once.
     - **§24 Integration: missing pack → exact error.**
       - `globalThis.pack = undefined`.
       - Result `isError: true`; error matches
         `/window\.pack\.markers is not available/`.
       - `markerGroup.setAttribute` and `removeAttribute` NOT called.
       - `drawMarkers` and `addLines` NOT called.
     - **§25 Integration: pack.markers not an array → same error.**
       - `globalThis.pack = { markers: "nope" }`.
       - Same error wording.
     - **§26 Integration: missing #markers element → no error, mutation still applied.**
       - `pack.markers = [{ i: 1 }]`.
       - `(globalThis as { document?: unknown }).document = { getElementById: () => null };`
       - Body still ok; `pack.markers[0].pinned === true`.
     - **§27 Integration: drawMarkers global missing → no error.**
       - `(globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;`
       - Body still ok.
     - **§28 Integration: addLines global missing → no error.**
       - Same.
     - **§29 Integration: document undefined (SSR-safe) → no error, mutation applied.**
       - `(globalThis as { document?: unknown }).document = undefined;`
       - Body still ok; mutation applied.

3. **Modify `src/ai/index.ts`**:
   - Add the import alphabetically between
     `invert-heightmap` (line 137) and `list-biomes` (line 138):
     ```ts
     import { invertHeightmapTool } from "./tools/invert-heightmap";
     import { invertMarkerPinsTool } from "./tools/invert-marker-pins";
     import { listBiomesTool } from "./tools/list-biomes";
     ```
   - Add the re-export block immediately after the
     `invert-heightmap` re-export (line 1592-1595), before
     `list-biomes`:
     ```ts
     export {
       createInvertMarkerPinsTool,
       defaultInvertMarkerPinsRuntime,
       type InvertMarkerPinsResult,
       type InvertMarkerPinsRuntime,
       invertMarkerPinsTool,
     } from "./tools/invert-marker-pins";
     ```
     (Biome will normalize the order — confirm post-lint.)
   - Add `registry.register(invertMarkerPinsTool);` immediately
     after `registry.register(setMarkerPinnedTool);` (line 2947)
     for topical grouping with the other marker pin tools.

4. **Run verification**:
   - `npm test` (must be green; new tool's tests must pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -10` (must report 0 errors / 0
     warnings, matching baseline).

5. **Commit on `plan-341-invert-marker-pins` branch** with the message
   specified in the prompt. Do NOT push.
