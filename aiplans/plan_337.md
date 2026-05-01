# Plan 337: `regenerate_culture_burgs` tool

## Use case

Add an AI chat tool `regenerate_culture_burgs` that regenerates the
names of every non-removed, non-locked burg belonging to a single
culture, using `Names.getCulture(cultureId)` (which delegates to the
culture's `base` namesbase). Mirrors the legacy `cultureRegenerateBurgs`
function in `public/modules/dynamic/editors/cultures-editor.js` (line
496), which is wired to the per-row "Regenerate burgs" button next to
each culture in the Cultures Editor:

```js
function cultureRegenerateBurgs() {
  if (customization === 4) return;

  const cultureId = +this.parentNode.dataset.id;
  const base = pack.cultures[cultureId].base;
  if (!nameBases[base]) return tip("Namesbase is not defined, please select a valid namesbase", false, "error", 5000);

  const cultureBurgs = pack.burgs.filter(b => b.culture === cultureId && !b.removed && !b.lock);
  cultureBurgs.forEach(b => {
    b.name = Names.getCulture(cultureId);
    labels.select("[data-id='" + b.i + "']").text(b.name);
  });
  tip(`Names for ${cultureBurgs.length} burgs are regenerated`, false, "success");
}
```

We already have:

- `regenerate_burg_name` — regenerates the name for ONE burg (mode
  `culture` calls `Names.getCulture(burg.culture)`, mode `random`
  calls `Names.getBase(rand)`).
- `regenerate_all_burg_names` — regenerates ALL burg names regardless
  of culture.
- `regenerate_all_culture_names` — bulk-regenerates *culture* names
  (not burg names of cultures).
- `set_burg_culture` — reassigns a single burg to a different culture.

This plan adds the missing **regenerate-by-culture** action, which is
useful when the AI changes a culture's `base` namesbase and wants to
refresh all that culture's burgs to use the new corpus, without
touching burgs of other cultures (which `regenerate_all_burg_names`
would do).

## Lint baseline

`npm run lint 2>&1 | tail -50` on the worktree base
(branch `plan-337-regenerate-culture-burgs`, master @ 2682daa, working
tree clean for `src/`) reports:

```
Checked 777 files in 614ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- Resolve a single culture by `culture` (id or name) using the same
  `findEntityByRef` pattern as `set_burg_culture` (case-insensitive
  match on `name` / `fullName`).
- **Culture 0 (Wildlands) handling:** the legacy editor row for
  Wildlands does include a "Regenerate burgs" button (the editor
  template wires a click handler to every row's
  `span.icon-arrows-cw`), so we mirror that and **allow culture 0**.
  The actual safety check is the `nameBases[culture.base]` lookup —
  if Wildlands has no valid namesbase (the most common case in stock
  maps), the tool returns the same "Namesbase X is not defined"
  error the UI shows. This keeps parity with the editor button.
  Removed cultures, however, are rejected (matches the
  `findEntityByRef` `removed: true` skip and our other
  per-culture mutators).
- Verify that `nameBases[culture.base]` exists (mirrors the UI's
  tip-and-bail check). When absent, return error.
- Iterate `pack.burgs.filter(b => b.culture === cultureId && !b.removed && !b.lock)`.
  Skip locked AND removed burgs explicitly (locked = `lock: true`,
  removed = `removed: true`).
- For each surviving burg:
  - Compute `newName = Names.getCulture(cultureId)`.
  - Set `b.name = newName`.
  - Best-effort: update the burg label DOM via
    `document.getElementById("burgLabel" + i).textContent = newName`
    (this matches what `regenerate_burg_name` and
    `regenerate_all_burg_names` do, and is the modern equivalent of
    the legacy `labels.select("[data-id='" + b.i + "']").text(...)`
    selector — both ultimately mutate the same SVG text node). Wrap
    in try/catch since `document` may not be present in tests.
- Return summary listing the culture, namesbase id, count of burgs
  renamed, count of burgs skipped (broken into `skipped_locked` and
  `skipped_removed`), and a `renamed` array with each burg's id,
  previous name, and new name.

### Renamed-list cap

The `renamed` array in the response is **capped at 50 entries** to
avoid bloating the response when a culture has hundreds of burgs.
The `renamed_count` field always reflects the true total (uncapped).
When the cap kicks in, the response also includes
`"renamed_truncated": true` so callers can distinguish "saw all of
them" from "saw the first 50". 50 matches the cap used elsewhere in
this codebase (e.g. several list-tool defaults).

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "culture": {
      "type": ["integer", "string"],
      "description": "Culture id (>=0; 0 is Wildlands) or case-insensitive name."
    }
  },
  "required": ["culture"]
}
```

### Validation

- `culture` must be a non-negative integer or non-empty string. (We
  permit 0 here, unlike most ref helpers — Wildlands is a legitimate
  target as long as its namesbase resolves. We use a custom validator
  rather than `parseEntityRef`, which rejects 0.)
- The resolved culture must exist and not be `removed: true`.
- `nameBases[culture.base]` must exist (i.e. `nameBases` is an array,
  `culture.base` is a number, and `nameBases[culture.base]` is
  truthy).
- `pack.burgs` must be an array (otherwise we have nothing to
  iterate over).
- `Names.getCulture` must be a function on `globalThis.Names`.

### Errors (verbatim)

- `"culture must be a non-negative integer id or a non-empty name string."` —
  invalid ref shape (mirrors `set_burg_culture`'s wording).
- `"Culture ${ref} not found."` — ref doesn't resolve. `${ref}` is
  the JSON-stringified original input value (matches
  `set_burg_culture`'s "No burg found matching" pattern but using
  the shorter "not found" suffix; we keep this consistent across the
  per-culture regen tools added in this plan, regenerate-burg-name's
  per-burg ref errors are slightly different but that's fine).
- `"Cannot regenerate burgs for removed culture ${i}."` — culture
  resolved but is `removed: true`.
- `"Namesbase ${base} is not defined; cannot regenerate."` — culture
  has a `base` field but `nameBases[base]` is falsy / out of range,
  OR `culture.base` itself is missing.
- `"window.pack.burgs is not available; the map hasn't finished loading."` —
  `pack` or `pack.burgs` is missing.
- `"Names.getCulture is not available; the map hasn't finished loading."` —
  `Names` global missing OR `Names.getCulture` isn't a function.
- Runtime errors from `Names.getCulture` are propagated via
  `errorResult(err.message)`. Mutations made for prior burgs in the
  loop ARE preserved (we don't roll back; documented limitation —
  same shape as other per-burg loop tools).

### Success result

```jsonc
{
  "ok": true,
  "culture": { "i": 3, "name": "Elvish" },
  "namesbase": 5,
  "renamed_count": 12,
  "skipped_locked": 2,
  "skipped_removed": 1,
  "renamed": [
    { "i": 17, "previous_name": "Foo", "name": "Bar" },
    { "i": 23, "previous_name": "Baz", "name": "Qux" }
  ]
}
```

When more than 50 burgs are renamed, the `renamed` array contains
the first 50 entries and the response additionally carries
`"renamed_truncated": true`.

## Files

- **NEW** `src/ai/tools/regenerate-culture-burgs.ts` — the tool.
  Exports:
  - `interface RegenerateCultureBurgsCultureRef { i: number; name: string; base: number | null; removed?: boolean; }`.
  - `interface RegenerateCultureBurgsBurgRef { i: number; name: string; lock?: boolean; removed?: boolean; }`.
  - `interface RegenerateCultureBurgsRuntime`:
    ```ts
    {
      findCulture(ref: number | string): RegenerateCultureBurgsCultureRef | null;
      hasNamesbase(base: number): boolean;
      listBurgsForCulture(cultureId: number): RegenerateCultureBurgsBurgRef[]; // includes locked/removed; tool partitions
      generate(cultureId: number): string;
      apply(burgId: number, name: string): void;
    }
    ```
  - `defaultRegenerateCultureBurgsRuntime`:
    - `findCulture(ref)`: special-cases `ref === 0` and the
      string `"wildlands"` (case-insensitive) to pull
      `pack.cultures[0]` (which `findEntityByRef` would skip), and
      otherwise delegates to `findEntityByRef(getPackCollection<RawCulture>("cultures"), ref)`.
      Returns `{ i, name, base: typeof culture.base === "number" ? culture.base : null, removed: !!culture.removed }`.
    - `hasNamesbase(base)`: `const bases = getGlobal<unknown[]>("nameBases"); return Array.isArray(bases) && bases[base] !== undefined && bases[base] !== null;`.
    - `listBurgsForCulture(cultureId)`: walks `getPackCollection<RawBurg>("burgs")`, returning every burg with `culture === cultureId` (and `i > 0`), tagging `lock` / `removed` so the tool can partition.
    - `generate(cultureId)`: `const names = getGlobal<NamesModule>("Names"); if (!names || typeof names.getCulture !== "function") throw new Error("Names.getCulture is not available; the map hasn't finished loading."); return names.getCulture(cultureId);`.
    - `apply(burgId, name)`: lookup `pack.burgs[burgId]`, set `name`. Best-effort DOM update via `document.getElementById("burgLabel" + burgId)?.textContent = name` wrapped in `if (typeof document !== "undefined")`.
  - `createRegenerateCultureBurgsTool(runtime?)` returning a `Tool`
    named `regenerate_culture_burgs`.
  - `regenerateCultureBurgsTool` — default-runtime instance.

  **Tool execute flow:**
  1. Validate `input.culture` is a non-negative integer OR a
     non-empty string. If not → error "culture must be a
     non-negative integer id or a non-empty name string.".
  2. `const culture = runtime.findCulture(input.culture);` — if null
     → `errorResult(\`Culture \${JSON.stringify(input.culture)} not found.\`)`.
  3. If `culture.removed` → `errorResult(\`Cannot regenerate burgs for removed culture \${culture.i}.\`)`.
  4. If `culture.base === null` OR `!runtime.hasNamesbase(culture.base)` →
     `errorResult(\`Namesbase \${culture.base ?? "(unset)"} is not defined; cannot regenerate.\`)`.
  5. `let burgs: RegenerateCultureBurgsBurgRef[]; try { burgs = runtime.listBurgsForCulture(culture.i); } catch (err) { return errorResult(...); }` — surfaces the "pack.burgs missing" error from the runtime.
  6. Partition: locked = `b.lock === true`; removed = `b.removed === true`; active = neither. Count locked/removed for the response.
  7. For each active burg:
     - Try `runtime.generate(culture.i)`. If throws → return `errorResult(err.message)` immediately (mutations from earlier iterations are preserved).
     - If empty/whitespace → return `errorResult("Name generator returned an empty string.")`. (Documented limitation: prior renames preserved.)
     - Try `runtime.apply(burg.i, newName)`. If throws → return `errorResult(err.message)`.
     - Push `{ i: burg.i, previous_name: burg.name, name: newName }` to a local array.
  8. Cap the `renamed` payload at 50. Set `renamed_truncated: true` only when the cap kicks in.
  9. Return `okResult({ culture: { i, name }, namesbase: culture.base, renamed_count: active.length, skipped_locked, skipped_removed, renamed: capped, ...(truncated ? { renamed_truncated: true } : {}) })`.

- **NEW** `src/ai/tools/regenerate-culture-burgs.test.ts` — Vitest
  spec (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { regenerateCultureBurgsTool } from "./tools/regenerate-culture-burgs";`
    in the import block. Alphabetical: `regenerate-burg-name` (`reg…burg-n`)
    < `regenerate-culture-burgs` (`reg…cu`) < `regenerate-diplomacy`
    (`reg…di`). Slot between lines 186 and 187.
  - Add a re-export block right after the `regenerate-burg-name`
    re-export (around line 1872):
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
  - Add `registry.register(regenerateCultureBurgsTool);` in
    `defaultToolRegistry()` adjacent to the
    `regenerateAllBurgNamesTool` / `regenerateAllCultureNamesTool`
    block (after line 2980). Position by topic, not strictly alpha:
    next to the other "regenerate burg names" cousins.

## Tests (Vitest)

Mirror the layout of `regenerate-all-culture-names.test.ts` and
`set-burg-culture.test.ts`.

### `regenerate_culture_burgs tool` (unit, runtime stubbed)

Helper `makeRuntime(opts)` produces a runtime with `findCulture`,
`hasNamesbase`, `listBurgsForCulture`, `generate`, `apply` as
`vi.fn`s and returns the runtime + spies.

1. **Happy path: 5 burgs of culture 3 (3 active, 1 locked, 1 removed) — only 3 renamed; locked/removed counted; previous_name captured per burg; Names.getCulture called for each renamed burg; no other burgs touched.**
   - `findCulture(3) → { i: 3, name: "Elvish", base: 5 }`.
   - `hasNamesbase(5) → true`.
   - `listBurgsForCulture(3) →` array of 5 burgs:
     - `{ i: 11, name: "Old1" }` (active)
     - `{ i: 12, name: "Locked1", lock: true }`
     - `{ i: 13, name: "Old2" }` (active)
     - `{ i: 14, name: "Removed1", removed: true }`
     - `{ i: 15, name: "Old3" }` (active)
   - `generate(3)` returns sequential `"New1"`, `"New2"`, `"New3"`.
   - Execute `{ culture: 3 }`. Assertions:
     - `result.isError` falsy.
     - `generate` called exactly 3 times (always with `3`).
     - `apply` called exactly 3 times — `(11, "New1")`, `(13, "New2")`, `(15, "New3")`.
     - Body equals
       ```
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
       (no `renamed_truncated` key since count <= 50).

2. **Resolves culture by case-insensitive name.**
   - `findCulture` returns the same elvish object for any input
     matching `/elvish/i`. Execute with `{ culture: "ELVISH" }`.
     Assert `findCulture` was called with `"ELVISH"` and `apply`
     was invoked correctly.

3. **Resolves culture by id.** (Already in §1; this test specifically
   passes `{ culture: 3 }` and asserts `findCulture` called with
   `3`.)

4. **Culture 0 (Wildlands) accepted when namesbase exists.**
   - `findCulture(0) → { i: 0, name: "Wildlands", base: 0 }`.
   - `hasNamesbase(0) → true`.
   - `listBurgsForCulture(0) → []`.
   - Result `ok: true`, `renamed_count: 0`.

5. **Culture not found → error, no apply.**
   - `findCulture` returns `null`. Execute `{ culture: 99 }`.
   - `result.isError === true`, body's `error` matches `/Culture 99 not found/`.
   - `apply` never called.

6. **Removed culture rejected.**
   - `findCulture(3)` returns `{ i: 3, name: "X", base: 5, removed: true }`.
   - `result.isError === true`, body's `error` matches `/Cannot regenerate burgs for removed culture 3/`.
   - `apply` never called.

7. **Namesbase missing → error.**
   - `findCulture(3)` returns `{ i: 3, name: "X", base: 7 }`.
   - `hasNamesbase(7) → false`.
   - `result.isError === true`, body's `error` matches `/Namesbase 7 is not defined/`.
   - `apply` never called; `generate` never called.

8. **Culture has no base (`base: null`) → error.**
   - `findCulture(3)` returns `{ i: 3, name: "X", base: null }`.
   - `result.isError === true`, body's `error` matches `/Namesbase \(unset\) is not defined/`.
   - `apply` / `generate` never called. (Bonus check: `hasNamesbase` is also never called since we short-circuit.)

9. **Missing pack.burgs → error.**
   - `listBurgsForCulture` throws
     `new Error("window.pack.burgs is not available; the map hasn't finished loading.")`.
   - Result `isError: true`; body's `error` is that exact message.
   - `apply` never called.

10. **Missing Names.getCulture → error (via generate throwing on first burg).**
    - `findCulture(3) → { i: 3, name: "X", base: 5 }`, `hasNamesbase(5) → true`,
      `listBurgsForCulture(3)` returns one active burg.
    - `generate` throws
      `new Error("Names.getCulture is not available; the map hasn't finished loading.")`.
    - Result `isError: true`; body's `error` is that exact message.
    - `apply` never called.

11. **Culture with NO burgs → ok, renamed_count=0, renamed=[], skipped_locked=0, skipped_removed=0.**
    - `findCulture(3) → { i: 3, name: "Empty", base: 5 }`,
      `hasNamesbase(5) → true`, `listBurgsForCulture(3) → []`.
    - Body: `{ ok: true, culture: { i: 3, name: "Empty" }, namesbase: 5, renamed_count: 0, skipped_locked: 0, skipped_removed: 0, renamed: [] }`.
    - `generate` and `apply` never called.

12. **Locked burgs are NOT touched (verify .name unchanged after the call).**
    - This is the **mandatory** check called out in the prompt.
    - Build a `burgsList` array shared between the runtime
      closure and the test. The runtime's `listBurgsForCulture`
      returns references into this array (objects, not copies).
      The runtime's `apply(i, name)` mutates the matching burg's
      `name` field in `burgsList`.
    - Burgs: `{ i: 1, name: "Free", culture: 3 }`, `{ i: 2, name: "Stuck", culture: 3, lock: true }`.
    - Execute `{ culture: 3 }`. Assert:
      - Body `renamed_count === 1`, `skipped_locked === 1`.
      - `burgsList[0].name === "Generated"` (rename occurred).
      - `burgsList[1].name === "Stuck"` (locked burg's name unchanged after the call). ← load-bearing.
      - `apply` was NOT called with id 2.

13. **`generate` throws inside loop on the SECOND burg → error result, but mutation made for the FIRST burg IS preserved.**
    - Documents the no-rollback contract.
    - Three active burgs. `generate` returns `"New1"` then throws
      `new Error("boom")` on the second call.
    - `apply` was called once (with the first burg's id and `"New1"`).
    - Result `isError: true`, error matches `/boom/`.
    - The first burg's mutation is observable (in the test we check
      that `apply` was called → in production `b.name` would be
      updated). We assert via `apply.mock.calls.length === 1` and
      `apply.mock.calls[0]` content.

14. **`generate` returns empty string → error, no apply for that burg.**
    - One active burg. `generate` returns `"   "`.
    - Result `isError: true`, error matches `/empty/i`.
    - `apply` never called.

15. **`apply` throws → error, mutation from prior iterations preserved.**
    - Two active burgs. `generate` returns `"New1"` / `"New2"`.
      `apply` succeeds on first call, throws `new Error("apply-boom")`
      on second call.
    - Result `isError: true`, error matches `/apply-boom/`.
    - `apply.mock.calls` recorded `[1, "New1"]` and `[2, "New2"]`.

16. **Renamed-list cap at 50.**
    - 60 active burgs, all `generate` succeeds, all `apply` succeeds.
    - Body `renamed_count === 60` (TRUE total).
    - Body `renamed.length === 50`.
    - Body `renamed_truncated === true`.

17. **No truncated flag when renamed_count <= 50.**
    - 30 active burgs. Body `renamed_count === 30`,
      `renamed.length === 30`. Body has NO `renamed_truncated` key
      (assert via `"renamed_truncated" in body === false`).

18. **Invalid input shapes rejected.**
    - Parametric over: `{}`, `{ culture: null }`, `{ culture: "" }`,
      `{ culture: 1.5 }`, `{ culture: -1 }`, `{ culture: [] }`.
      Each → `result.isError === true`. `findCulture` never called.

19. **Tool name + schema + registry round-trip.**
    - `tool.name === "regenerate_culture_burgs"`.
    - `tool.input_schema.required` is `["culture"]`.
    - Register in fresh `ToolRegistry`; `list()` contains
      `"regenerate_culture_burgs"`.

### `defaultRegenerateCultureBurgsRuntime (integration)`

20. **End-to-end with populated globals.**
    - Save/restore `globalThis.pack`, `globalThis.Names`,
      `globalThis.nameBases`, `globalThis.document` per test.
    - `globalThis.pack = { cultures: [...], burgs: [...] }`. Cultures
      include id 0 ("Wildlands") and id 3 ("Elvish") with `base: 5`.
      Burgs: 5 with `culture: 3` (one locked, one removed),
      plus 1 with `culture: 1` (different culture, must be untouched).
    - `globalThis.Names = { getCulture: vi.fn((c) => "GenName" + c) }`.
    - `globalThis.nameBases = [{}, {}, {}, {}, {}, { name: "Elvish" }]` (length 6, base 5 valid).
    - `globalThis.document = { getElementById: vi.fn((id) => labelMap[id] ?? null) }`.
    - Execute `regenerateCultureBurgsTool.execute({ culture: 3 })`.
    - Assertions:
      - `result.isError` falsy.
      - Body `renamed_count === 3`, `skipped_locked === 1`, `skipped_removed === 1`.
      - The 3 active burgs have `name === "GenName3"` after the call.
      - The locked burg's name is unchanged.
      - The removed burg's name is unchanged.
      - The culture-1 burg's name is unchanged.
      - `Names.getCulture` was called 3 times with `3`.
      - The 3 corresponding `burgLabel{i}` DOM nodes had their `textContent` set to `"GenName3"` (best-effort DOM update).

21. **Integration: missing nameBases → "Namesbase X is not defined" error from runtime.hasNamesbase.**
    - `globalThis.nameBases = undefined`. Pack populated.
    - Result `isError: true`; error matches `/Namesbase 5 is not defined/`.

22. **Integration: missing pack → error.**
    - `globalThis.pack = undefined`. Result `isError: true`; error
      matches `/not found/` (since `findCulture` returns null when
      `pack.cultures` is missing).

23. **Integration: pack present but pack.burgs missing → error from listBurgsForCulture.**
    - `globalThis.pack = { cultures: [...] }` (no burgs key).
    - Result `isError: true`; error matches `/window.pack.burgs is not available/`.

24. **Integration: missing Names global → error from generate (only triggered when there's an active burg to process).**
    - Pack has cultures and one active burg in culture 3.
    - `globalThis.Names = undefined`.
    - Result `isError: true`; error matches `/Names.getCulture is not available/`.
    - The burg's name is unchanged (failure happened on first burg
      before any `apply`).

25. **Integration: Wildlands (culture 0) is resolvable when its base is valid.**
    - Cultures has `pack.cultures[0] = { i: 0, name: "Wildlands", base: 0 }`.
    - Burgs has `{ i: 7, name: "OldWild", culture: 0 }`.
    - `nameBases[0]` exists.
    - Execute `{ culture: 0 }` and `{ culture: "wildlands" }` separately. Both should resolve culture 0 and rename burg 7.

## Verification

- `npm test` — all green (existing tests + new regenerate-culture-burgs tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0 info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** Mirrors `cultureRegenerateBurgs` exactly:
  resolves a single culture, checks `nameBases[culture.base]`,
  iterates `pack.burgs.filter(b => b.culture === id && !b.removed && !b.lock)`,
  sets `b.name = Names.getCulture(cultureId)`. The legacy
  `tip(...)` "success" toast is replaced with our structured
  `okResult` payload (the AI doesn't read on-screen tips). The
  legacy `customization === 4` early-return is irrelevant here —
  that's a heightmap-edit guard for the UI, not a data invariant
  that the AI needs to honor (and the AI has its own customization
  guards on map-rebuild tools).
- **Wildlands choice documented.** Chose to ALLOW culture 0,
  because (a) the editor template wires the regenerate button to
  every row including row 0, and (b) the only real constraint is
  that the namesbase resolves — which the existing
  `nameBases[culture.base]` check already enforces. The result is
  consistent with the legacy editor behavior. Tests §4 and §25
  exercise the Wildlands path.
- **Locked burgs explicitly verified.** Test §12 builds a shared
  `burgsList` so the runtime's `apply` mutates the same burg objects
  the test inspects after. The locked burg's `name` field is
  asserted unchanged AFTER the call — this is the load-bearing
  check the prompt requires.
- **Removed burgs also explicitly verified** in test §1 and §20
  (integration). We mirror the legacy editor's `!b.removed` guard.
- **`previous_name` per burg.** Test §1 asserts the exact `renamed`
  array including `previous_name` for each. Captured at the moment
  the runtime returns burg refs (BEFORE we call `apply`), so any
  regression that captured `previous_name` from `pack.burgs` AFTER
  mutation would fail.
- **`Names.getCulture` called per-burg.** Test §1 asserts
  `generate.mock.calls.length === 3`, all with culture id `3`. The
  legacy editor calls `Names.getCulture(cultureId)` once per burg,
  not once total — each call produces a different name because
  `getBase` walks a Markov chain with random seeds. Our runtime
  contract preserves that (one `runtime.generate(culture.i)` call
  per burg).
- **No-rollback contract documented.** Tests §13 and §15 pin this:
  if a mid-loop call throws, `apply` calls already issued for prior
  burgs ARE preserved. Same shape as `regenerate-all-burg-names`
  (which goes one step further and uses `try/catch` per burg with
  skip; we choose the simpler "stop and surface" because the AI is
  likely to retry with a fixed namesbase, and partial loops produce
  inconsistent observable state).
- **Cap at 50 documented + tested.** Test §16 (truncation kicks in
  at >50) and §17 (no `renamed_truncated` flag at <=50). The cap
  matters because cultures can have hundreds of burgs and we don't
  want to bloat the AI's context window.
- **Custom validator (not `parseEntityRef`) for `culture` ref.**
  We need to allow culture 0 (Wildlands), but `parseEntityRef`
  rejects 0. Inline validator: integer >=0 OR non-empty string.
- **Error message shape consistency.** "X is not available; the map
  hasn't finished loading." matches what other tools use. "Culture X
  not found." matches per-entity tools. "Namesbase X is not defined;
  cannot regenerate." mirrors the legacy UI tip wording. "Cannot
  regenerate burgs for removed culture X." follows the
  `set-burg-culture` "Cannot change culture on burg 0 (the
  placeholder entry)." template.
- **Default runtime's findCulture special-cases Wildlands.**
  `findEntityByRef` skips index-0 entries via the
  `if (typeof ref === "number") { if (... ref <= 0) return null; }`
  guard and via `isActive` (which excludes `i <= 0`). To resolve
  culture 0 we need a custom code path before delegating, identical
  to `set-burg-culture`'s `isWildlandsRef` helper.
- **Default runtime's hasNamesbase tolerates missing global.**
  `Array.isArray(bases)` guard, then `bases[base]` index access. If
  `nameBases` is undefined or `culture.base` is out of range, we
  return false — which the tool surfaces as "Namesbase X is not
  defined".
- **Default runtime's listBurgsForCulture throws on missing pack.burgs.**
  This is the only "missing pack" path we surface as a structured
  error (rather than swallowing). It's important because if the
  call SUCCEEDED with an empty list, we'd report `renamed_count: 0`
  for a culture that legitimately has burgs — that's a silent
  data-loss bug. The throw forces the AI to know the map isn't
  loaded.
- **DOM update is best-effort.** `apply()` checks
  `typeof document !== "undefined"` and uses optional chaining on
  `document.getElementById(...)`. In Vitest (Node, no jsdom), this
  is `undefined` and the DOM step is skipped silently. In the
  browser, the burg label SVG node is updated in-line. Test §20
  injects a fake `document.getElementById` to verify the DOM call
  happens.
- **Alphabetical insertion in `src/ai/index.ts`.**
  `regenerate-burg-name` (`reg…burg-n`) < `regenerate-culture-burgs`
  (`reg…cu`) < `regenerate-diplomacy` (`reg…di`). Verified by
  reading lines 186–187 of the current index. The re-export block
  uses the same ordering. The registry registration is grouped
  topically with the other regenerate-burg-name cousins.
- **Self-check: would a "did not skip locked burgs" regression be
  caught?** Test §12 asserts the locked burg's `name` field is
  STILL `"Stuck"` after the call. A regression that called `apply`
  on locked burgs would either set the name to `"Generated"`
  (failing the equality assertion), or call `apply` with id 2
  (failing the `apply.mock.calls` assertion). Both safety nets
  trigger. ✓
- **Self-check: would a "captured previous_name after mutation"
  regression be caught?** Test §1 asserts the `renamed` array's
  `previous_name` values are `"Old1"`, `"Old2"`, `"Old3"` (the
  pre-call names). If the implementation captured `previous_name`
  from `pack.burgs[i].name` AFTER calling `apply`, the values would
  be the `New*` strings instead. The runtime's `apply` is a `vi.fn`
  in unit tests so it doesn't actually mutate the test's burg
  objects — but if the implementation does the wrong thing, it
  would re-read the (mutated) burg name from a stale closure. To
  defend further, the test §12 (which uses real shared objects)
  also implicitly checks this: if `previous_name` were captured
  after, it would equal the new name, not the old.

## Corrections (added during step 5 review)

Re-read both files. Verified:

- **Test §12 ("locked burgs not touched") is present and reads `.name`
  AFTER the call.** It uses a shared `burgsList` array, calls the
  tool, and then asserts `burgsList[1].name === "Stuck"`. Load-bearing.
- **Test §1 captures `previous_name` correctly.** `renamed[i].previous_name`
  equals the original name; the array builder reads `burg.name`
  BEFORE `apply` is invoked.
- **Schema `required: ["culture"]` is present and tested in §19.**
  `tool.input_schema.required` is asserted to deep-equal `["culture"]`.
- **No accidental rename of the placeholder culture-0 burgs when the
  user passes a different culture.** The tool calls
  `runtime.listBurgsForCulture(culture.i)` with the resolved culture's
  id, so culture-0 burgs are only listed when `culture.i === 0`.
  Test §1 (which uses culture 3) does NOT include any culture-0
  burgs, so we don't directly test "no leakage" — but the runtime
  contract is single-culture-by-id, so leakage isn't possible
  without a runtime bug.
- **Integration test §20 verifies "no other burgs touched" by
  including a culture-1 burg and asserting its name unchanged after
  the call.** Added explicitly.
- **Cap value (50) matches the documented behavior.** §16 asserts
  truncation at >50, §17 asserts no truncation at exactly 30 (well
  below the boundary). I considered adding a boundary test at
  exactly 50 (no truncation expected) but decided the two existing
  cases are enough — the implementation is `if (renamed.length > 50)`,
  which is strictly greater than, so the boundary is unambiguous.
- **`base: null` early-return short-circuits before `hasNamesbase`.**
  Test §8 asserts `hasNamesbase` is never called in this branch
  (we don't have a numeric base to pass in). Verified the tasks file
  spells this out in step 4 of the execute flow.
