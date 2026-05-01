# Tasks 365: `restore_default_units` tool

Sequenced implementation tasks for plan 365.

1. **Create the tool file** `src/ai/tools/restore-default-units.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define DOM id constants:
     ```ts
     export const DISTANCE_SCALE_INPUT_ID = "distanceScaleInput";
     export const DISTANCE_UNIT_INPUT_ID = "distanceUnitInput";
     export const HEIGHT_UNIT_INPUT_ID = "heightUnit";
     export const TEMPERATURE_SCALE_INPUT_ID = "temperatureScale";
     export const AREA_UNIT_INPUT_ID = "areaUnit";
     export const HEIGHT_EXPONENT_INPUT_ID = "heightExponentInput";
     export const POPULATION_RATE_INPUT_ID = "populationRateInput";
     export const URBANIZATION_INPUT_ID = "urbanizationInput";
     export const URBAN_DENSITY_INPUT_ID = "urbanDensityInput";
     ```
   - Define localStorage key list (eight keys):
     ```ts
     export const STORAGE_KEYS = [
       "distanceUnit",
       "heightUnit",
       "temperatureScale",
       "areaUnit",
       "heightExponent",
       "populationRate",
       "urbanization",
       "urbanDensity",
     ] as const;
     ```
   - Define side-effect callback name list (four names):
     ```ts
     export const SIDE_EFFECT_NAMES = [
       "unlock",
       "calculateFriendlyGridSize",
       "calculateTemperatures",
       "renderScaleBar",
     ] as const;
     ```
   - Define `DEFAULT_UNITS` constant (frozen):
     ```ts
     export const DEFAULT_UNITS = {
       distanceScale: 3,
       distanceUnit: "km",
       heightUnit: "m",
       temperatureScale: "°C",
       areaUnit: "square",
       heightExponent: 1.8,
       populationRate: 1000,
       urbanization: 1,
       urbanDensity: 10,
     } as const;
     ```
   - Define types:
     ```ts
     export interface RestoreDefaultUnitsApplied {
       distanceScale: number;
       distanceUnit: string;
       heightUnit: string;
       temperatureScale: string;
       areaUnit: string;
       heightExponent: number;
       populationRate: number;
       urbanization: number;
       urbanDensity: number;
     }
     export interface RestoreDefaultUnitsPrevious {
       distanceScale: number | null;
       distanceUnit: string | null;
       heightUnit: string | null;
       temperatureScale: string | null;
       areaUnit: string | null;
       heightExponent: number | null;
       populationRate: number | null;
       urbanization: number | null;
       urbanDensity: number | null;
     }
     export interface RestoreDefaultUnitsResult {
       previous: RestoreDefaultUnitsPrevious;
       applied: RestoreDefaultUnitsApplied;
       side_effects_run: string[];
     }
     export interface RestoreDefaultUnitsRuntime {
       getDom(id: string): string | null;
       setDom(id: string, value: string): void;
       getGlobal(name: string): unknown;
       setGlobal(name: string, value: unknown): void;
       removeStorage(key: string): void;
       /**
        * Returns true iff the named global was a function and called
        * without throwing. Returns false if missing or threw.
        */
       callIfPresent(name: string): boolean;
     }
     ```
   - Implement `defaultRestoreDefaultUnitsRuntime`:
     ```ts
     export const defaultRestoreDefaultUnitsRuntime: RestoreDefaultUnitsRuntime = {
       getDom(id: string): string | null {
         if (typeof document === "undefined") return null;
         try {
           const el = document.getElementById(id) as { value?: unknown } | null;
           if (!el) return null;
           const v = el.value;
           return typeof v === "string" ? v : null;
         } catch {
           return null;
         }
       },
       setDom(id: string, value: string): void {
         if (typeof document === "undefined") return;
         try {
           const el = document.getElementById(id) as { value?: unknown } | null;
           if (el) (el as { value: unknown }).value = value;
         } catch {
           // best-effort
         }
       },
       getGlobal(name: string): unknown {
         return getGlobal<unknown>(name);
       },
       setGlobal(name: string, value: unknown): void {
         (globalThis as Record<string, unknown>)[name] = value;
       },
       removeStorage(key: string): void {
         if (typeof localStorage === "undefined") return;
         try {
           localStorage.removeItem(key);
         } catch {
           // best-effort: swallow security / quota errors
         }
       },
       callIfPresent(name: string): boolean {
         const fn = getGlobal<unknown>(name);
         if (typeof fn !== "function") return false;
         try {
           (fn as () => unknown)();
           return true;
         } catch {
           return false;
         }
       },
     };
     ```
     For `unlock("distanceScale")` — note this REQUIRES passing an
     argument. Override behavior: instead of just `()` invocation, the
     runtime's `callIfPresent` invokes with NO arguments. To handle
     `unlock`, we'll call `unlock` with the literal string in the
     tool body. **CORRECTION**: better — make `callIfPresent` accept
     an optional args spread:
     ```ts
     callIfPresent(name: string, ...args: unknown[]): boolean {
       const fn = getGlobal<unknown>(name);
       if (typeof fn !== "function") return false;
       try {
         (fn as (...a: unknown[]) => unknown)(...args);
         return true;
       } catch {
         return false;
       }
     },
     ```
     The interface signature becomes `callIfPresent(name: string,
     ...args: unknown[]): boolean`. Tool body calls
     `callIfPresent("unlock", "distanceScale")` and `callIfPresent(
     "calculateFriendlyGridSize")` etc. with no extra args.

   - Helper to parse a numeric DOM value:
     ```ts
     function parseNumberOrNull(s: string | null): number | null {
       if (s === null) return null;
       const n = Number.parseFloat(s);
       return Number.isFinite(n) ? n : null;
     }
     ```

   - Helper to read a numeric global:
     ```ts
     function readNumberGlobal(
       runtime: RestoreDefaultUnitsRuntime,
       name: string,
     ): number | null {
       const v = runtime.getGlobal(name);
       return typeof v === "number" && Number.isFinite(v) ? v : null;
     }
     ```

   - Implement `createRestoreDefaultUnitsTool(runtime = default)`:
     - `name: "restore_default_units"`.
     - Description (concise):
       ```
       Reset every measurement unit, scale, and rate to its METRIC default —
       same side-effect as the Restore button in the Units editor
       (units-editor.js → restoreDefaultUnits). Sets distanceScale=3,
       distanceUnit=km, heightUnit=m, temperatureScale=°C, areaUnit=square,
       heightExponent=1.8, populationRate=1000, urbanization=1,
       urbanDensity=10; reassigns the four globalThis-backed values
       (distanceScale / populationRate / urbanization / urbanDensity);
       writes the corresponding DOM input values; clears the eight
       localStorage entries (distanceUnit, heightUnit, temperatureScale,
       areaUnit, heightExponent, populationRate, urbanization, urbanDensity);
       and best-effort calls unlock("distanceScale"),
       calculateFriendlyGridSize(), calculateTemperatures(),
       renderScaleBar(). Always METRIC — call set_measurement_units
       afterwards if you want imperial. Takes no arguments. Returns the
       previous values (per field, null when missing), the applied
       defaults, and the list of side-effect callbacks that actually
       ran.
       ```
     - `input_schema: { type: "object", properties: {} }` (no required).
     - `execute(_rawInput)`:
       ```ts
       try {
         // ──────── snapshot phase (BEFORE any mutation) ────────
         const previous: RestoreDefaultUnitsPrevious = {
           distanceScale: readNumberGlobal(runtime, "distanceScale"),
           distanceUnit: runtime.getDom(DISTANCE_UNIT_INPUT_ID),
           heightUnit: runtime.getDom(HEIGHT_UNIT_INPUT_ID),
           temperatureScale: runtime.getDom(TEMPERATURE_SCALE_INPUT_ID),
           areaUnit: runtime.getDom(AREA_UNIT_INPUT_ID),
           heightExponent: parseNumberOrNull(
             runtime.getDom(HEIGHT_EXPONENT_INPUT_ID),
           ),
           populationRate: readNumberGlobal(runtime, "populationRate"),
           urbanization: readNumberGlobal(runtime, "urbanization"),
           urbanDensity: readNumberGlobal(runtime, "urbanDensity"),
         };

         // ──────── mutation phase ────────
         // 1. distanceScale (global + DOM)
         runtime.setGlobal("distanceScale", DEFAULT_UNITS.distanceScale);
         runtime.setDom(
           DISTANCE_SCALE_INPUT_ID,
           String(DEFAULT_UNITS.distanceScale),
         );

         // 2-5. unit DOM inputs
         runtime.setDom(DISTANCE_UNIT_INPUT_ID, DEFAULT_UNITS.distanceUnit);
         runtime.setDom(HEIGHT_UNIT_INPUT_ID, DEFAULT_UNITS.heightUnit);
         runtime.setDom(
           TEMPERATURE_SCALE_INPUT_ID,
           DEFAULT_UNITS.temperatureScale,
         );
         runtime.setDom(AREA_UNIT_INPUT_ID, DEFAULT_UNITS.areaUnit);

         // 6. heightExponent DOM
         runtime.setDom(
           HEIGHT_EXPONENT_INPUT_ID,
           String(DEFAULT_UNITS.heightExponent),
         );

         // 7-9. population rates (global + DOM)
         runtime.setGlobal("populationRate", DEFAULT_UNITS.populationRate);
         runtime.setDom(
           POPULATION_RATE_INPUT_ID,
           String(DEFAULT_UNITS.populationRate),
         );
         runtime.setGlobal("urbanization", DEFAULT_UNITS.urbanization);
         runtime.setDom(
           URBANIZATION_INPUT_ID,
           String(DEFAULT_UNITS.urbanization),
         );
         runtime.setGlobal("urbanDensity", DEFAULT_UNITS.urbanDensity);
         runtime.setDom(
           URBAN_DENSITY_INPUT_ID,
           String(DEFAULT_UNITS.urbanDensity),
         );

         // ──────── localStorage cleanup (best-effort) ────────
         for (const key of STORAGE_KEYS) {
           try {
             runtime.removeStorage(key);
           } catch {
             // belt-and-suspenders: default runtime already wraps
           }
         }

         // ──────── side-effect callbacks (best-effort) ────────
         const side_effects_run: string[] = [];
         // unlock takes the field name as argument
         if (runtime.callIfPresent("unlock", "distanceScale")) {
           side_effects_run.push("unlock");
         }
         if (runtime.callIfPresent("calculateFriendlyGridSize")) {
           side_effects_run.push("calculateFriendlyGridSize");
         }
         if (runtime.callIfPresent("calculateTemperatures")) {
           side_effects_run.push("calculateTemperatures");
         }
         if (runtime.callIfPresent("renderScaleBar")) {
           side_effects_run.push("renderScaleBar");
         }

         const applied: RestoreDefaultUnitsApplied = {
           distanceScale: DEFAULT_UNITS.distanceScale,
           distanceUnit: DEFAULT_UNITS.distanceUnit,
           heightUnit: DEFAULT_UNITS.heightUnit,
           temperatureScale: DEFAULT_UNITS.temperatureScale,
           areaUnit: DEFAULT_UNITS.areaUnit,
           heightExponent: DEFAULT_UNITS.heightExponent,
           populationRate: DEFAULT_UNITS.populationRate,
           urbanization: DEFAULT_UNITS.urbanization,
           urbanDensity: DEFAULT_UNITS.urbanDensity,
         };

         return okResult({ previous, applied, side_effects_run });
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }
       ```
   - Export `restoreDefaultUnitsTool = createRestoreDefaultUnitsTool()`.

2. **Create the test file** `src/ai/tools/restore-default-units.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; `ToolRegistry` from `./index`; default + factory +
     types + constants from `./restore-default-units`.

   - Helper `makeRuntime(opts)` returning the runtime + each method as
     `vi.fn()`. Method defaults:
     - `getDom`: returns `null`.
     - `setDom`: no-op.
     - `getGlobal`: returns `undefined`.
     - `setGlobal`: no-op.
     - `removeStorage`: no-op.
     - `callIfPresent`: returns `true`.
     Each can be overridden via opts.

   - `describe("restore_default_units tool", …)` (stub-runtime):

     - **§1 Happy path: all 9 fields restored, previous reflects pre-call**:
       - Build `getDom` to return a non-default string for each of
         the 6 DOM-backed reads:
         - `distanceUnitInput → "mi"`
         - `heightUnit → "ft"`
         - `temperatureScale → "°F"`
         - `areaUnit → "ha"`
         - `heightExponentInput → "1.5"`
         - any other id → null.
       - Build `getGlobal` to return:
         - `distanceScale → 5`
         - `populationRate → 1500`
         - `urbanization → 1.2`
         - `urbanDensity → 12`
         - any other → undefined.
       - Run tool. Parse result.
       - Assert `result.isError` falsy.
       - Assert parsed.applied deep-equals
         `{ distanceScale: 3, distanceUnit: "km", heightUnit: "m",
         temperatureScale: "°C", areaUnit: "square",
         heightExponent: 1.8, populationRate: 1000,
         urbanization: 1, urbanDensity: 10 }`.
       - Assert parsed.previous deep-equals
         `{ distanceScale: 5, distanceUnit: "mi", heightUnit: "ft",
         temperatureScale: "°F", areaUnit: "ha",
         heightExponent: 1.5, populationRate: 1500,
         urbanization: 1.2, urbanDensity: 12 }`.

     - **§2 globalThis reassignment**: stub `setGlobal` with `vi.fn()`.
       Run tool. Assert `setGlobal.mock.calls` contains:
       ```
       ["distanceScale", 3]
       ["populationRate", 1000]
       ["urbanization", 1]
       ["urbanDensity", 10]
       ```
       (any order).

     - **§3 DOM input update**: stub `setDom` with `vi.fn()`. Run tool.
       Build `expected = new Map([…])` for the nine pairs. Assert
       `setDom.mock.calls` matches each pair.

     - **§4 localStorage.removeItem called for each of the 8 keys**:
       stub `removeStorage` with `vi.fn()`. Run tool. Assert
       `removeStorage.mock.calls.map(c => c[0]).sort()` deep-equals
       `[...STORAGE_KEYS].sort()`.

     - **§5 Each side-effect called when present**: stub
       `callIfPresent` with `vi.fn(() => true)`. Run tool. Assert
       `callIfPresent.mock.calls` is exactly:
       ```
       ["unlock", "distanceScale"]
       ["calculateFriendlyGridSize"]
       ["calculateTemperatures"]
       ["renderScaleBar"]
       ```
       (in that exact order). Assert `parsed.side_effects_run` equals
       `["unlock", "calculateFriendlyGridSize", "calculateTemperatures",
       "renderScaleBar"]`.

     - **§6 Side-effect absent → omitted from side_effects_run**:
       stub `callIfPresent` to return `false` for `unlock` only:
       ```ts
       callIfPresent: vi.fn((name: string) => name !== "unlock"),
       ```
       Run tool. Assert no error; `parsed.side_effects_run` deep-
       equals `["calculateFriendlyGridSize",
       "calculateTemperatures", "renderScaleBar"]`.

     - **§7 Side-effect throws → omitted from side_effects_run**:
       (the seam already handles internally — duplicate of §6 since
       `callIfPresent` returns `false` either way; cover both cases
       to pin the contract). Stub `callIfPresent` to return `false`
       for `calculateTemperatures`. Run tool. Assert
       `parsed.side_effects_run` deep-equals `["unlock",
       "calculateFriendlyGridSize", "renderScaleBar"]`.

     - **§8 localStorage.removeStorage throws → no error**: stub
       `removeStorage` with `vi.fn(() => { throw new Error("fail"); })`.
       Run tool. Assert no error; `parsed.applied` still canonical
       defaults; `removeStorage` was called eight times anyway (the
       tool body's try/catch wrapper kept going).

     - **§9 Missing DOM element → previous is null for that field;
       apply silently skips (setDom still called, runtime swallows)**:
       stub `getDom` to return `null` for `heightUnit` (other ids
       return strings). Run tool. Assert no error;
       `parsed.previous.heightUnit === null`;
       other previous fields still reflect their stub strings;
       `parsed.applied` unchanged.

     - **§10 Missing globalThis-backed value → previous null**:
       stub `getGlobal` to return `undefined` for all four
       globalThis-backed names. Run tool. Assert
       `parsed.previous.distanceScale === null`,
       `parsed.previous.populationRate === null`,
       `parsed.previous.urbanization === null`,
       `parsed.previous.urbanDensity === null`. Other previous
       fields unaffected; `parsed.applied` unchanged.

     - **§11 Previous values captured BEFORE mutation
       (load-bearing)**: stub `getDom`, `getGlobal`, `setDom`,
       `setGlobal` with `vi.fn()`. Run tool. Compute:
       ```ts
       const allReads = [
         ...getDom.mock.invocationCallOrder,
         ...getGlobal.mock.invocationCallOrder,
       ];
       const allWrites = [
         ...setDom.mock.invocationCallOrder,
         ...setGlobal.mock.invocationCallOrder,
       ];
       const lastRead = Math.max(...allReads);
       const firstWrite = Math.min(...allWrites);
       expect(lastRead).toBeLessThan(firstWrite);
       ```
       Pins that ALL reads precede ANY write.

     - **§12 Tool name + schema + registry round-trip**:
       - `tool.name === "restore_default_units"`.
       - `tool.input_schema.type === "object"`.
       - `tool.input_schema.properties` deep-equals `{}`.
       - `(tool.input_schema as { required?: unknown }).required` is
         undefined.
       - `new ToolRegistry()`,
         `registry.register(restoreDefaultUnitsTool)`,
         `expect(registry.list().map(t => t.name)).toContain(
         "restore_default_units")`.

     - **§13 Empty-input handling**: passing `{}`, `null`,
       `undefined`, `{ extra: "ignored" }` → all execute identically
       (no error, applied is canonical defaults).

     - **§14 DEFAULT_UNITS exported and pinned via deep-equal**:
       ```ts
       expect(DEFAULT_UNITS).toEqual({
         distanceScale: 3,
         distanceUnit: "km",
         heightUnit: "m",
         temperatureScale: "°C",
         areaUnit: "square",
         heightExponent: 1.8,
         populationRate: 1000,
         urbanization: 1,
         urbanDensity: 10,
       });
       ```

   - `describe("defaultRestoreDefaultUnitsRuntime (integration)", …)`:
     - Save originals at top:
       ```ts
       const originalDocument = (globalThis as { document?: unknown }).document;
       const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
       const originalDistanceScale = (globalThis as { distanceScale?: unknown }).distanceScale;
       const originalPopulationRate = (globalThis as { populationRate?: unknown }).populationRate;
       const originalUrbanization = (globalThis as { urbanization?: unknown }).urbanization;
       const originalUrbanDensity = (globalThis as { urbanDensity?: unknown }).urbanDensity;
       const originalUnlock = (globalThis as { unlock?: unknown }).unlock;
       const originalGridSize = (globalThis as { calculateFriendlyGridSize?: unknown }).calculateFriendlyGridSize;
       const originalTemps = (globalThis as { calculateTemperatures?: unknown }).calculateTemperatures;
       const originalRenderScale = (globalThis as { renderScaleBar?: unknown }).renderScaleBar;
       ```
     - Helper to build a stub `document` whose `getElementById`
       returns a `{ value: <preset> }` from a Map:
       ```ts
       function makeDocStub(values: Record<string, string | null>): {
         elements: Record<string, { value: string } | null>;
         document: { getElementById(id: string): { value: string } | null };
       } {
         const elements: Record<string, { value: string } | null> = {};
         for (const [id, v] of Object.entries(values)) {
           elements[id] = v === null ? null : { value: v };
         }
         return {
           elements,
           document: {
             getElementById(id: string) {
               return elements[id] ?? null;
             },
           },
         };
       }
       ```
     - Helper to install a `localStorage` with a `removeItem` spy:
       ```ts
       function makeLocalStorage(removeItem: (key: string) => void): unknown {
         return { removeItem };
       }
       ```
     - `beforeEach`: clear the relevant globals to known sane state.
     - `afterEach`: restore all ten originals.

     - **§15 End-to-end happy path**: build doc stub with non-default
       pre-set values for all six DOM-backed inputs (and the three
       backing inputs for the globalThis-backed fields):
       ```ts
       distanceScaleInput → "5"
       distanceUnitInput → "mi"
       heightUnit → "ft"
       temperatureScale → "°F"
       areaUnit → "ha"
       heightExponentInput → "1.5"
       populationRateInput → "1500"
       urbanizationInput → "1.2"
       urbanDensityInput → "12"
       ```
       Set `globalThis.distanceScale = 5`, `populationRate = 1500`,
       `urbanization = 1.2`, `urbanDensity = 12`. Set `unlock`,
       `calculateFriendlyGridSize`, `calculateTemperatures`,
       `renderScaleBar` as `vi.fn()`. Set `localStorage =
       makeLocalStorage(vi.fn())`. Run tool.
       - Assert no error; parsed.applied equals canonical defaults.
       - Assert `elements.distanceScaleInput?.value === "3"`,
         `elements.distanceUnitInput?.value === "km"`, etc. for all
         nine input ids.
       - Assert `globalThis.distanceScale === 3`,
         `globalThis.populationRate === 1000`,
         `globalThis.urbanization === 1`,
         `globalThis.urbanDensity === 10`.
       - Assert `localStorage.removeItem` called 8 times with the
         expected keys.
       - Assert `unlock` called once with `"distanceScale"`.
       - Assert `calculateFriendlyGridSize`, `calculateTemperatures`,
         `renderScaleBar` each called once with no args.
       - Assert `parsed.side_effects_run` deep-equals
         `["unlock", "calculateFriendlyGridSize",
         "calculateTemperatures", "renderScaleBar"]`.

     - **§16 Missing localStorage → no error**: Build doc stub.
       `delete globalThis.localStorage` (or set to `undefined`).
       Run tool. Assert no error; `parsed.applied` canonical.

     - **§17 localStorage.removeItem throws → no error**: Build doc
       stub. Set `localStorage = makeLocalStorage(() => { throw new
       Error("oops"); })`. Run tool. Assert no error;
       `parsed.applied` canonical. (Verify all 8 keys still
       attempted — but that'd require a spy that throws; combine
       with vi.fn().mockImplementation.)

     - **§18 Missing side-effect callbacks → side_effects_run subset**:
       Set `globalThis.unlock = undefined`,
       `globalThis.calculateFriendlyGridSize = undefined`. Keep
       `calculateTemperatures = vi.fn()`, `renderScaleBar = vi.fn()`.
       Run tool. Assert `parsed.side_effects_run` deep-equals
       `["calculateTemperatures", "renderScaleBar"]`.

     - **§19 Side-effect throws → omitted**:
       `globalThis.calculateTemperatures = () => { throw new Error(
       "boom"); }`; others as `vi.fn()`. Run tool. Assert no error;
       `parsed.side_effects_run` deep-equals
       `["unlock", "calculateFriendlyGridSize", "renderScaleBar"]`.

     - **§20 Missing DOM element**: doc stub returns `null` for
       `"heightUnit"`. Run tool. Assert no error;
       `parsed.previous.heightUnit === null`.

     - **§21 No `document` global**: `globalThis.document = undefined`.
       Set the four globalThis-backed values to non-defaults. Run
       tool. Assert no error;
       `parsed.previous.distanceUnit === null`,
       `parsed.previous.heightUnit === null`,
       `parsed.previous.temperatureScale === null`,
       `parsed.previous.areaUnit === null`,
       `parsed.previous.heightExponent === null`;
       globalThis-backed previous values still come through.
       `parsed.applied` unchanged.

     - **§22 No globalThis-backed values**: `globalThis.distanceScale =
       undefined`, etc. for all four. Build a normal doc stub. Run
       tool. Assert no error;
       `parsed.previous.distanceScale === null`,
       `parsed.previous.populationRate === null`,
       `parsed.previous.urbanization === null`,
       `parsed.previous.urbanDensity === null`. After the call,
       assert `globalThis.distanceScale === 3`, etc. (the global
       reassignment writes anyway).

3. **Wire into `src/ai/index.ts`**:
   - Add `import { restoreDefaultUnitsTool } from
     "./tools/restore-default-units";` immediately AFTER the existing
     `restoreDefaultNamesbasesTool` import at line 250. Alphabetical:
     `restore-default-n…` < `restore-default-u…`.
   - Add a re-export block immediately AFTER the existing
     `restore-default-namesbases` re-export (lines 2261-2267):
     ```ts
     export {
       createRestoreDefaultUnitsTool,
       defaultRestoreDefaultUnitsRuntime,
       DEFAULT_UNITS,
       type RestoreDefaultUnitsApplied,
       type RestoreDefaultUnitsPrevious,
       type RestoreDefaultUnitsResult,
       type RestoreDefaultUnitsRuntime,
       restoreDefaultUnitsTool,
     } from "./tools/restore-default-units";
     ```
   - Add `registry.register(restoreDefaultUnitsTool);` immediately
     AFTER `registry.register(restoreDefaultNamesbasesTool);` at line
     3232.

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -10`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the `plan-365-restore-default-units`
   branch:
   - `git add aiplans/plan_365.md aiplans/tasks_365.md
     src/ai/tools/restore-default-units.ts
     src/ai/tools/restore-default-units.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add restore_default_units tool

     Implements plan 365. Adds an AI chat tool that resets every
     measurement unit, scale, and rate to its default (metric: km/m/°C;
     distance scale 3; height exponent 1.8; population rate 1000;
     urbanization 1; urban density 10), removes the corresponding
     localStorage entries, and refreshes the scale bar / temperatures /
     grid size — mirroring the "Restore" button in the units editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
