# Plan 345: `generate_namesbase_examples` tool

## Use case

Add an AI chat tool `generate_namesbase_examples` that generates N
example names from a single namesbase. This mirrors the legacy
`updateExamples` function in `public/modules/ui/namesbase-editor.js`
(around line 66), wired to the "Examples" button in the namesbase
editor:

```js
function updateExamples() {
  const base = +document.getElementById("namesbaseSelect").value;
  let examples = "";
  for (let i = 0; i < 7; i++) {
    const example = Names.getBase(base);
    if (example === undefined) {
      examples = "Cannot generate examples. Please verify the data";
      break;
    }
    if (i) examples += ", ";
    examples += example;
  }
  document.getElementById("namesbaseExamples").innerHTML = examples;
}
```

The user can already trigger this via the "Examples" button in the
namesbase editor (which generates 7 names). The AI cannot.

We already have many namesbase tools:

- `add_namesbase`, `list_namesbases`, `rename_namesbase`
- `set_namesbase_duplication`, `set_namesbase_length_range`,
  `set_namesbase_multiword_rate`, `set_namesbase_names`
- `restore_default_namesbases` (plan 332)
- `analyze_namesbase` (plan 333 — pure read diagnostic)

This plan adds the missing **preview/generate** action — useful for
the AI to show the user what names will look like before adopting a
namesbase, or to sanity-check after editing.

The tool is **pure read** — it must NOT mutate `nameBases` or any
other state. The underlying `Names.getBase(i)` call may lazily
populate `Names.chains[i]` on its first call (which is read-then-cache
behaviour, NOT a model mutation), but the namesbase data itself is
untouched.

## Lint baseline

`npm run lint 2>&1 | tail -50` on the worktree base
(branch `plan-345-generate-namesbase-examples`, master @ 1521f58,
working tree clean for `src/`) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 793 files in 630ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this.

## Behavior

- Resolve a single namesbase by `index` or `current_name` (use the
  existing helpers `findNamesbaseByIndex` / `findNamesbasesByName`
  from `rename-namesbase.ts`).
- Default `count` = 7 (matches the legacy editor exactly). Allow
  override via input, capped to a sane upper bound of 50 (preventing
  the AI from accidentally requesting hundreds).
- Loop `count` times, calling `Names.getBase(index)` each iteration.
  - If a call returns `undefined`, stop early and return what we have
    so far with `examples_truncated: true`.
  - If a call returns any non-undefined value (including the legacy
    `"ERROR"` sentinel string), include it. We mirror the editor's
    behaviour exactly — the editor only checks `=== undefined`.
- Pure read tool. Do NOT mutate any state.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "index": {
      "type": "integer",
      "minimum": 0,
      "description": "Namesbase array index."
    },
    "current_name": {
      "type": "string",
      "description": "Current namesbase name (case-insensitive trimmed exact match)."
    },
    "count": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 7,
      "description": "Number of example names to generate (1-50, default 7)."
    }
  }
}
```

At least one of `index` / `current_name` must be supplied.

### Validation

- At least one of `index` / `current_name` (use existing helpers).
- `Names.getBase` must be a function.
- `nameBases` must exist and be an array.
- `count`, when provided, must be an integer in `[1, 50]`. When
  omitted (`undefined` or `null`), defaults to `7`.
- Identification mirrors `set_namesbase_multiword_rate` exactly:
  - At least one of index / current_name.
  - When both provided, they must agree.
  - Ambiguous current_name returns the candidate list.
  - Invalid index types (non-finite, non-integer, negative) → error.
  - Empty / whitespace / non-string current_name → error.

### Errors (verbatim)

- `"Provide either index or current_name to identify the namesbase."`
- `"index must be a non-negative integer."`
- `"current_name must be a non-empty string."`
- `"No namesbase found at index ${index}."`
- `"No namesbase found with name ${name}."`
- `"Multiple namesbases match name ${name}. Disambiguate by index."`
  (with `candidates: [{index, name}, ...]`)
- `"index and current_name disagree."`
- `"count must be an integer in [1, 50]."`
- `"window.nameBases is unavailable. Generate or load a map first."`
- `"Names.getBase is not available; the map hasn't finished loading."`
- Runtime errors thrown by `Names.getBase` are propagated via
  `errorResult(err.message)`.

### Success result

```jsonc
{
  "ok": true,
  "index": 1,
  "name": "Elvish",
  "requested_count": 7,
  "examples": ["Aeloria", "Galanis", "Mirethel", ...],
  "examples_truncated": false  // true if Names.getBase returned undefined before reaching count
}
```

When `examples_truncated` is `true`, `examples.length < requested_count`.
When `false`, `examples.length === requested_count`.

## Files

- **NEW** `src/ai/tools/generate-namesbase-examples.ts` — the tool.
  Exports:

  - `interface GenerateNamesbaseExamplesResult { index: number; name: string; requested_count: number; examples: string[]; examples_truncated: boolean; }`
  - `interface GenerateNamesbaseExamplesRuntime`:
    ```ts
    {
      /**
       * Returns the live `window.nameBases` array. Throws when the
       * global is missing or not an array.
       */
      getNameBases(): NameBaseLike[];
      /**
       * Calls `Names.getBase(index)` once. Returns the generated name
       * (string), or `undefined` to signal the generator failed for
       * this iteration (matches the legacy editor's truncation
       * trigger). Throws if `Names` / `Names.getBase` is unavailable;
       * the tool catches and surfaces this as a clean error.
       */
      generateOne(index: number): string | undefined;
    }
    ```
  - `defaultGenerateNamesbaseExamplesRuntime`:
    - `getNameBases()`: same pattern as `analyze-namesbase.ts` — reads
      `getGlobal<unknown>("nameBases")`, throws
      `"window.nameBases is unavailable. Generate or load a map first."`
      when missing or non-array.
    - `generateOne(index)`:
      ```ts
      const names = getGlobal<{ getBase?: (i: number) => unknown }>("Names");
      if (!names || typeof names.getBase !== "function") {
        throw new Error(
          "Names.getBase is not available; the map hasn't finished loading."
        );
      }
      const value = names.getBase(index);
      return typeof value === "string" ? value : undefined;
      ```
      Note: the runtime treats anything-non-string as `undefined`
      (which triggers truncation). This is defensive — the legacy
      generator returns a string in success and `"ERROR"` (still a
      string) in some failure paths, but if a future change ever
      returns `undefined` we want the tool to truncate cleanly.
  - `createGenerateNamesbaseExamplesTool(runtime?)` returning a `Tool`
    named `generate_namesbase_examples`.
  - `generateNamesbaseExamplesTool` — default-runtime instance.

  **Tool execute flow:**
  1. Parse input as `{ index?, current_name?, count? }`.
  2. **Validate `count` first** (independent of identification):
     - If `count === undefined || count === null` → `effectiveCount = 7`.
     - Else require `typeof count === "number"`, `Number.isFinite`,
       `Number.isInteger`, `count >= 1`, `count <= 50`. Otherwise
       error `"count must be an integer in [1, 50]."`.
     - Note: a string like `"3"` fails the `typeof number` check and
       hits the same error.
  3. Identification block — **identical structure to
     `set_namesbase_multiword_rate.ts`**:
     - Require at least one of index / current_name.
     - Validate index (non-negative finite integer) and current_name
       (non-empty trimmed string).
     - Catch `runtime.getNameBases()` failures.
     - Resolve via `findNamesbaseByIndex` / `findNamesbasesByName`.
     - Reject ambiguous matches with candidates.
     - Reject disagreement.
  4. Loop `effectiveCount` times:
     ```ts
     const examples: string[] = [];
     let truncated = false;
     for (let i = 0; i < effectiveCount; i++) {
       let value: string | undefined;
       try {
         value = runtime.generateOne(target.index);
       } catch (err) {
         return errorResult(err instanceof Error ? err.message : String(err));
       }
       if (value === undefined) {
         truncated = true;
         break;
       }
       examples.push(value);
     }
     ```
  5. Return:
     ```ts
     return okResult({
       index: target.index,
       name: target.name,
       requested_count: effectiveCount,
       examples,
       examples_truncated: truncated,
     });
     ```

- **NEW** `src/ai/tools/generate-namesbase-examples.test.ts` — Vitest
  spec (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { generateNamesbaseExamplesTool } from "./tools/generate-namesbase-examples";`
    in the alphabetical import block under `g`. The import block
    already runs `focusOnMapTool` (line 90) → `getBiomeDistributionTool`
    (line 91). Insert the new import between them:
    ```ts
    import { focusOnMapTool } from "./tools/focus-on-map";
    import { generateNamesbaseExamplesTool } from "./tools/generate-namesbase-examples";
    import { getBiomeDistributionTool } from "./tools/get-biome-distribution";
    ```
  - Add the re-export block immediately after the `focus-on-map`
    re-export block (around line 1196):
    ```ts
    export {
      createGenerateNamesbaseExamplesTool,
      defaultGenerateNamesbaseExamplesRuntime,
      type GenerateNamesbaseExamplesResult,
      type GenerateNamesbaseExamplesRuntime,
      generateNamesbaseExamplesTool,
    } from "./tools/generate-namesbase-examples";
    ```
  - Add `registry.register(generateNamesbaseExamplesTool);` at the end
    of the registration block (after the last `registry.register(...)`
    call), matching the convention used by recent plan tools.

## Tests (Vitest)

Mirror the layout of `analyze-namesbase.test.ts` (unit + integration
+ registry round-trip describe blocks). All tests stub the runtime so
they don't depend on the legacy boot.

Helper:

```ts
function makeRuntime(overrides: Partial<GenerateNamesbaseExamplesRuntime> = {}): {
  runtime: GenerateNamesbaseExamplesRuntime;
  getNameBases: ReturnType<typeof vi.fn<GenerateNamesbaseExamplesRuntime["getNameBases"]>>;
  generateOne: ReturnType<typeof vi.fn<GenerateNamesbaseExamplesRuntime["generateOne"]>>;
} {
  const getNameBases = vi.fn<GenerateNamesbaseExamplesRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const generateOne = vi.fn<GenerateNamesbaseExamplesRuntime["generateOne"]>(
    overrides.generateOne ?? (() => "Name"),
  );
  return { runtime: { getNameBases, generateOne }, getNameBases, generateOne };
}
```

### `generate_namesbase_examples tool` (unit, runtime stubbed)

1. **Happy path: count omitted → defaults to 7.**
   - Bases: `[{ name: "Generic", b: "x,y,z" }]`.
   - `generateOne` returns deterministic strings: call N → `"name${N}"`.
   - Execute `{ index: 0 }`.
   - Body:
     ```jsonc
     {
       ok: true,
       index: 0,
       name: "Generic",
       requested_count: 7,
       examples: ["name1", "name2", "name3", "name4", "name5", "name6", "name7"],
       examples_truncated: false,
     }
     ```
   - `generateOne` called exactly 7 times, each with arg `0`.

2. **count=1 boundary: produces a single example.**
   - Same fixture; `count: 1`. Body has `requested_count: 1`,
     `examples.length === 1`, `examples_truncated: false`.
   - `generateOne` called exactly once.

3. **count=50 upper boundary: produces 50 examples.**
   - Same fixture; `count: 50`. `examples.length === 50`,
     `examples_truncated: false`.
   - `generateOne` called exactly 50 times.

4. **count=0 → error.**
   - Execute `{ index: 0, count: 0 }`.
   - `result.isError === true`; body `error` exactly
     `"count must be an integer in [1, 50]."`.
   - `generateOne` NOT called.

5. **count=51 → error.**
   - Execute `{ index: 0, count: 51 }`.
   - `result.isError === true`; same error.
   - `generateOne` NOT called.

6. **count="3" string → error.**
   - Execute `{ index: 0, count: "3" }`.
   - `result.isError === true`; same error.
   - `generateOne` NOT called.

7. **count=1.5 non-integer → error.**
   - Execute `{ index: 0, count: 1.5 }`.
   - Same error.

8. **count=NaN / Infinity → error.**
   - Both rejected with same error.

9. **count=null → defaults to 7 (same as omitted).**
   - Execute `{ index: 0, count: null }`. Body has
     `requested_count: 7`, `examples.length === 7`.

10. **Truncation mid-loop: `generateOne` returns `undefined` on call 4.**
    - `generateOne` returns `"a"`, `"b"`, `"c"`, then `undefined`.
    - Execute `{ index: 0, count: 7 }`.
    - Body:
      ```jsonc
      {
        ok: true,
        index: 0,
        name: "Generic",
        requested_count: 7,
        examples: ["a", "b", "c"],
        examples_truncated: true,
      }
      ```
    - `generateOne` called exactly 4 times (the 4th returned undefined,
      which broke the loop — no 5th, 6th, 7th call).

11. **Truncation on first call: `generateOne` returns `undefined`
    immediately.**
    - `generateOne` returns `undefined` always.
    - Execute `{ index: 0, count: 5 }`.
    - Body:
      ```jsonc
      {
        ok: true,
        index: 0,
        name: "Generic",
        requested_count: 5,
        examples: [],
        examples_truncated: true,
      }
      ```
    - `generateOne` called exactly once.

12. **Identification: by index.**
    - Bases `[{name: "A", b: "x,y"}, {name: "B", b: "p,q"}]`.
    - Execute `{ index: 1 }`. Body has `index: 1, name: "B"`.
    - `generateOne` called with arg `1`.

13. **Identification: by current_name (case-insensitive).**
    - Same fixture; `{ current_name: "a" }`. Body has `index: 0, name: "A"`.

14. **Identification: both supplied and agree.**
    - `{ index: 1, current_name: "B" }` → ok, `index: 1`.

15. **Identification: both supplied and disagree.**
    - `{ index: 0, current_name: "B" }` → error
      `"index and current_name disagree."`.

16. **Identification: ambiguous current_name returns candidates.**
    - Bases `[{name:"Dup", b:"a,b"}, {name:"Dup", b:"c,d"}]`.
    - `{ current_name: "Dup" }` → error
      `/Multiple namesbases match name Dup/`, candidates includes
      both indices.

17. **Identification: name not found.**
    - `{ current_name: "Ghost" }` → error
      `"No namesbase found with name Ghost."`.

18. **Identification: index out of range.**
    - `{ index: 5 }` → error `"No namesbase found at index 5."`.

19. **Identification: rejects negative / non-integer / non-finite /
    non-numeric index.**
    - For `[-1, 1.5, NaN, Infinity, "0"]`, error
      `"index must be a non-negative integer."`.

20. **Identification: errors when neither index nor current_name is
    provided.**
    - `{}` → error
      `"Provide either index or current_name to identify the namesbase."`.

21. **Identification: rejects empty / whitespace / non-string
    current_name.**
    - For `["", "   ", 42]`, error
      `"current_name must be a non-empty string."`.

22. **Surfaces runtime getNameBases failures.**
    - `getNameBases()` throws `new Error("nameBases missing")`.
    - Body error matches `/nameBases missing/`.

23. **Surfaces `generateOne` throws.**
    - `generateOne` throws on call 2: returns `"x"`, then throws.
    - Body error matches the thrown message.
    - `generateOne` called twice (the throw happened on the 2nd).

24. **Missing `Names.getBase` (default runtime) → exact error.**
    - Use the default runtime in the integration block (see below).
    - Execute with `globalThis.Names = undefined`. Body error exactly
      `"Names.getBase is not available; the map hasn't finished loading."`.

25. **PURITY: original nameBases array reference unchanged after the
    call (LOAD-BEARING).**
    - Bases:
      ```ts
      const bases = [{ name: "X", b: "a,b,c" }];
      const arrayBefore = bases;
      const entryBefore = bases[0];
      const corpusBefore = bases[0].b;
      ```
    - Execute `{ index: 0, count: 7 }`.
    - Assertions:
      - `bases === arrayBefore` (array identity preserved).
      - `bases[0] === entryBefore` (entry identity preserved).
      - `bases[0].b === corpusBefore` (corpus untouched).
      - `bases.length === 1` (no entries added/removed).
      - `Object.keys(bases[0]).sort()` matches the original keys.
    - **MANDATORY** per the prompt — verifies the tool is pure-read.

26. **Tool name + schema + registry round-trip.**
    - `expect(generateNamesbaseExamplesTool.name).toBe("generate_namesbase_examples");`
    - `expect(generateNamesbaseExamplesTool.input_schema.type).toBe("object");`
    - `expect(generateNamesbaseExamplesTool.input_schema.required).toBeUndefined();`
    - The schema has properties `index`, `current_name`, `count`.
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("generate_namesbase_examples")`.

27. **Registry round-trip: runs through the registry and returns ok.**
    - Set `globalThis.nameBases` and `globalThis.Names` (integration
      block). Run `registry.run("generate_namesbase_examples", { index: 0, count: 3 })`.
    - Body has `ok: true`, `examples.length === 3`.

28. **Tolerates null / undefined / extraneous input properties.**
    - `tool.execute(null)` and `tool.execute(undefined)` both return
      the "provide either index or current_name" error (no crash).
    - `tool.execute({ index: 0, count: 3, bogus: "x" })` ok.

29. **Order of validation: count is checked BEFORE identification.**
    - Execute `{ count: -1 }` (no identification fields). Body error
      is exactly `"count must be an integer in [1, 50]."` (NOT the
      "provide either" error). This pins down the validation order
      so an invalid count is reported even when the namesbase is
      unspecified.

### `defaultGenerateNamesbaseExamplesRuntime (integration)`

Save and restore `globalThis.nameBases` and `globalThis.Names` per
test.

30. **End-to-end with populated globals.**
    - `globalThis.nameBases = [{ name: "X", b: "a,b,c" }]`.
    - `globalThis.Names = { getBase: vi.fn().mockReturnValue("Stub") }`.
    - Execute `generateNamesbaseExamplesTool.execute({ index: 0, count: 5 })`.
    - Body has `ok: true`, `examples: ["Stub", "Stub", "Stub", "Stub", "Stub"]`,
      `examples_truncated: false`.
    - `Names.getBase` called 5 times, each with arg `0`.
    - `nameBases[0]` reference preserved.

31. **Integration: missing nameBases → exact error.**
    - `globalThis.nameBases = undefined`. Error matches
      `/window\.nameBases is unavailable/`.

32. **Integration: nameBases not an array → same error.**
    - `globalThis.nameBases = { not: "array" }`.

33. **Integration: missing Names → exact error.**
    - `globalThis.nameBases = [{ name: "X", b: "a,b" }]`.
    - `globalThis.Names = undefined`. Error exactly
      `"Names.getBase is not available; the map hasn't finished loading."`.

34. **Integration: Names.getBase not a function → same error.**
    - `globalThis.Names = { getBase: "not a function" }`.

35. **Integration: Names.getBase returns non-string → treated as
    truncation.**
    - `globalThis.Names = { getBase: () => 42 }`. Body has
      `examples: []`, `examples_truncated: true` (the runtime
      `generateOne` returns `undefined` for non-string values, which
      triggers truncation).

36. **Integration: PURITY (LOAD-BEARING).**
    - `globalThis.nameBases = [{ name: "X", b: "a,b,c" }]`.
    - Capture `arrayBefore`, `entryBefore`, `corpusBefore`.
    - Run the tool. Assert all three identities preserved and
      `bases[0].b === corpusBefore`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings,
  0 info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **Use case fidelity.** Mirrors `updateExamples` exactly: loops 7
  times by default, calls `Names.getBase(base)`, treats `undefined`
  as the stop signal. Default count of 7 matches the legacy hardcoded
  `for (let i = 0; i < 7; i++)`. The legacy editor's
  "Cannot generate examples. Please verify the data" string is
  represented by the `examples_truncated: true` flag (with the
  partial examples still returned, which is more useful to the AI
  than the legacy "all-or-nothing" behaviour).
- **Truncation test (Names.getBase returns undefined mid-loop) is
  present.** Test §10 covers mid-loop truncation (returns 3 strings
  then undefined; asserts `examples.length === 3`,
  `examples_truncated: true`, `generateOne` called exactly 4 times).
  Test §11 covers truncation on the very first call (zero examples,
  truncated true).
- **Purity test (no mutations) is present.** Test §25 captures
  array identity, entry identity, AND the corpus value before the
  call, then asserts identity equality after. Test §36 mirrors the
  same checks at the integration level. The implementation is
  pure-read by construction — it only ever calls `runtime.getNameBases()`
  and `runtime.generateOne(index)`, neither of which mutates anything.
- **Default count behaviour is tested.** Test §1 omits `count`
  entirely and asserts `requested_count: 7` and 7 examples.
  Test §9 explicitly passes `count: null` and asserts the same
  default. Test §28 also exercises `null`/`undefined` input objects
  for tolerance.
- **count boundary tests.** §2 (count=1, lower bound), §3 (count=50,
  upper bound), §4 (count=0, just below lower), §5 (count=51, just
  above upper). All four boundary cases pinned.
- **count type coercion.** §6 ("3" string), §7 (1.5 non-integer),
  §8 (NaN / Infinity) — all rejected. The implementation must use
  `typeof === "number" && Number.isInteger` to satisfy these.
- **Validation order.** Test §29 pins down that count is validated
  BEFORE identification — passing only `{ count: -1 }` returns the
  count error, not the "provide either index or current_name" error.
  This matches the structure of `set_namesbase_multiword_rate.ts`,
  where the action-parameter (`multiword_rate`) is validated first
  (see lines 97–107 of that file).
- **Identification parity with namesbase setter family.** Tests
  §12–§21 mirror the analyze-namesbase identification suite exactly.
  All eight identification modes (by index, by name, both agree,
  both disagree, ambiguous, not found, out of range, invalid index
  type, missing both, invalid current_name type) are covered.
- **Integration block.** Tests §30–§36 exercise the default runtime
  with real `globalThis.nameBases` and `globalThis.Names`. Save +
  restore in `beforeEach` / `afterEach` matches the
  `analyze-namesbase.test.ts` pattern.
- **Non-string return defensive handling.** Test §35 documents that
  the default runtime treats a non-string return from `Names.getBase`
  as `undefined` (truncation). This is defensive — the legacy code
  always returns a string, but if a future change ever returns
  something else we want graceful truncation instead of leaking weird
  values into the result. Documented in the runtime's `generateOne`
  description as well.
- **Tool schema.** Per the prompt: `properties` has `index`,
  `current_name`, `count`; no `required` array (since exactly one of
  index/current_name is required, which JSON Schema can't express
  cleanly without `oneOf`/`anyOf` — same convention as
  `analyze_namesbase` and `set_namesbase_multiword_rate`).
- **Registry slot.** Plan places the registration at the end of the
  list with the most-recently-added bulk tools, matching the
  convention used by recent plans (343, 342, etc.). The import +
  re-export are alphabetically correct under `g`.

## Corrections (added during step 5 review)

Re-read both files. No structural corrections needed — the plan
covers all three mandatory checks (truncation, purity, default
count) with explicit tests. The two minor refinements made during
review:

- **Validation order test (§29) added** to pin down that count is
  validated before identification. Without this test, a future
  refactor that reorders validation could silently change error
  messages without breaking any test.
- **Non-string return test (§35) added** to document the runtime's
  defensive handling. Without this test, the runtime's
  `typeof value === "string" ? value : undefined` line is untested
  and could be silently removed.
