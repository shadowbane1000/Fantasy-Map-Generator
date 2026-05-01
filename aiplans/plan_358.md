# Plan 358: `restore_default_biomes` tool

## Use case

Add an AI chat tool `restore_default_biomes` that wipes any user-edited
biomes and reloads the bundled defaults, then re-assigns every cell's
biome from the defaults' temperature/precipitation matrix. This mirrors
the legacy `restoreInitialBiomes` function in
`public/modules/ui/biomes-editor.js` (lines 472-478):

```js
function restoreInitialBiomes() {
  biomesData = Biomes.getDefault();
  Biomes.define();
  drawBiomes();
  recalculatePopulation();
  refreshBiomesEditor();
}
```

`window.Biomes.getDefault()` (defined in `src/modules/biomes.ts` line 11)
returns the bundled default biomes pack: 13 entries — Marine, Hot
desert, Cold desert, Savanna, Grassland, Tropical seasonal forest,
Temperate deciduous forest, Tropical rainforest, Temperate rainforest,
Taiga, Tundra, Glacier, Wetland — with `i`, `name`, `color`,
`biomesMatrix`, `habitability`, `iconsDensity`, `icons`, `cost`.

`window.Biomes.define()` (line 115) walks every cell and writes
`pack.cells.biome[i]` based on each cell's height / temperature /
precipitation against the now-default biomes matrix (which it reads
through the `biomesData` global, so the order matters: replace
`biomesData` first, then call `define`).

The legacy code then calls `drawBiomes()` to repaint the biome layer
and `recalculatePopulation()` because biome habitability changed.
`refreshBiomesEditor()` is editor-popup-only DOM and skipped here
(same precedent as plan 332's skip of `createBasesList`).

The user can already trigger this via the **Restore** button in the
biomes editor. The AI cannot — until now.

We already have these AI biome tools:

- `add_biome`, `remove_biome`, `rename_biome`
- `set_biome_color`, `set_biome_cost`, `set_biome_habitability`,
  `set_biome_icons`, `set_biome_icons_density`
- `find_cells_by_biome`, `get_biome_distribution`, `get_biome_info`,
  `list_biomes`

This plan adds the missing **wipe-and-reload-defaults** action —
analogous to `restore_default_namesbases` (plan 332).

## Lint baseline

`cd /workspace/.claude/worktrees/plan-358 && npm run lint 2>&1 | tail -10`
on the worktree base (master @ 8944bc3, branch
`plan-358-restore-default-biomes`, working tree clean) reports:

```
Checked 821 files in 680ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this —
any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Capture `previous = { count: <length of biomesData.name or 0> }` — the
  pre-restoration biome count, included in the response.
- Capture `previousCellBiomes = Array.from(pack.cells.biome)` — a SNAPSHOT
  of every cell's biome assignment, taken BEFORE `Biomes.define()` runs.
  Used to compute `cells_changed` post-restoration. CRITICAL: this
  snapshot must happen before the redefine call; otherwise the diff is
  always 0.
- Call `Biomes.getDefault()` first → reassign
  `globalThis.biomesData = <returned data>`. CRITICAL: legacy code does
  `biomesData = ...` which is a global REASSIGNMENT, not in-place
  mutation. Any other code holding a reference to the OLD `biomesData`
  array will see the OLD contents while the tool's own continuation
  reads the new one. The runtime exposes a `setBiomesData(data)` seam
  that does `globalThis.biomesData = data`.
- Then call `Biomes.define()`. This must run AFTER `biomesData` is
  reassigned, because `Biomes.define` reads `biomesData.biomesMatrix`
  via the global.
- Compute `cells_changed = count of i where pack.cells.biome[i] !==
  previousCellBiomes[i]` by reading the now-mutated cell biomes (via a
  `getCellBiomes()` runtime seam) and comparing against the pre-define
  snapshot.
- Best-effort: call `drawBiomes()` if `globalThis.drawBiomes` is a
  function. Track success in `drew: boolean` (false if missing or
  threw).
- Best-effort: call `recalculatePopulation()` if
  `globalThis.recalculatePopulation` is a function. Track success in
  `recalculated_population: boolean` (false if missing or threw).
- Return summary.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

Validation order (each check happens BEFORE the corresponding mutation):

1. `Biomes.getDefault` must be a function. Otherwise:
   `"Biomes.getDefault is not available; the map hasn't finished loading."`
2. `Biomes.define` must be a function. Otherwise:
   `"Biomes.define is not available; the map hasn't finished loading."`
3. `pack.cells.biome` must exist (typed array). Otherwise:
   `"window.pack.cells.biome is not available; the map hasn't finished loading."`

The validation happens BEFORE any mutation — if any check fails, the
tool returns an error and `globalThis.biomesData` and
`pack.cells.biome` are UNCHANGED.

The `getDefault` and `define` callable checks live inside the
runtime's `getDefault()` / `define()` seams (so they throw the right
error). The `pack.cells.biome` check lives inside the
`getCellBiomes()` seam (called twice — once for the snapshot, once
for the diff — but only the FIRST call gates further work).

### Errors (verbatim)

- `"Biomes.getDefault is not available; the map hasn't finished loading."`
- `"Biomes.define is not available; the map hasn't finished loading."`
- `"window.pack.cells.biome is not available; the map hasn't finished loading."`
- Any thrown runtime error from `Biomes.getDefault()` or
  `Biomes.define()` is propagated via
  `errorResult(err instanceof Error ? err.message : String(err))`.

`drawBiomes()` and `recalculatePopulation()` errors are SUPPRESSED —
they do not fail the tool. Their success/failure is reflected in the
`drew` / `recalculated_population` result fields.

### Success result

`okResult({ ok: true, biomes_count, cells_changed, drew, recalculated_population })`

Example after restoration on a map with custom biomes that had been
heavily edited:

```jsonc
{
  "ok": true,
  "biomes_count": 13,            // length of biomesData.name AFTER restore
  "cells_changed": 4127,         // count of cells whose biome assignment changed
  "drew": true,                  // drawBiomes() was called and succeeded
  "recalculated_population": true
}
```

When called with `drawBiomes` missing or throwing:

```jsonc
{
  "ok": true,
  "biomes_count": 13,
  "cells_changed": 0,            // matrix happened to match old assignments
  "drew": false,
  "recalculated_population": true
}
```

## Files

- **NEW** `src/ai/tools/restore-default-biomes.ts` — the tool, patterned
  on `restore-default-namesbases.ts` (no-input restore-defaults pattern
  with global reassignment + define + best-effort redraw / recalc).
  Exports:
  - `interface RestoreDefaultBiomesResult { biomes_count: number;
    cells_changed: number; drew: boolean; recalculated_population:
    boolean; }`
  - `interface BiomesDataLike { name?: string[]; ... }` (only `name`
    is consumed for the count; `biomesMatrix` etc. are passed through
    opaquely).
  - `interface RestoreDefaultBiomesRuntime { countPrevious(): number;
    getDefault(): unknown; setBiomesData(data: unknown): void;
    define(): void; getCellBiomes(): ArrayLike<number>; drawBiomes():
    boolean; recalculatePopulation(): boolean; }`
  - `defaultRestoreDefaultBiomesRuntime`:
    - `countPrevious()` reads `getGlobal<BiomesDataLike>("biomesData")`,
      returns `Array.isArray(d?.name) ? d.name.length : 0`.
    - `getDefault()` reads
      `getGlobal<{ getDefault?: () => unknown }>("Biomes")`, throws
      `"Biomes.getDefault is not available; …"` if not callable;
      otherwise invokes and returns.
    - `setBiomesData(data)` does
      `(globalThis as Record<string, unknown>).biomesData = data;`.
      Load-bearing global REASSIGNMENT seam.
    - `define()` reads
      `getGlobal<{ define?: () => void }>("Biomes")`, throws
      `"Biomes.define is not available; …"` if not callable;
      otherwise invokes.
    - `getCellBiomes()` reads `getPack<PackLike>().cells.biome`,
      throws `"window.pack.cells.biome is not available; …"` if
      missing; otherwise returns the typed array directly (no copy
      — the caller copies for the snapshot).
    - `drawBiomes()` reads `getGlobal<() => void>("drawBiomes")`;
      if not callable, returns `false`. If it throws, returns
      `false`. Otherwise returns `true`.
    - `recalculatePopulation()` reads
      `getGlobal<() => void>("recalculatePopulation")`; same
      best-effort wrapper as `drawBiomes()`.
  - `createRestoreDefaultBiomesTool(runtime?)` returning a `Tool`
    named `restore_default_biomes`.
  - `restoreDefaultBiomesTool` — default-runtime instance.
- **NEW** `src/ai/tools/restore-default-biomes.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add
    `import { restoreDefaultBiomesTool } from "./tools/restore-default-biomes";`
    immediately BEFORE the existing `restoreDefaultNamesbasesTool`
    import (line 249). Alphabetical: `restore-default-b…` < `restore-default-n…`.
  - Add a re-export block immediately BEFORE the existing
    `restoreDefaultNamesbasesTool` re-export (line 2247):
    ```ts
    export {
      type BiomesDataLike,
      createRestoreDefaultBiomesTool,
      defaultRestoreDefaultBiomesRuntime,
      type RestoreDefaultBiomesResult,
      type RestoreDefaultBiomesRuntime,
      restoreDefaultBiomesTool,
    } from "./tools/restore-default-biomes";
    ```
    (Keep names alphabetical inside the export block, mirror existing
    style.)
  - Add `registry.register(restoreDefaultBiomesTool);` immediately
    BEFORE `registry.register(restoreDefaultNamesbasesTool);` (line
    3188) — keeps "restore-*" tools clustered.

## Tests (Vitest)

Mirror the layout of `restore-default-namesbases.test.ts` (stub-runtime
suite + default-runtime integration suite).

### `restore_default_biomes tool` (stub-runtime)

1. **Happy path: pre-existing biomesData (5 biomes) gets replaced and
   cell biomes re-assigned**: stub runtime returns `previous_count: 5`,
   `getDefault()` returns a 13-entry default-shaped object,
   `getCellBiomes()` returns a snapshot then a different array post-define
   so we can assert `cells_changed` reflects diff. Tool returns
   `{ ok: true, biomes_count: 13, cells_changed: <diff>, drew: true,
   recalculated_population: true }`. Assert each runtime seam called
   exactly the expected number of times.

2. **Call ORDER** (load-bearing): assert via
   `vi.fn().mock.invocationCallOrder` that the sequence is
   **countPrevious → getCellBiomes (snapshot) → getDefault →
   setBiomesData → define → getCellBiomes (post-define) → drawBiomes →
   recalculatePopulation**. Critical sub-orderings:
   - `getCellBiomes` (snapshot) must happen BEFORE `define` — otherwise
     the snapshot reflects post-restoration state and `cells_changed`
     is always 0.
   - `setBiomesData` must happen BEFORE `define` — `Biomes.define`
     reads `biomesData.biomesMatrix` via the global, so swapping in
     defaults must precede the cell-walk.
   - `drawBiomes` and `recalculatePopulation` happen AFTER `define`.

3. **cells_changed reflects the snapshot taken BEFORE define**:
   stub `getCellBiomes` returns `[0, 1, 2, 3]` on the FIRST call (the
   snapshot) and `[0, 5, 6, 3]` on the SECOND call (post-define).
   Tool result has `cells_changed: 2` (indices 1 and 2 differ;
   indices 0 and 3 unchanged).

4. **Global reassignment verified (identity, not mutation, stub
   variant)**: stub `getDefault()` returns a known object; assert the
   argument passed to `setBiomesData` is the SAME reference
   (`expect(setBiomesData.mock.calls[0]?.[0]).toBe(returnedRef)`). Pins
   that the tool does not wrap / clone the data before reassigning.
   The integration suite (§13) does the end-to-end identity pin via
   `globalThis.biomesData === <getDefault return>`.

5. **Surfaces getDefault errors and skips define / draw / recalc**:
   stub `getDefault()` throws
   `"Biomes.getDefault is not available; the map hasn't finished loading."`
   → `result.isError === true`, error matches `/Biomes\.getDefault/`.
   `setBiomesData`, `define`, and post-define `getCellBiomes`,
   `drawBiomes`, `recalculatePopulation` are NOT called. The
   pre-define `getCellBiomes` (snapshot) and `countPrevious` ARE called
   (they happen before `getDefault`).

6. **Surfaces define errors after biomesData was reassigned**: stub
   `getDefault()` returns ok, stub `define()` throws
   `"Biomes.define is not available; the map hasn't finished loading."`
   → `result.isError === true`, error matches `/Biomes\.define/`.
   `setBiomesData` WAS called (legacy ordering: replace global first;
   if define then fails, the world is in a partial state but the
   global IS swapped — match legacy behavior). `drawBiomes` and
   `recalculatePopulation` are NOT called.

7. **Surfaces snapshot getCellBiomes error and skips everything else**:
   stub `getCellBiomes()` throws
   `"window.pack.cells.biome is not available; the map hasn't finished loading."`
   on the FIRST call → `result.isError === true`, error matches
   `/pack\.cells\.biome/`. `getDefault`, `setBiomesData`, `define`,
   `drawBiomes`, `recalculatePopulation` are NOT called.

8. **drawBiomes returns false when the runtime seam returns false**:
   stub `drawBiomes()` returns `false` (the seam already best-efforts
   missing / throwing internally). Tool returns `drew: false`,
   `recalculated_population: true` (still ran). No error.

9. **recalculatePopulation returns false when the runtime seam returns
   false**: stub `recalculatePopulation()` returns `false`. Tool
   returns `recalculated_population: false`, `drew: true`. No error.

10. **biomes_count: 0 when getDefault returns data without name array**:
    stub `getDefault()` returns `{ name: undefined }`. Tool returns
    `biomes_count: 0`. (Defensive: getDefault contract is to return a
    well-formed object, but the tool reads
    `Array.isArray(data?.name) ? data.name.length : 0`.)

11. **Tool name + schema + registry round-trip**:
    - `tool.name === "restore_default_biomes"`.
    - `tool.input_schema.type === "object"`.
    - `tool.input_schema.properties` deep-equals `{}`.
    - `(tool.input_schema as { required?: unknown }).required` is
      undefined.
    - `new ToolRegistry()`,
      `registry.register(restoreDefaultBiomesTool)`,
      `expect(registry.list().map(t => t.name)).toContain(
      "restore_default_biomes")`.

12. **Empty-input handling**: passing `{}`, `null`, `undefined`, and a
    payload with extraneous keys all execute identically — the tool
    ignores its input.

### `defaultRestoreDefaultBiomesRuntime (integration)`

Per-test save/restore of `globalThis.Biomes`, `globalThis.biomesData`,
`globalThis.pack`, `globalThis.drawBiomes`,
`globalThis.recalculatePopulation` in `beforeEach` / `afterEach`
(mirror plan-332 pattern).

13. **Calls Biomes.getDefault then Biomes.define and reassigns biomesData
    (identity pin)**:
    - Set `globalThis.biomesData = { name: ["A", "B"] }` (2 entries).
    - Build `defaultData = { i: [0, 1, 2], name: ["X", "Y", "Z"], … }`.
    - Set `globalThis.Biomes = { getDefault: vi.fn(() => defaultData),
      define: vi.fn(() => { /* mutate pack.cells.biome */ }) }`.
    - Set `globalThis.pack = { cells: { biome: new Uint8Array([0, 1,
      2, 3, 4]) } }`.
    - The `define` mock writes `pack.cells.biome[1] = 7` (so 1 cell
      changes).
    - Set `globalThis.drawBiomes = vi.fn()`,
      `globalThis.recalculatePopulation = vi.fn()`.
    - Call `restoreDefaultBiomesTool.execute({})`.
    - Assert `result.isError` falsy, parsed content
      `{ ok: true, biomes_count: 3, cells_changed: 1, drew: true,
      recalculated_population: true }`.
    - Assert `Biomes.getDefault` called once with no args.
    - Assert `Biomes.define` called once with no args.
    - Assert `globalThis.biomesData === defaultData` (load-bearing
      identity pin).
    - Assert `drawBiomes` called once.
    - Assert `recalculatePopulation` called once.

14. **Errors when Biomes global is missing (or getDefault not
    callable)**: `globalThis.Biomes = undefined`. Snapshot
    `previousBiomesData = globalThis.biomesData`. Run tool. Assert
    error matches `/Biomes\.getDefault/`. Assert
    `globalThis.biomesData === previousBiomesData` (unchanged).
    Assert `pack.cells.biome` unchanged (snapshot before, compare
    after).

15. **Errors when Biomes.define is not callable but getDefault is**:
    `globalThis.Biomes = { getDefault: vi.fn(() => ({ name: ["X"] })),
    define: undefined }`. Snapshot
    `previousBiomesData = globalThis.biomesData`. Run tool. Assert
    error matches `/Biomes\.define/`. Document the partial-state
    limitation: `globalThis.biomesData` IS reassigned (legacy
    behavior — replace the global before define, so a define failure
    leaves the global in the new state). The test pins
    `globalThis.biomesData === <returned default>` (NOT the snapshot)
    to document this.

16. **Errors when pack.cells.biome is missing**: `globalThis.pack = {
    cells: {} }` (no `biome` field). Snapshot
    `previousBiomesData = globalThis.biomesData`. Run tool. Assert
    error matches `/pack\.cells\.biome/`. Assert
    `globalThis.biomesData === previousBiomesData` (unchanged — error
    happened during the snapshot, before getDefault).

17. **drawBiomes missing → drew: false; no error**: working pack +
    Biomes; `globalThis.drawBiomes = undefined`,
    `globalThis.recalculatePopulation = vi.fn()`. Tool returns ok with
    `drew: false`, `recalculated_population: true`.

18. **drawBiomes throws → drew: false; no error; everything else still
    runs**: `globalThis.drawBiomes = () => { throw new Error("x"); }`,
    `globalThis.recalculatePopulation = vi.fn()`. Tool returns ok with
    `drew: false`, `recalculated_population: true`. The thrown error
    is suppressed.

19. **recalculatePopulation missing → recalculated_population: false;
    no error**: working pack + Biomes; `globalThis.drawBiomes =
    vi.fn()`, `globalThis.recalculatePopulation = undefined`. Tool
    returns ok with `drew: true`, `recalculated_population: false`.

20. **recalculatePopulation throws → recalculated_population: false;
    no error**: same as §19 but `recalculatePopulation = () => {
    throw new Error("y"); }`.

21. **Surfaces a thrown runtime error from getDefault**:
    `globalThis.Biomes = { getDefault: () => { throw new Error("boom");
    }, define: vi.fn() }`. Snapshot. Run tool. Error exactly `"boom"`.
    `Biomes.define` NOT called. `biomesData` unchanged.

22. **Surfaces a thrown runtime error from define (biomesData IS
    swapped)**: `globalThis.Biomes = { getDefault: () => ({ name:
    ["X"] }), define: () => { throw new Error("boom2"); } }`. Run
    tool. Error exactly `"boom2"`. `globalThis.biomesData ===
    <returned default>` (legacy semantics: global swapped before
    define). `drawBiomes` / `recalculatePopulation` NOT called.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `restoreInitialBiomes` does five
  things: (1) `biomesData = Biomes.getDefault()`, (2) `Biomes.define()`,
  (3) `drawBiomes()`, (4) `recalculatePopulation()`, (5)
  `refreshBiomesEditor()`. The tool faithfully mirrors (1)-(4). (5) is
  editor-popup-only DOM; skipped per same precedent as plan 332's skip
  of `createBasesList()`. The four mirrored steps run in legacy order
  (1 → 2 → 3 → 4).

- **Global REASSIGNMENT (identity-pinned).** The legacy code does
  `biomesData = ...` which writes the binding. Test §4 (stub) and §13
  (integration) pin `globalThis.biomesData === <getDefault return>`
  with strict `===`. A regression that mutated in place (e.g. `Object
  .assign(biomesData, defaults)`) would break both tests.

- **`Biomes.define` reads through `biomesData` global.** Inspected
  `src/modules/biomes.ts` line 171:
  `return biomesData.biomesMatrix[moistureBand][temperatureBand];`.
  This MUST happen AFTER the global is reassigned. Test §2 enforces
  the call order via `mock.invocationCallOrder`. If we got the order
  backwards, `define` would re-derive cell biomes from the
  user-edited (about-to-be-overwritten) matrix.

- **`cells_changed` snapshot timing.** Test §3 explicitly stubs
  `getCellBiomes` to return DIFFERENT arrays on the first vs. second
  call, proving the snapshot was taken BEFORE define ran. If the tool
  took the snapshot AFTER define, the diff would always be 0
  (snapshotting a typed array that was just written by define gives
  the same content as reading it again immediately after).

- **`Array.from(typedArray)` clones into a new `number[]`** so
  subsequent in-place writes by `Biomes.define` don't retroactively
  change the snapshot. The runtime's `getCellBiomes()` returns the
  raw typed array; the tool body wraps it with `Array.from(...)` for
  the snapshot, then the SECOND call (after define) reads the now-
  mutated typed array directly. The diff loop iterates over the
  shorter of the two lengths to be safe (lengths should match in
  practice).

- **Validation order vs. partial-state on define failure.** The
  legacy code is `biomesData = getDefault(); define()`. If `define`
  fails AFTER the global was swapped, the user's `biomesData` is
  already the defaults but cell assignments still reflect the old
  matrix. We mirror this — test §15 and §22 explicitly document
  `globalThis.biomesData === <returned default>` (NOT the snapshot)
  on define failure. We accepted this asymmetry because (a) it
  matches legacy behavior and (b) rolling back would require
  capturing the OLD `biomesData` reference and restoring it, which
  introduces its own race window. The legacy "global is swapped, cell
  state stale" outcome is at least consistent with the next biomes
  operation (which will read the new defaults and re-derive).

- **`pack.cells.biome` validation gates everything else.** Test §16
  pins `globalThis.biomesData` UNCHANGED on the snapshot-failure
  path, because the snapshot happens BEFORE `getDefault`. This is
  the right ordering — if the cells aren't ready, we shouldn't
  touch the global at all.

- **Best-effort `drawBiomes` / `recalculatePopulation`.** Both are
  wrapped in the runtime seam itself: missing function → return
  `false`; throws → return `false`. The tool body just records the
  boolean. Tests §8 / §9 (stub) and §17-§20 (integration) cover all
  four combinations of present-and-success / present-and-throw /
  missing for both helpers. This pattern matches `regenerate-zones`
  (which does the equivalent for `drawZones`).

- **`biomes_count` is robust to malformed getDefault returns.**
  Test §10 pins `biomes_count: 0` when `getDefault` returns
  `{ name: undefined }`. We could be stricter (reject the result,
  fail the tool), but the legacy semantics treat `getDefault`'s
  return as opaque data assigned to the global — we mirror that and
  just count what's there.

- **Result field naming.** `biomes_count`, `cells_changed`, `drew`,
  `recalculated_population` are snake_case. `biomes_count` mirrors
  `count` from plan-332 (here we name it `biomes_count` because the
  separate `cells_changed` field would otherwise make `count`
  ambiguous). `drew` mirrors the boolean style used elsewhere; an
  alternative name `redrew` is also defensible but `drew` is shorter
  and the tool's job IS the first draw on the new defaults.
  `recalculated_population` is verbose but unambiguous.

- **No-input schema.** `properties: {}`, no `required` — matches
  `restore_default_namesbases` exactly. Test §11 asserts the schema
  shape.

- **Alphabetical insertion.** `restore-default-biomes` slots
  immediately BEFORE `restore-default-namesbases` in imports AND
  re-exports (b < n). In the registry block, placement immediately
  before `restoreDefaultNamesbasesTool` keeps the "restore-*" tools
  clustered for grep-ability.

- **Test isolation.** Integration tests save/restore FIVE globals
  (`Biomes`, `biomesData`, `pack`, `drawBiomes`,
  `recalculatePopulation`). Without all five, state from earlier
  tests would bleed into later ones — particularly since the tool
  literally writes to `globalThis.biomesData` and the `define` mock
  writes to `pack.cells.biome`.

- **Identity pin in stub-runtime suite (§4).** Without this,
  a regression where the tool wraps the data
  (e.g. `setBiomesData({ ...returned })`) would still pass §13's
  identity check IF `define` was patched to ignore the spread (it
  reads through the global, so the spread copy IS what gets read).
  The stub identity pin (§4) catches this directly at the seam
  boundary.

- **Error wording matches neighbors.**
  `"Biomes.getDefault is not available; the map hasn't finished loading."`
  and `"Biomes.define is not available; the map hasn't finished loading."`
  follow plan-332's pattern. The pack-cells error
  `"window.pack.cells.biome is not available; the map hasn't finished loading."`
  is slightly more specific because `pack.cells.biome` is a property
  chain, not a global module.

- **Not rolling back on define failure (§22).** Considered capturing
  the OLD `biomesData` reference at runtime entry and restoring on
  define-failure to give "all-or-nothing" semantics. Rejected:
  (a) doesn't match legacy, (b) `Biomes.define` is the same code
  path the user button hits — if it throws here, it'll throw next
  time too, so rollback just defers the inconsistency, (c) introduces
  its own failure mode if rollback itself throws. Documented in §15
  / §22 so future readers know it's intentional.

- **`countPrevious` dropped during review.** Initial draft included a
  `countPrevious()` runtime seam mirroring plan 332's
  `previous_count` field. On review, the success result schema does
  NOT surface a previous count (we surface `biomes_count` for the
  AFTER state plus `cells_changed` for the diff — these together
  fully characterize the change, and adding `previous_count` would
  be redundant unless we also surfaced previous biome NAMES, which
  feels out of scope). Removing `countPrevious` from the runtime
  interface and tool body simplifies the call-order test (§2) from
  eight seams to seven, and avoids a `noUnusedLocals` warning for
  the unused local. Tasks file (§1) has been updated to reflect this
  removal.
