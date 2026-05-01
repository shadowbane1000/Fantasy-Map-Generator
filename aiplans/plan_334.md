# Plan 334: `recalculate_cultures` tool

## Use case

Add an AI chat tool `recalculate_cultures` that re-runs the
culture-expansion algorithm so cell→culture assignments and burg
cultures match the current culture centers / expansionism / type
values. Mirrors the legacy `recalculateCultures(true)` function in
`public/modules/dynamic/editors/cultures-editor.js` (line 663):

```js
function recalculateCultures(force) {
  if (force || culturesAutoChange.checked) {
    Cultures.expand();
    drawCultures();
    pack.burgs.forEach(b => (b.culture = pack.cells.culture[b.cell]));
    refreshCulturesEditor();
  }
}
```

Triggered via the **Recalculate** button in the cultures editor (with
`force=true`; see line 84:
`byId("culturesRecalculate").on("click", () => recalculateCultures(true));`).
The AI cannot trigger this today.

We already have many culture mutators (`set_culture_center`,
`set_culture_expansionism`, `set_culture_type`, `add_culture`,
`remove_culture`, etc.) but no way to trigger the recalc afterward.
Without recalc, edits like changing a culture's center or expansionism
don't propagate to cell assignments and the map looks unchanged. This
plan closes that gap — analogous to plan 330's
`randomize_states_expansion` which calls `recalculateStates(true, true)`.

### Choice of entry point

The legacy editor file is dynamically `import()`-ed as an ES module
(see `public/modules/ui/editors.js` line 1000:
`await import("../dynamic/editors/cultures-editor.js?v=...")`), so its
top-level `function recalculateCultures(force)` is **module-scoped**
— NOT exposed on `window`.

`grep -n "window\." public/modules/dynamic/editors/cultures-editor.js`
returns nothing. There is no `window.recalculateCultures = ...`
assignment anywhere in the codebase. The existing
`set-culture-type.ts` line 61 calls
`getGlobal<() => void>("recalculateCultures")` and best-effort no-ops
when missing — consistent with the global being absent in production.

Therefore we choose **option (b)** from the prompt: call the
underlying steps directly, which exactly matches the body of
`recalculateCultures(true)`:

1. `Cultures.expand()` — `Cultures` is exposed as
   `window.Cultures = new CulturesModule();` at
   `src/modules/cultures-generator.ts` line 1405.
2. `drawCultures()` — `function drawCultures()` is defined at
   `public/modules/ui/layers.js` line 434, loaded as a `<script>`
   tag in `public/main.js`, so it IS a top-level global.
3. Walk `pack.burgs` and assign `b.culture = pack.cells.culture[b.cell]`.

We intentionally skip the legacy `refreshCulturesEditor()` call: the
editor's row inputs are a UI-only affordance, the AI doesn't own
them, and the editor re-reads `pack.cultures` next time it opens. This
is the same fidelity decision made in plan 330 for
`refreshStatesEditor`.

## Lint baseline

`cd /workspace/.claude/worktrees/plan-334 && npm run lint 2>&1 | tail -50`
on the worktree base (master @ 08e69bc, branch
`plan-334-recalculate-cultures`, working tree clean apart from
plan/tasks notes) reports:

```
Checked 773 files in 619ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- Tool takes no arguments.
- Snapshot `previous_distribution` (a `{ cultureId: count }` histogram
  built from `pack.cells.culture`) BEFORE running the recalc — this is
  load-bearing for reporting `cells_changed`.
- Snapshot per-cell previous culture ids and per-burg previous culture
  ids (so we can compute `cells_changed` and `burgs_changed` after
  the recalc).
- Call `Cultures.expand()`.
- Call `drawCultures()`.
- Walk `pack.burgs` and assign
  `b.culture = pack.cells.culture[b.cell]` for every burg with a
  defined `cell` (matches the legacy `forEach`).
- Snapshot post-expansion `distribution`.
- Compute `cells_changed = sum over cells of (prev[i] !== now[i])`,
  `burgs_changed = sum over burgs of (prev[burg.i] !== burg.culture)`.
- Return ok with the four fields.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

- `pack` must exist. Without it, return the pack-missing error.
- `pack.cells.culture` must be array-like (typed array or Array).
  Without it, return the pack-missing error (per consistent neighbour
  wording).
- `pack.burgs` must be an array. Without it, return the pack-missing
  error.
- `Cultures.expand` must be a function. Without it, return the
  Cultures-missing error.
- `drawCultures` must be a function. Without it, return the
  drawCultures-missing error.

### Errors (verbatim)

- `"window.pack is not available; the map hasn't finished loading."`
  — when `pack`, `pack.cells`, `pack.cells.culture`, or `pack.burgs`
  is missing.
- `"Cultures.expand is not available; the map hasn't finished loading."`
  — when the global `Cultures` module or its `expand` method is
  missing.
- `"window.drawCultures is not available."` — when the global
  `drawCultures` function is missing.
- Runtime errors thrown by `Cultures.expand`, `drawCultures`, or
  the burg-sync walk are surfaced via
  `errorResult(err instanceof Error ? err.message : String(err))`.
  Mutations are **NOT** rolled back — `Cultures.expand()` rewrites
  `pack.cells.culture` in place and there is no efficient snapshot to
  restore. This is a documented limitation; same shape as
  plan 330.

### Success result

```jsonc
{
  "ok": true,
  "cells_changed": 423,             // count of cells whose pack.cells.culture[i] differs pre/post
  "burgs_changed": 12,              // count of burgs whose .culture differs pre/post
  "previous_distribution": {        // pre-recalc histogram { cultureId: count } over pack.cells.culture
    "0": 1234,
    "1": 567,
    "2": 800
  },
  "distribution": {                 // post-recalc histogram (same shape)
    "0": 1100,
    "1": 580,
    "2": 921
  }
}
```

When nothing changes (idempotent re-run), both `cells_changed` and
`burgs_changed` are `0` and the two distributions are identical.

## Files

- **NEW** `src/ai/tools/recalculate-cultures.ts` — the tool, patterned
  on `regenerate-zones.ts` + `randomize-states-expansion.ts`. Exports:
  - `interface RecalculateCulturesRuntime { getPack(): Pack | undefined;
    expandCultures(): void; drawCultures(): void; }`
  - `defaultRecalculateCulturesRuntime` — wires `getPack()` to
    `getPack<Pack>()` from `_shared`, `expandCultures()` to
    `globalThis.Cultures.expand()` (throws verbatim error if missing),
    `drawCultures()` to `globalThis.drawCultures()` (throws verbatim
    error if missing).
  - `createRecalculateCulturesTool(runtime?)` returning `Tool` named
    `recalculate_cultures`.
  - `recalculateCulturesTool` — default-runtime instance.
- **NEW** `src/ai/tools/recalculate-cultures.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { recalculateCulturesTool } from "./tools/recalculate-cultures";`
    immediately after the `randomize-states-expansion` import (line
    178). Alphabetical: `randomize-` < `recalculate-` < `regenerate-`.
  - Add a re-export block immediately after the
    `randomize-states-expansion` re-export (currently lines
    1824-1830).
  - Add `registry.register(recalculateCulturesTool);` in
    `defaultToolRegistry()` adjacent to the other recalc/regenerate
    registrations (slot near `randomizeStatesExpansionTool`
    registration at line 2992).

## Tests (Vitest)

Mirror the layout of `randomize-states-expansion.test.ts` +
`regenerate-zones.test.ts`.

### `recalculate_cultures tool` (unit, runtime stubbed)

1. **Happy path — captures previous_distribution BEFORE expand,
   computes cells_changed and burgs_changed correctly, calls expand →
   draw → burg-sync in that order.**
   - Build a pack:
     ```ts
     const cellsCulture = [0, 0, 1, 1, 2, 2, 0, 1];
     const pack = {
       cells: { culture: cellsCulture },
       burgs: [
         { i: 0 }, // skip — i:0 placeholder
         { i: 1, name: "A", cell: 2, culture: 1 },
         { i: 2, name: "B", cell: 4, culture: 2 },
         { i: 3, name: "C", cell: 7, culture: 1 }
       ],
     };
     ```
   - Stub `expandCultures` so when called it overwrites
     `cellsCulture` in place to `[0, 1, 1, 2, 2, 2, 0, 0]` (cells
     1, 3, 7 differ — exact `cells_changed = 3`).
   - Stub `drawCultures` as `vi.fn()`.
   - Verify call order: `expandCultures.mock.invocationCallOrder[0]`
     < `drawCultures.mock.invocationCallOrder[0]` (use
     `mock.invocationCallOrder` — the order check is load-bearing
     because the legacy code calls them in this exact order so any
     downstream side-effects depend on it).
   - Verify burg sync ran AFTER `drawCultures`: in the post-result,
     burg `i:1` (cell 2 → 1, was 1, no change), burg `i:2` (cell 4
     → 2, was 2, no change), burg `i:3` (cell 7 → 0, was 1,
     **changed**). So `burgs_changed = 1`.
   - Assert result:
     ```jsonc
     {
       "ok": true,
       "cells_changed": 3,
       "burgs_changed": 1,
       "previous_distribution": { "0": 3, "1": 3, "2": 2 },
       "distribution":          { "0": 3, "1": 2, "2": 3 }
     }
     ```
2. **previous_distribution captured BEFORE expand runs** (regression
   test). The `expandCultures` stub MUST mutate `cellsCulture` in
   place; the test then asserts `previous_distribution` reflects the
   PRE-mutation values. If the implementation snapshotted after
   `expand()` returned, `previous_distribution` would equal
   `distribution` and `cells_changed` would be 0 — the assertion
   would fail.
   - Approach: build a pack where pre-expand histogram is
     `{ "0": 4, "1": 4 }` and post-expand histogram is
     `{ "0": 1, "1": 7 }`. Assert
     `previous_distribution === { "0": 4, "1": 4 }`,
     `distribution === { "0": 1, "1": 7 }`,
     `cells_changed === 3` (the three flipped cells).
3. **Happy path — nothing changes (idempotent).** `expandCultures`
   stub does NOT mutate `cellsCulture`. Burgs already point to
   matching cell cultures. Result has `cells_changed: 0`,
   `burgs_changed: 0`, `previous_distribution` deeply equals
   `distribution`. `expandCultures` and `drawCultures` still called
   exactly once each.
4. **Burg sync uses post-expand cell culture, not pre-expand.**
   Build a burg whose pre-expand `culture` matched its
   `pack.cells.culture[burg.cell]`. Stub `expand` to flip that
   cell's culture. After the tool runs, `burg.culture` MUST equal
   the new value, not the old. This pins the order: burg sync
   happens AFTER `expand`. (Distinct from §1 because §1 mixes
   multiple changes; this test isolates a single burg's flip.)
5. **Burgs without `cell` are skipped without error.** A burg with
   `cell: undefined` is left untouched. The `i:0` placeholder
   burg is also skipped. `burgs_changed` count does NOT include
   them.
6. **Missing pack → error.** `getPack` returns `undefined`. Result
   is `isError: true` with verbatim
   `"window.pack is not available; the map hasn't finished loading."`.
   `expandCultures` and `drawCultures` never called.
7. **Missing pack.cells → error.** `getPack` returns `{ burgs: [] }`.
   Same error message. Neither downstream called.
8. **Missing pack.cells.culture → error.** `getPack` returns
   `{ cells: {}, burgs: [] }`. Same error.
9. **Missing pack.burgs → error.** `getPack` returns
   `{ cells: { culture: [] } }`. Same error message.
10. **`expandCultures` throws verbatim "Cultures.expand …" error →
    propagated.** Stub throws
    `new Error("Cultures.expand is not available; the map hasn't finished loading.")`.
    Result error matches. `drawCultures` NOT called (because
    expand failed first). Cell array is unchanged (since the stub
    threw before mutating). Burgs unchanged.
11. **`drawCultures` throws verbatim error → propagated.** Stub
    `expandCultures` mutates the cell array; stub `drawCultures`
    throws `new Error("window.drawCultures is not available.")`.
    Result error matches. Burgs NOT synced (we propagate the error
    before the burg loop). Cells ARE mutated (no rollback) —
    documented limitation; assert it.
12. **Arbitrary `expandCultures` runtime error → surfaced as
    `errorResult(err.message)`.** Stub throws `new Error("boom")`.
    Result error is `"boom"`.
13. **Tool name + schema + registry round-trip.**
    `tool.name === "recalculate_cultures"`,
    `input_schema.type === "object"`, `properties === {}`,
    `required === undefined`. Then `new ToolRegistry()`,
    `register(...)`, `list().map(t => t.name)` contains
    `"recalculate_cultures"`.
14. **Empty-input handling.** Parametric over `{}`, `null`,
    `undefined`, `{ extra: "ignored" }` — all behave identically
    (each calls expand + draw exactly once).

### `defaultRecalculateCulturesRuntime (integration)`

Save/restore `globalThis.pack`, `globalThis.Cultures`, and
`globalThis.drawCultures` per test.

15. **End-to-end with populated globals.**
    - Set `globalThis.pack = { cells: { culture: [0, 0, 1, 1] },
      burgs: [{ i: 0 }, { i: 1, cell: 1, culture: 0 }, { i: 2,
      cell: 3, culture: 1 }] }`.
    - Set `globalThis.Cultures = { expand: vi.fn(() => {
      pack.cells.culture[1] = 1; pack.cells.culture[3] = 0;
      }) }`.
    - Set `globalThis.drawCultures = vi.fn();`.
    - Execute. Assert:
      - `Cultures.expand` called once.
      - `drawCultures` called once.
      - `pack.burgs[1].culture === 1`, `pack.burgs[2].culture === 0`.
      - Result has `cells_changed: 2`, `burgs_changed: 2`,
        `previous_distribution: { "0": 2, "1": 2 }`,
        `distribution: { "0": 2, "1": 2 }` (the totals stayed the
        same — only cell↔culture mapping shifted).
16. **Errors when `globalThis.Cultures.expand` missing.**
    - Set `globalThis.Cultures = undefined;` (or `{}`); set valid
      pack and `drawCultures`. Result is error with the verbatim
      `Cultures.expand` message.
17. **Errors when `globalThis.drawCultures` missing.**
    - Set valid pack and `globalThis.Cultures = { expand: vi.fn() }`;
      omit `drawCultures`. Result is error with the verbatim
      `window.drawCultures is not available.` message.
18. **Errors when pack missing entirely.**
    - `globalThis.pack = undefined`. Result is error with the
      pack-missing message. Neither global is called.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Re-read plan + tasks against the use case:

- **Use case fidelity.** The legacy `recalculateCultures(true)` body
  is exactly four steps: `Cultures.expand(); drawCultures();
  pack.burgs.forEach(b => b.culture = pack.cells.culture[b.cell]);
  refreshCulturesEditor();`. We mirror the first three; we skip
  `refreshCulturesEditor()` deliberately (UI affordance, not state)
  consistent with plan 330. The user's "Recalculate" button passes
  `force=true`, which short-circuits the `culturesAutoChange.checked`
  guard — our tool also unconditionally runs (no `force` param to
  expose; the AI's intent IS "force").
- **`window.recalculateCultures` is NOT exposed.** Verified via
  `grep -rn "recalculateCultures" public/ src/` — the only definitions
  are the module-scoped `function` in `cultures-editor.js` and the
  `getGlobal` lookups in `set-culture-type.ts` (which best-effort
  no-op). Therefore option (b) is mandatory, not preferred.
- **`window.Cultures` IS exposed.** Verified at
  `src/modules/cultures-generator.ts:1405`
  (`window.Cultures = new CulturesModule();`) and `Cultures.expand()`
  is called from `public/main.js:660` proving it's globally
  accessible during the runtime path the tool runs in.
- **`window.drawCultures` IS exposed.** Defined as a top-level
  `function drawCultures()` in `public/modules/ui/layers.js`
  (loaded as a `<script>` tag, not a module), so it's a global by
  default per JS hoisting / script-tag semantics.
- **Capture-before-expand.** Test §2 is the load-bearing regression
  guard called out by the prompt. The implementation reads
  `pack.cells.culture` into `previous_distribution` AND a per-cell
  snapshot BEFORE calling `runtime.expandCultures()`, so the
  histogram and cell snapshot reflect pre-expansion values. The
  test forces this by mutating the cell array in the `expand` stub
  and asserting `previous_distribution !== distribution`.
- **Burg snapshot ordering.** Burg `previous` cultures are also
  captured BEFORE `expand` so we can detect changes. (If we read
  `burg.culture` after the burg-sync walk, the `previous` would
  already equal the new value and `burgs_changed` would always be
  0. The implementation captures these BEFORE `expand`.)
- **Per-cell histogram across typed arrays.** `pack.cells.culture`
  is a typed array (e.g. `Uint8Array`) at runtime but the test
  passes a plain `number[]`. Both are iterable and indexable the
  same way, so the implementation uses `length` + index access (no
  `Array.isArray`-only branches).
- **Histogram key type.** Keys are stringified culture ids
  (`"0"`, `"1"`, …) because they're JSON object keys. We convert
  via `String(id)` before indexing the histogram object — this
  matches the docstring example.
- **Empty pack.burgs OK.** If `pack.burgs` is an empty array (no
  burgs in the world), the burg loop is a no-op,
  `burgs_changed = 0`. Not an error.
- **Burg `i:0` placeholder.** Per the convention used in
  randomize-states-expansion (and elsewhere in the codebase), `i:0`
  is the "placeholder" / "wildlands" entry. The legacy `forEach`
  doesn't filter it out, so we don't either — but the placeholder
  has no `cell`, so the "cell undefined → skip" guard naturally
  excludes it. Test §5 pins this.
- **No rollback.** Tests §10, §11, §12 explicitly assert
  mutations persist when the recalc fails. Plan documents this as
  a known limitation. Adding rollback would require snapshotting
  the entire `pack.cells.culture` typed array up front and
  restoring on error — feasible but adds memory cost (the cell
  count is in the 5-50k range typically) and the current behavior
  matches plan 330's no-rollback contract.
- **`Cultures.expand` typed access.** The Cultures module has many
  fields; the runtime narrows to a structural type
  `{ expand?: () => void }` and throws the verbatim error if the
  method isn't a function. No `any` cast in the public surface.
- **Empty-input schema.** `properties: {}`, no `required` — matches
  `randomize_states_expansion` and `regenerate_diplomacy` exactly.
  Test §13 pins this.
- **Error wording matches neighbours.** "is not available; the map
  hasn't finished loading" mirrors the existing pattern. The
  shorter `"window.drawCultures is not available."` mirrors plan
  330's `"window.recalculateStates is not available."` for "global
  helper missing".
- **Alphabetical insertion.** `recalculate-cultures` slots
  immediately after `randomize-states-expansion` (`randomize-` <
  `recalculate-` < `regenerate-`) and the tasks file pins exact
  insertion sites.
- **Test §2 explicit verification.** The prompt mandated the
  "previous_distribution captured BEFORE expansion runs" test;
  test §2 explicitly mutates the typed array INSIDE the `expand`
  stub and asserts the captured pre-distribution differs from the
  post-distribution. Confirmed present.
- **Test §4 explicit verification of burg-sync-after-expand.** A
  burg whose pre-expand `.culture` matched its cell's pre-expand
  culture is asserted to take on the cell's POST-expand culture
  after the tool runs, isolating the ordering invariant.
- **Test §11 verifies `drawCultures` runs AFTER `expand`.** Order
  is checked via `mock.invocationCallOrder` so a regression that
  swapped them would fail.
