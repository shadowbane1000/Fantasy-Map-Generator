# Tasks 342: `invert_marker_locks` tool

Sequenced implementation tasks for plan 342.

1. **Create the tool file** `src/ai/tools/invert-marker-locks.ts`:
   - Imports from `./_shared`:
     - `errorResult`, `getGlobal`, `getPack`, `okResult`, type `RawMarker`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define exported types:
     ```ts
     export interface InvertMarkerLocksResult {
       total: number;
       now_locked: number;
       now_unlocked: number;
     }

     export interface InvertMarkerLocksRuntime {
       getMarkers(): RawMarker[] | undefined;
       setMarkers(arr: RawMarker[]): void;
       addLines?: () => void;
     }
     ```
   - Implement `defaultInvertMarkerLocksRuntime`:
     - `getMarkers()`:
       ```ts
       const pack = getPack<{ markers?: RawMarker[] }>();
       const markers = pack?.markers;
       return Array.isArray(markers) ? markers : undefined;
       ```
     - `setMarkers(arr)`:
       ```ts
       const pack = getPack<{ markers?: RawMarker[] }>();
       if (pack) pack.markers = arr;
       ```
     - `addLines()`:
       ```ts
       const fn = getGlobal<() => void>("addLines");
       if (typeof fn === "function") fn();
       ```
   - Implement `createInvertMarkerLocksTool(runtime = defaultInvertMarkerLocksRuntime)`:
     - `name: "invert_marker_locks"`.
     - Description: explain it mirrors the Markers Overview's "Invert
       lock" row-toolbar button (`invertLock` in
       `public/modules/ui/markers-overview.js`). REASSIGNS
       `pack.markers` to a NEW array of CLONED marker objects with
       `lock` flipped via plain boolean negation
       (`!marker.lock` — so `!undefined === true`). Best-effort
       calls `addLines()` to refresh the markers overview rows.
       Returns `{ total, now_locked, now_unlocked }`. Distinct from
       `set_marker_lock` (single marker, uses `delete` for unlock).
       Distinct from `invert_marker_pins` which mutates in place and
       uses `delete` for the "off" path.
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
          const next: RawMarker[] = markers.map((m) => ({ ...m, lock: !m?.lock }));
          ```
       4. ```ts
          try {
            runtime.setMarkers(next);
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
          ```
       5. ```ts
          if (typeof runtime.addLines === "function") {
            try {
              runtime.addLines();
            } catch {
              // Best-effort.
            }
          }
          ```
       6. ```ts
          const total = next.length;
          let nowLocked = 0;
          for (const m of next) {
            if (m.lock === true) nowLocked++;
          }
          const nowUnlocked = total - nowLocked;
          return okResult({
            total,
            now_locked: nowLocked,
            now_unlocked: nowUnlocked,
          });
          ```
   - Export `export const invertMarkerLocksTool = createInvertMarkerLocksTool();`

2. **Create the test file** `src/ai/tools/invert-marker-locks.test.ts`:
   - Imports:
     ```ts
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import type { RawMarker } from "./_shared";
     import { ToolRegistry } from "./index";
     import {
       createInvertMarkerLocksTool,
       type InvertMarkerLocksRuntime,
       invertMarkerLocksTool,
     } from "./invert-marker-locks";
     ```
   - Helper:
     ```ts
     interface MakeRuntimeOpts {
       markers?: RawMarker[] | undefined | unknown;
       addLines?: () => void;
       setMarkers?: (arr: RawMarker[]) => void;
       getMarkersThrows?: Error;
       setMarkersThrows?: Error;
     }

     function makeRuntime(opts: MakeRuntimeOpts = {}) {
       let stored: RawMarker[] | undefined;
       const setMarkers = vi.fn((arr: RawMarker[]) => {
         if (opts.setMarkersThrows) throw opts.setMarkersThrows;
         if (opts.setMarkers) opts.setMarkers(arr);
         stored = arr;
       });
       const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
       const getMarkers = vi.fn(() => {
         if (opts.getMarkersThrows) throw opts.getMarkersThrows;
         return opts.markers as RawMarker[] | undefined;
       });
       const runtime: InvertMarkerLocksRuntime = {
         getMarkers,
         setMarkers,
         addLines,
       };
       return {
         runtime,
         getMarkers,
         setMarkers,
         addLines,
         getStored: () => stored,
       };
     }
     ```
   - `describe("invert_marker_locks tool", () => { ... })`:
     - **§1 Happy path (mixed): 3 markers (lock=true, lock=false,
       lock=undefined) → after: lock=false, lock=true, lock=true.**
       - `markers = [{ i: 1, lock: true }, { i: 2, lock: false }, { i: 3 }]`.
       - Execute `{}`.
       - Assertions:
         - `result.isError` falsy.
         - Body: `{ ok: true, total: 3, now_locked: 2, now_unlocked: 1 }`.
         - `setMarkers.mock.calls.length === 1`.
         - `getStored()![0].lock === false`.
         - `getStored()![1].lock === true`.
         - `getStored()![2].lock === true`.
     - **§2 All locked → all unlocked.**
       - `markers = [{ i: 1, lock: true }, { i: 2, lock: true }, { i: 3, lock: true }]`.
       - Body: `{ ok: true, total: 3, now_locked: 0, now_unlocked: 3 }`.
       - Each new marker `lock === false`.
     - **§3 All unlocked (mixed undefined / false) → all locked. (LOAD-BEARING `!undefined === true`.)**
       - `markers = [{ i: 1 }, { i: 2, lock: false }, { i: 3 }]`.
       - Body: `{ ok: true, total: 3, now_locked: 3, now_unlocked: 0 }`.
       - For every new marker: `marker.lock === true`.
     - **§4 REASSIGNMENT (LOAD-BEARING).**
       - `const markers: RawMarker[] = [{ i: 1, lock: true }, { i: 2 }];`
       - `const before = markers;`
       - `const { runtime, setMarkers, getStored } = makeRuntime({ markers });`
       - Execute `{}`.
       - Assertions:
         - `getStored() !== before` — fresh array identity.
         - `setMarkers.mock.calls[0][0] !== before` — argument passed to
           setMarkers is NOT the original array.
     - **§5 Cloned-not-mutated (LOAD-BEARING).**
       - `const m1 = { i: 1, lock: true } as RawMarker;`
       - `const m2 = { i: 2 } as RawMarker;`
       - `const markers = [m1, m2];`
       - Execute `{}`.
       - Assertions:
         - `m1.lock === true` (unchanged).
         - `m2.lock === undefined` (still no field).
         - `("lock" in m2) === false` (defensive — spread source is
           untouched).
         - `getStored()![0] !== m1`.
         - `getStored()![1] !== m2`.
     - **§6 Other fields preserved on each new clone.**
       - `const marker: RawMarker = { i: 7, type: "monster", icon: "?", x: 100, y: 200, cell: 42, dx: 1, dy: 2, px: 3, size: 16, pin: "bubble", fill: "#fff", stroke: "#000", pinned: true, lock: false, removed: false };`
       - `markers = [marker]`.
       - Execute `{}`.
       - Assertions on `getStored()![0]`:
         - `i === 7`, `type === "monster"`, `icon === "?"`, `x === 100`,
           `y === 200`, `cell === 42`, `dx === 1`, `dy === 2`, `px === 3`,
           `size === 16`, `pin === "bubble"`, `fill === "#fff"`,
           `stroke === "#000"`, `pinned === true`, `removed === false`.
         - `lock === true` (flipped from false).
     - **§7 addLines best-effort: not provided → no error.**
       - `markers = [{ i: 1 }]`. No `addLines` on opts.
       - Body still ok.
     - **§8 addLines throws → swallowed; result ok; reassignment still
       happened.**
       - `markers = [{ i: 1 }]`.
       - `addLines: () => { throw new Error("ui!"); }`.
       - Body still ok; `getStored()![0].lock === true`.
     - **§9 Empty markers array → all zeros, still reassigns to a NEW
       empty array. (LOAD-BEARING)**
       - `const markers: RawMarker[] = [];`
       - `const before = markers;`
       - Body: `{ ok: true, total: 0, now_locked: 0, now_unlocked: 0 }`.
       - `setMarkers.mock.calls.length === 1`.
       - `getStored() !== before`.
       - `getStored()!.length === 0`.
     - **§10 Missing `pack.markers` → exact error; setMarkers NOT called.**
       - `makeRuntime({ markers: undefined, addLines: () => {} })`.
       - `result.isError === true`.
       - Body `error` is exactly
         `"window.pack.markers is not available; the map hasn't finished loading."`.
       - `setMarkers.mock.calls.length === 0`.
       - `addLines!.mock.calls.length === 0`.
     - **§11 Non-array `pack.markers` → same error.**
       - `makeRuntime({ markers: "oops" as unknown as RawMarker[] })`.
       - Same exact error string.
     - **§12 `getMarkers()` throws → error propagated.**
       - `makeRuntime({ getMarkersThrows: new Error("boom") })`.
       - `result.isError === true`; body `error` matches `/boom/`.
       - `setMarkers` NOT called.
     - **§13 `setMarkers()` throws → error propagated.**
       - `makeRuntime({ markers: [{ i: 1 }], setMarkersThrows: new Error("setfail") })`.
       - `result.isError === true`; body `error` matches `/setfail/`.
     - **§14 Tool name + schema + registry round-trip.**
       - `expect(invertMarkerLocksTool.name).toBe("invert_marker_locks");`
       - `expect(invertMarkerLocksTool.input_schema).toEqual({ type: "object", properties: {} });`
       - Build a fresh `ToolRegistry`, register, assert
         `reg.list().map(t => t.name).includes("invert_marker_locks")`.
     - **§15 Ignores extraneous input.**
       - Execute `{ bogus: "x", count: 7 }`. Result still ok.
     - **§16 Tolerates null/undefined input.**
       - `tool.execute(null)` and `tool.execute(undefined)` both ok
         (re-init markers between calls since the runtime stores once).

   - `describe("defaultInvertMarkerLocksRuntime (integration)", () => { ... })`:
     - Save/restore `globalThis.pack` and `globalThis.addLines` per
       test:
       ```ts
       const originalPack = (globalThis as { pack?: unknown }).pack;
       const originalAdd = (globalThis as { addLines?: unknown }).addLines;
       beforeEach(() => {
         (globalThis as { pack?: unknown }).pack = undefined;
         (globalThis as { addLines?: unknown }).addLines = undefined;
       });
       afterEach(() => {
         (globalThis as { pack?: unknown }).pack = originalPack;
         (globalThis as { addLines?: unknown }).addLines = originalAdd;
       });
       ```
     - **§17 End-to-end: 3 markers (lock=true, false, undefined) →
       new array on `pack.markers`, addLines called once, originals
       unchanged. (LOAD-BEARING REASSIGNMENT + clone-not-mutate +
       `!undefined === true`.)**
       - `const markers: RawMarker[] = [{ i: 1, lock: true }, { i: 2, lock: false }, { i: 3 }];`
       - `(globalThis as { pack?: unknown }).pack = { markers };`
       - `const lines = vi.fn(); (globalThis as { addLines?: unknown }).addLines = lines;`
       - `const before = markers;`
       - Execute.
       - Assertions:
         - `result.isError` falsy.
         - Body: `{ ok: true, total: 3, now_locked: 2, now_unlocked: 1 }`.
         - `livePack.markers !== before` — REASSIGNMENT.
         - `livePack.markers[0].lock === false`.
         - `livePack.markers[1].lock === true`.
         - `livePack.markers[2].lock === true`.
         - Originals unchanged: `before[0].lock === true`,
           `before[1].lock === false`, `("lock" in before[2]) === false`.
         - `lines.mock.calls.length === 1`.
     - **§18 Integration: empty markers array → reassigns to a fresh
       empty array.**
       - `(globalThis as { pack?: unknown }).pack = { markers: [] as RawMarker[] };`
       - `const before = (globalThis as { pack: { markers: RawMarker[] } }).pack.markers;`
       - Execute.
       - Body: all zeros.
       - `livePack.markers !== before`.
       - `livePack.markers.length === 0`.
     - **§19 Integration: missing pack → exact error, no addLines call.**
       - `(globalThis as { pack?: unknown }).pack = undefined;`
       - `const lines = vi.fn(); (globalThis as { addLines?: unknown }).addLines = lines;`
       - Result `isError: true`; error matches
         `/window\.pack\.markers is not available/`.
       - `lines.mock.calls.length === 0`.
     - **§20 Integration: pack.markers not an array → same error.**
       - `(globalThis as { pack?: unknown }).pack = { markers: "nope" };`
       - Same error wording.
     - **§21 Integration: addLines global missing → no error.**
       - `(globalThis as { pack?: unknown }).pack = { markers: [{ i: 1 }] as RawMarker[] };`
       - `(globalThis as { addLines?: unknown }).addLines = undefined;`
       - Body still ok; `livePack.markers[0].lock === true`.

3. **Modify `src/ai/index.ts`**:
   - Add the import alphabetically between
     `invert-heightmap` (line 137) and `invert-marker-pins`
     (line 138):
     ```ts
     import { invertHeightmapTool } from "./tools/invert-heightmap";
     import { invertMarkerLocksTool } from "./tools/invert-marker-locks";
     import { invertMarkerPinsTool } from "./tools/invert-marker-pins";
     ```
   - Add the re-export block immediately after the
     `invert-heightmap` re-export and before the
     `invert-marker-pins` re-export:
     ```ts
     export {
       createInvertMarkerLocksTool,
       defaultInvertMarkerLocksRuntime,
       type InvertMarkerLocksResult,
       type InvertMarkerLocksRuntime,
       invertMarkerLocksTool,
     } from "./tools/invert-marker-locks";
     ```
     (Biome will normalize the order — confirm post-lint.)
   - Add `registry.register(invertMarkerLocksTool);` immediately
     after `registry.register(setMarkerLockTool);` (line 2964) for
     topical grouping with the per-marker lock tool.

4. **Run verification**:
   - `npm test` (must be green; new tool's tests must pass).
   - `npx tsc --noEmit` (must be clean).
   - `npm run lint 2>&1 | tail -10` (must report 0 errors / 0
     warnings, matching baseline).

5. **Commit on `plan-342-invert-marker-locks` branch** with the
   message specified in the prompt. Do NOT push.
